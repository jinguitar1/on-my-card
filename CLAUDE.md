# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Expo SDK 57

This project is on Expo SDK 57 / React Native 0.86 / React 19.2. APIs have shifted
significantly from older SDKs. Before writing or changing any Expo/RN code, consult the
exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ — do not rely on memory
of older Expo versions.

## Commands

```bash
npm start            # Start Metro / Expo dev server (QR code for Expo Go)
npm run ios          # Open in iOS Simulator
npm run android      # Open in Android emulator
npm run web          # Run in the browser (react-native-web)

npx tsc --noEmit     # Type-check (no dedicated lint or test setup exists)
npx expo-doctor      # Validate project health / dependency compatibility
npx expo install <pkg>   # Add deps at SDK-compatible versions (use instead of npm install)
```

There is no test runner, linter, or CI configured. `npx tsc --noEmit` is the only
automated check.

## Architecture

**[DESIGN-FRAMEWORK.md](DESIGN-FRAMEWORK.md) is the source of truth** for what this app is
and why every mechanic exists (the five-part app model + the research behind it). Read it
before changing behavior.

**On My Card** (schema v4): **one fixed 5×5 card** — that's the only option this app
offers. There is no typing at setup: onboarding presents pre-researched tile ideas one at a
time (`src/domain/tileBank.ts`, ~80 items across 8 categories) and the user **swipes right
to keep, left to skip** (`src/screens/SwipeDeckScreen.tsx`) until 24 are kept (or the bank
runs out, in which case the skipped pile gets one shuffled second pass). Centre cell is a
permanent FREE space. Cross a tile off (`doneAt`); a completed row/column/diagonal is a
**bingo** (checkpoint, reward ladder at 1/6/12 bingos); the card is **done when all 24
tiles are crossed off**. There is exactly one card, ever — no card list, no `cardId`
anywhere, no multi-card/sprint/habit-tile machinery (all removed in the pivot from this
app's earlier goal-tracking/questionnaire design).

Onboarding is 3 phases (`src/screens/OnboardingNavigator.tsx`): **Welcome** (one bold line
+ a burst of colored shapes, no bullet points) → **deck** (`SwipeDeckScreen`) → **Reveal**
(the assembled grid stamps in with confetti; "Enter my card" is what actually flips
`settings.onboardingComplete` — see the stale-ref/ordering note below for why that's a
separate flag from `card` existing). Design principle throughout: **less text, more
geometry and color** — the swipe cards lead with emoji + a 2–5 word label; the note is
behind a tap, never shown by default.

- [index.ts](index.ts) — entry point; `registerRootComponent(App)`.
- [App.tsx](App.tsx) — providers only: `SafeAreaProvider` › `AuthProvider` › `AppProvider`
  › `SoundProvider` › `RootNavigator`; calls `configureNotifications()` once.
- [src/domain/](src/domain/) — `types.ts` (fixed-grid constants `GRID`/`CELL_COUNT`/
  `CENTER`/`CAPACITY`/`LINE_CELLS`, `TileCategory` + `CATEGORY_ACCENTS`), `logic.ts` (pure
  fixed-grid selectors — `lineLabel`, `isLineComplete`, `bingoCount`, `nearMissLines`,
  `isCardComplete`, reward selectors — nothing persists/mutates), `tileBank.ts` (the
  curated `TileIdea` bank + `shuffle`/`buildDeck`/`randomSuggestions`), `seed.ts`
  (`emptyState()` only — `card: null`).
- [src/storage/](src/storage/) — `Repository` interface (`load`/`save`/`clear`) +
  `LocalRepository` (AsyncStorage JSON blob, key `onmycard:appstate:v4`, plus a parallel
  `:updatedAt` key used for sync conflict resolution). `src/storage/index.ts` exports the
  singleton, now a **`SyncRepository`** — **local is always the fast path**: `load`/`save`/
  `clear` hit AsyncStorage only and return before any network call starts; a signed-in push
  to Supabase happens in the background and never blocks or throws into the UI.
  `remoteRepository.ts` holds the raw Supabase queries against `public.app_state`
  (one JSONB row per user, RLS-scoped to `auth.uid()`). `SyncRepository.setUser(userId)`
  is called by `AppStateContext` on every auth change; `reconcile()` runs once per
  sign-in — last-write-wins by comparing the remote row's `updated_at` against the local
  `:updatedAt` marker (a known v1 simplification for the single-device-at-a-time case).
  `LocalRepository.load()` returns the blob exactly as stored, including its own
  `schemaVersion` — it must never rewrite that field itself; only `AppStateContext`'s
  hydrate compares it against the current `SCHEMA_VERSION` and discards a mismatch. (A
  prior bug here silently upgraded the version number on old-shaped data without
  transforming it, which crashed the app on old data — fixed by making load a pure
  passthrough, and the storage key is bumped on every schema change as a second line of
  defense.)
- [src/lib/supabaseClient.ts](src/lib/supabaseClient.ts) — the one `createClient()` call
  (session stored in AsyncStorage, `detectSessionInUrl: false` since sign-in never
  redirects through a URL). Reads `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` from `.env`
  (see `.env.example`; `.env` itself is gitignored).
- [src/auth/AuthContext.tsx](src/auth/AuthContext.tsx) — `useAuth()`: `session`,
  `status`, and email-OTP actions (`sendCode`, `verifyCode`, `signOut`). No passwords, no
  OAuth, no deep links — a user types their email, gets a one-time code (length isn't
  hardcoded on the client — Supabase's project config decides it, we've seen both 6 and 8
  digits), types it back (`src/screens/auth/SignInScreen.tsx`, a modal `Stack.Screen`).
  **Sign-in is always
  optional** — it never gates onboarding or the tabs (`RootNavigator`'s gate is still
  only `!settings.onboardingComplete || !state.card`); it's offered from a dismissible
  banner on `CardScreen` and a permanent row in `SettingsScreen`.
- [src/state/AppStateContext.tsx](src/state/AppStateContext.tsx) — `useApp()`. All state in
  `useState`, hydrate / debounced-persist / foreground (notif reconcile). Key actions:
  `createCard(kept)`, `renameCard`, `pressTile(cell): TileOutcome`, `setTile`/`clearTile`,
  reward CRUD, `updateSettings`, `resetAll`. **Every action that computes its next state by
  reading `stateRef.current` directly (rather than `setState(prev => ...)`) must call the
  `commitState()` helper, not `setState`**, so that `stateRef.current` is current for the
  *next* such action within the same synchronous call — see the note in
  DESIGN-FRAMEWORK.md §10; skipping this silently discards the earlier call's update.
  `pressTile` returns a synchronous `TileOutcome` computed from a before/after diff; a
  **celebration queue** (`celebration` / `dismissCelebration`) drives the root overlay.
- [src/feedback/](src/feedback/) — `haptics.ts` + `sound.ts` (settings-guarded via
  module-level flags the provider syncs) and `Celebration.tsx` (`Confetti`,
  `CelebrationOverlay` with `bingo` / `card` (full-card takeover) / `reward` variants — RN
  `Animated` only, no Reanimated).
- [src/notifications/scheduler.ts](src/notifications/scheduler.ts) — `reconcileNotifications(state)`
  schedules one `WEEKLY` check-in only if a card exists and it's enabled in Settings.
- [src/navigation/RootNavigator.tsx](src/navigation/RootNavigator.tsx) — onboarding gate
  (`!settings.onboardingComplete || !state.card`) → 3 tabs (Card / Rewards / Settings) +
  two modals (`TileSheet`, `SignIn`). Renders `CelebrationOverlay` at root.
- [src/screens/](src/screens/) — `OnboardingNavigator.tsx` (welcome/deck/reveal),
  `SwipeDeckScreen.tsx` (the keep/skip deck — `PanResponder` + `Animated.ValueXY`, no
  Reanimated/gesture-handler; a `forwardRef`/`useImperativeHandle` card lets the ✕/✓
  buttons drive the same animation as a drag), `CardScreen`, `RewardsScreen`,
  `SettingsScreen`, `TileSheetScreen` (swap/remove a filled tile; suggestion picker + "or
  type your own" for an empty one).
  [src/ui/](src/ui/) — `theme.ts` (warm paper-card tokens, `categoryColor`/`categoryWash`)
  + `components.tsx` (`CardTile`, `Stamp`, `BingoRail`, `RoundButton`, `RewardTicket`,
  `cardLayout`, buttons).

Sound assets are **generated**, not committed as source of truth: `npm run gen:sounds`
(→ `node scripts/gen-sounds.js`) synthesizes `assets/sounds/*.wav` (`stamp` / `tick` /
`chime` / `chord` / `fanfare` / `trophy`) from math.

## Config notes

- `app.json` sets `userInterfaceStyle: "light"` — the UI is designed light-only; there is
  no dark-mode palette.
- `.claude/settings.json` enables the official `expo` Claude Code plugin.
- Native `/ios` and `/android` folders are gitignored (managed workflow / prebuild on
  demand).
- Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase dashboard → Project Settings → API) before
  running — `src/lib/supabaseClient.ts` throws immediately at import time if either is
  missing. `.env` is gitignored; only `.env.example` is committed.
- Supabase project: `on-my-card` (`shcxirtjmkzffwghucls`, org `jin`, us-west-1). Schema:
  one migration, `public.app_state` (`user_id` PK / FK to `auth.users`, `state jsonb`,
  `schema_version`, `updated_at` auto-touched by trigger), RLS scoped to `auth.uid()`.
  Types in [src/lib/database.types.ts](src/lib/database.types.ts) are generated from
  this live schema — regenerate (Supabase types tool) rather than hand-editing whenever
  a migration changes it. The table and every column also carry SQL `comment on` text
  describing the full app flow (onboarding → local core loop → optional sign-in →
  background sync) — visible in the Supabase dashboard's Table Editor and via
  `obj_description`/`col_description`, so the flow is documented inside the database
  itself, not only in this file and DESIGN-FRAMEWORK.md. Keep those three in sync if the
  flow changes. That schema also still has empty, unused `boards` / `tiles` /
  `journal_entries` tables left over from an earlier relational-tables design for this
  same project — not read or written by this app; drop them in a migration if they're
  ever confirmed safe to remove. Auth: email OTP only — **the Magic Link email template
  in the dashboard must include `{{ .Token }}`** (Authentication → Email Templates →
  Magic Link) or users receive a link instead of the numeric code the sign-in screen
  expects.
