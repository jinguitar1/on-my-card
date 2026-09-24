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

Onboarding is 4 phases (`src/screens/OnboardingNavigator.tsx`): **Welcome** (one bold line
+ a burst of colored shapes, no bullet points) → **Intro** (a short, mostly-visual
explanation of what's about to happen — static ✕/✓ demo + one paragraph — added because
users were dropped straight into the swipe deck with no explanation of the gesture or
what building a card even meant) → **deck** (`SwipeDeckScreen`, which also carries a
persistent one-line reminder under the progress bar: "Swipe right to keep · left to
skip") → **Reveal** (the assembled grid stamps in with confetti; "Enter my card" is what
actually flips `settings.onboardingComplete` — see the stale-ref/ordering note below for
why that's a separate flag from `card` existing). Design principle throughout: **less
text, more geometry and color** — the swipe cards lead with emoji + a 2–5 word label; the
note is behind a tap, never shown by default. The Intro phase is the one deliberate
exception to "less text" — it's instructional, not marketing copy, and only shown once.

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
- [src/auth/AuthContext.tsx](src/auth/AuthContext.tsx) — `useAuth()`: `session`, `status`,
  email-OTP actions (`sendCode`, `verifyCode` — length isn't hardcoded on the client,
  Supabase's project config decides it, we've seen both 6 and 8 digits), plus
  `signInWithPassword` / `setPassword` / `sendRecoveryCode` / `verifyRecoveryCode`. The
  code is the one universal way in — every account can always fall back to it — password
  is a pure convenience layered on top, never a replacement: `setPassword` just calls
  `supabase.auth.updateUser({ password })` on the current session. Forgot-password is
  **code-based, not link-based** — `resetPasswordForEmail` + `verifyOtp({ ..., type:
  'recovery' })`, reusing the same code-entry UI as normal sign-in — because this app
  never handles deep-link redirects (confirmed against the installed `@supabase/auth-js`
  types: `EmailOtpType` includes `'recovery'`). No OAuth, no deep links otherwise.
  `src/screens/auth/SignInScreen.tsx` (a modal `Stack.Screen`) is a Code/Password
  `Segmented` toggle (defaults to Code); Password mode has a "Forgot password?" link that
  sends a recovery code down the same 'code' step (tagged `via: 'recovery'`), landing on
  'setPassword' with no "Skip" (recovery's whole point is setting a new one). A normal
  code sign-in also lands on 'setPassword', but skippable there — a one-time offer, not
  required. `SettingsScreen`'s Account section carries a permanent "Set or change
  password" row too, so it's never a one-shot-only offer.
  **Sign-in is always
  optional** — it never gates onboarding or the tabs (`RootNavigator`'s gate is still
  only `!settings.onboardingComplete || !state.card`). Discoverability was a real
  complaint (people dismissed the old banner once and then couldn't find sign-in again),
  so it's now surfaced three ways, none dismissible: a banner on `CardScreen` that always
  shows while signed out (no ✕ — a one-time-dismissible banner was the actual bug being
  fixed here), the very first section in `SettingsScreen` (moved above "The card" —
  previously it was last, below Activity, where people had to scroll to find it), and a
  small gold dot on the Settings tab icon (`RootNavigator`'s `tabIcon(emoji, dot?)`) that
  only shows while signed out.
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
- [src/ai/useInsight.ts](src/ai/useInsight.ts) — `useInsight('nudge' | 'reflection' |
  'breakdown', { periodType?, tileId?, auto? })`, the client for the `ai-insights` Edge
  Function ([supabase/functions/ai-insights](supabase/functions/ai-insights)).
  Deliberately **outside** `AppStateContext` — supplementary and online-only, so a
  failure here can never touch the core local-first state. Requires sign-in (the
  function reads `public.app_state`, which only exists once synced); callers gate on
  `useAuth().status === 'signedIn'`. Used by `CardScreen` (a "COACH" line, one nudge
  cached per calendar day — also proactively populated by `daily-coach-dispatch`, so
  it's usually already there rather than generated live), `SettingsScreen` (a
  "Reflection" section, weekly/monthly, one cached per ISO week/month) and
  `TileSheetScreen` (a per-tile "Get a plan" breakdown, `auto: false` since it's
  tap-triggered rather than generated every time the sheet opens; cache key is the
  tile's id instead of a date). A cache hit in `public.ai_insights` costs zero Claude
  calls — that table's unique `(user_id, kind, period)` index is both the cache and the
  rate limit; `refresh(true)` (a "Regenerate"/"Refresh" button) bypasses it via the
  function's `force` flag and upserts instead of inserting.
- [src/notifications/push.ts](src/notifications/push.ts) — remote push registration,
  separate from `scheduler.ts`'s local notifications. `registerForPush(coachHour)`
  requests permission, calls `Notifications.getExpoPushTokenAsync({ projectId })` (needs
  `app.json`'s `extra.eas.projectId`, populated by `eas init` — **not yet run**, see
  below) and upserts `public.push_prefs`; `setCoachHour`/`disablePush` update it without
  discarding the stored token. Fails quietly (returns `false`) rather than throwing —
  `SettingsScreen`'s "AI Coach" toggle shows a one-line explanation when that happens.
  Wired from `SettingsScreen`'s "AI Coach" section (signed-in only): a toggle + hour
  chips (including 3pm) alongside the existing Reflection section.
- [src/navigation/RootNavigator.tsx](src/navigation/RootNavigator.tsx) — onboarding gate
  (`!settings.onboardingComplete || !state.card`) → 3 tabs (Card / Rewards / Settings) +
  two modals (`TileSheet`, `SignIn`). Renders `CelebrationOverlay` at root.
- [src/screens/](src/screens/) — `OnboardingNavigator.tsx` (welcome/deck/reveal),
  `SwipeDeckScreen.tsx` (the keep/skip deck — `PanResponder` + `Animated.ValueXY`, no
  Reanimated/gesture-handler; a `forwardRef`/`useImperativeHandle` card lets the ✕/✓
  buttons drive the same animation as a drag), `CardScreen`, `RewardsScreen`,
  `SettingsScreen`, `TileSheetScreen` (swap/remove a filled tile; suggestion picker + "or
  type your own" for an empty one; a "Get a plan" AI breakdown for a filled tile — see
  `src/ai/useInsight.ts` above).
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
  ever confirmed safe to remove. Auth: email OTP only — **the Magic Link, Confirm
  signup, and Reset Password email templates in the dashboard must each include
  `{{ .Token }}`** (Authentication → Email Templates) or users receive a link instead of
  the numeric code the sign-in / forgot-password screens expect. All three are
  independent templates; fixing one doesn't fix the others.
- Second migration, `public.ai_insights` — cached AI coaching/reflection/breakdown copy,
  RLS scoped to `auth.uid()`, unique `(user_id, kind, period)` (`kind` is `'nudge' |
  'reflection' | 'breakdown'`; for `'breakdown'`, `period` holds the tile's id rather
  than a date/week/month key). Written by both `ai-insights`
  ([supabase/functions/ai-insights/index.ts](supabase/functions/ai-insights/index.ts),
  on-demand) and `daily-coach-dispatch` (below, proactive) — they share prompt/model
  logic from [supabase/functions/_shared/coach.ts](supabase/functions/_shared/coach.ts)
  so the two paths can never drift apart. Both need an `ANTHROPIC_API_KEY` secret set in
  the Supabase dashboard (Edge Functions → Secrets) — no tool reaches Edge Function
  secrets, so this is a manual, one-time step (**as of the last check, this secret was
  not actually saved** — `ai_insights` had zero rows and every call was logging a 500;
  re-verify this before assuming anything AI-related is broken for a new reason). These
  functions are Deno, not Expo/RN; `tsconfig.json` excludes `supabase/functions/**` from
  the app's `tsc` run (a separate runtime with its own globals — `Deno`, `jsr:` imports —
  that the app's TypeScript project doesn't need to understand). Model is `claude-sonnet-5`,
  exported as `MODEL` from `_shared/coach.ts`.
- Third migration, `add_coach_breakdown_and_push` — added the `'breakdown'` kind above,
  plus `public.push_prefs` (one row per user: `expo_push_token`, `timezone` (IANA name),
  `coach_hour` (0–23, local), `enabled`, `last_sent_date` (send-dedupe key), RLS scoped
  to `auth.uid()`), and enabled `pg_cron` + `pg_net` (the latter's extension object lives
  in the `extensions` schema, not `public`, per the linter — its functions still resolve
  under `net.*` regardless). A `cron.schedule('daily-coach-dispatch', '0 * * * *', ...)`
  job calls `net.http_post` against the `daily-coach-dispatch` Edge Function every hour
  on the hour; the function itself checks each user's *local* hour against their
  `coach_hour` (`Intl.DateTimeFormat`, handles DST) so the actual send only fires once
  per user per day. That function
  ([supabase/functions/daily-coach-dispatch/index.ts](supabase/functions/daily-coach-dispatch/index.ts))
  has `verify_jwt` off (cron has no user JWT) and is instead gated by an `x-cron-secret`
  header checked against a `CRON_DISPATCH_SECRET` Edge Function secret — also a manual
  dashboard step, same place as `ANTHROPIC_API_KEY`. It uses
  `SUPABASE_SERVICE_ROLE_KEY` (auto-injected, never set manually) to read every opted-in
  user's `app_state` and `push_prefs` across RLS, generates one nudge via Claude (same
  prompt/cache row as `ai-insights`'s on-demand `'nudge'` kind, so the Card tab and the
  push always match), and POSTs to Expo's push API
  (`https://exp.host/--/api/v2/push/send`). **Push requires a real device token, which
  Expo Go cannot provide** — this project has no `eas.json` and no
  `extra.eas.projectId` in `app.json` yet, so `registerForPush()`
  ([src/notifications/push.ts](src/notifications/push.ts)) will fail quietly until the
  project is linked (`eas login` then `eas init`, both requiring an interactive
  terminal) and a dev-client build exists (`eas build --profile development --platform
  ios`, or `npx expo run:ios --device` locally).
