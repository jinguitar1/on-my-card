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

**On My Card** (schema v5): any number of **fixed 5×5 cards** — a "My Cards" dashboard
(`CardDashboardScreen`) lists every one the user has built, each opened independently.
(Through schema v4 this was "exactly one card, ever" — see the migration note under
`src/state/AppStateContext.tsx` below for how an old single-card blob becomes the first
entry in a list, and DESIGN-FRAMEWORK.md for why that constraint existed originally;
multi-card was a deliberate, confirmed reversal of it, not a regression.) Building a
card is unchanged either way: no typing tiles at setup — pre-researched tile ideas are
presented one at a time (`src/domain/tileBank.ts`, ~80 items across 8 categories) and
the user **swipes right to keep, left to skip** (`src/screens/SwipeDeckScreen.tsx`)
until 24 are kept (or the bank runs out, in which case the skipped pile gets one
shuffled second pass). Centre cell is a permanent FREE space. Cross a tile off
(`doneAt`); a completed row/column/diagonal is a **bingo** (checkpoint, reward ladder at
1/6/12 bingos, per card); a card is **done when all 24 of its tiles are crossed off**.

Building the very first card still goes through 4-phase onboarding
(`src/screens/OnboardingNavigator.tsx`): **Welcome** (one bold line + a burst of colored
shapes, no bullet points) → **Intro** (a short, mostly-visual explanation of what's about
to happen — static ✕/✓ demo + one paragraph — added because users were dropped straight
into the swipe deck with no explanation of the gesture or what building a card even
meant) → **deck** (`SwipeDeckScreen`, which also carries a persistent one-line reminder
under the progress bar: "Swipe right to keep · left to skip") → **reveal**
(`CardReveal.tsx`, shared with the in-app "create a new card" flow — see below; the
assembled grid stamps in with confetti, the user names the card right there, and "Enter
my card" is what both creates the card and flips `settings.onboardingComplete`).
Building any *later* card skips Welcome/Intro (the user already knows the gesture) and
goes straight to deck → reveal via `CreateCardScreen`, reached from the dashboard's "+
Create a new card" button. Design principle throughout: **less text, more geometry and
color** — the swipe cards lead with emoji + a 2–5 word label; the note is behind a tap,
never shown by default. The Intro phase is the one deliberate exception to "less text" —
it's instructional, not marketing copy, and only shown once, ever.

- [index.ts](index.ts) — entry point; `registerRootComponent(App)`.
- [App.tsx](App.tsx) — providers only: `SafeAreaProvider` › `AuthProvider` › `AppProvider`
  › `SoundProvider` › `RootNavigator`; calls `configureNotifications()` once.
- [src/domain/](src/domain/) — `types.ts` (fixed-grid constants `GRID`/`CELL_COUNT`/
  `CENTER`/`CAPACITY`/`LINE_CELLS`, `TileCategory` + `CATEGORY_ACCENTS`; `Card.id`
  uniquely identifies a card since `AppState.cards` is now an array; `Card.emoji?` is
  the small personal touch shown on the dashboard, distinct from any tile's own emoji;
  `DraftCardTile`/`DraftCard` describe an in-progress, pause-and-resume swipe-deck
  session — defined structurally here rather than importing `tileBank.ts`'s `TileIdea`,
  since `tileBank.ts` already imports `TileCategory` from this file and the reverse
  import would be circular; `TileIdea` is structurally identical, so it assigns in
  without conversion. `AppState.draftCard: DraftCard | null` was added *after* schema
  v5 shipped — purely additive, no schema-version bump, same category as a `Settings`
  field added later (see `AppStateContext` below for the hydrate-side backfill)),
  `logic.ts` (pure per-`Card` selectors — `lineLabel`, `isLineComplete`, `bingoCount`,
  `nearMissLines`, `isCardComplete`, reward selectors — every one of these takes a
  single `Card`, never `AppState`, so none of it needed to change for multi-card;
  nothing here persists/mutates), `tileBank.ts` (the curated `TileIdea` bank +
  `shuffle`/`buildDeck`/`randomSuggestions` — `buildDeck(exclude)` already supported
  excluding a set of ids before the draft-resume feature needed it, so that feature
  added no changes here at all), `seed.ts` (`emptyState()` — `cards: []`,
  `draftCard: null`).
- [src/storage/](src/storage/) — `Repository` interface (`load`/`save`/`clear`) +
  `LocalRepository` (AsyncStorage JSON blob, key `onmycard:appstate:v4` — **still v4 in
  the key name despite the schema being v5**, deliberately; see the migration note
  below — plus a parallel `:updatedAt` key used for sync conflict resolution).
  `src/storage/index.ts` exports the singleton, now a **`SyncRepository`** — **local is
  always the fast path**: `load`/`save`/`clear` hit AsyncStorage only and return before
  any network call starts; a signed-in push to Supabase happens in the background and
  never blocks or throws into the UI. `remoteRepository.ts` holds the raw Supabase
  queries against `public.app_state` (one JSONB row per user, RLS-scoped to
  `auth.uid()`). `SyncRepository.setUser(userId)` is called by `AppStateContext` on
  every auth change; `reconcile()` runs once per sign-in — last-write-wins by comparing
  the remote row's `updated_at` against the local `:updatedAt` marker (a known v1
  simplification for the single-device-at-a-time case; a stale-versioned remote row is
  left alone rather than adopted, and gets overwritten by the next local save once local
  has migrated — see below). `LocalRepository.load()` returns the blob exactly as
  stored, including its own `schemaVersion` — it must never rewrite that field itself;
  that's `AppStateContext`'s hydrate's job. General policy: bump the AsyncStorage key on
  a schema change **only when there's no real per-field migration** — old-shaped data
  then just gets discarded rather than misread (a prior bug here silently upgraded the
  version number on old-shaped data without transforming it, which crashed the app on
  old data; fixed by making `load` a pure passthrough). The v4→v5 change (single `card`
  → `cards: []`) is the *first* change with a real, lossless transform, so the key was
  deliberately **not** bumped this time — see `AppStateContext` below. At matching
  schema versions, hydrate also merges `loaded.settings` onto `DEFAULT_SETTINGS` (not a
  bare pass-through) so a `Settings` field added later — same schema version, just
  missing from data persisted before that field existed — backfills to its default
  instead of reading as `undefined` at every call site (a real risk for any newly-added
  *required*, non-optional field, e.g. an array a caller calls `.includes()`/`.length`
  on without a null-check).
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
  optional** — it never gates onboarding or the tabs (`RootNavigator`'s gate is
  `!settings.onboardingComplete || state.cards.length === 0`). Discoverability was a real
  complaint (people dismissed the old banner once and then couldn't find sign-in again),
  so it's now surfaced three ways, none dismissible: a banner on `CardDashboardScreen`
  that always shows while signed out (no ✕ — a one-time-dismissible banner was the actual
  bug being fixed here; this banner moved here from the old single-screen `CardScreen`
  once the dashboard became the screen seen most often), the very first section in
  `SettingsScreen` (previously it was last, below Activity, where people had to scroll to
  find it), and a small gold dot on the Settings tab icon (`RootNavigator`'s
  `tabIcon(emoji, dot?)`) that only shows while signed out.
- [src/state/AppStateContext.tsx](src/state/AppStateContext.tsx) — `useApp()`. All state in
  `useState`, hydrate / debounced-persist / foreground (notif reconcile). Every
  per-card action now takes a `cardId` first: `createCard(kept, title, emoji?)`,
  `renameCard(cardId, title)`, `setCardEmoji(cardId, emoji)` (unlike title, an empty
  string is a valid value here — it just clears it), `pressTile(cardId, cell):
  TileOutcome`, `setTile`/`clearTile`, `setFocusedTile(cardId, tileId | null)` (the one
  tile per card — never more than one — the user is currently focusing on;
  `Card.focusedTileId`, cleared automatically the moment that tile gets crossed off, in
  both `pressTile` and `setTileDone`, since there's nothing left to focus on), reward
  CRUD, `updateSettings` (account-wide, no `cardId`), `resetAll`. Every one of these
  resolves its target via
  `st.cards.find(c => c.id === cardId)` and writes back via `st.cards.map(c => c.id ===
  cardId ? next : c)` — there's no separate "current card" concept in state at all; which
  card a screen is acting on is purely a navigation-time route param (`route.params.cardId`),
  not anything stored globally. **Every action that computes its next state by reading
  `stateRef.current` directly (rather than `setState(prev => ...)`) must call the
  `commitState()` helper, not `setState`**, so that `stateRef.current` is current for the
  *next* such action within the same synchronous call — see the note in
  DESIGN-FRAMEWORK.md §10; skipping this silently discards the earlier call's update.
  `pressTile` returns a synchronous `TileOutcome` computed from a before/after diff; a
  **celebration queue** (`celebration` / `dismissCelebration`) drives the root overlay.

  **Schema v4 → v5 migration** lives in the hydrate effect here (not in
  `LocalRepository`, which stays a pure passthrough — see `src/storage/` above): if the
  loaded blob's `schemaVersion === 4` (the old single `card: Card | null` shape), it's
  transformed into `{ schemaVersion: 5, cards: card ? [{ ...card, id: uid('card') }] :
  [], settings, log }` before the normal `DEFAULT_SETTINGS` merge runs — a real, lossless
  transform (not the "discard on mismatch" fallback every other version bump uses), which
  is exactly why the AsyncStorage key deliberately wasn't bumped alongside it. Verified
  against the real signed-in user's actual persisted row (`execute_sql` against
  `public.app_state`) before shipping, since this rewrites data in place on first load
  with no backup/undo.

  `draftCard` (an in-progress "building a card" session — see `domain/types.ts` above)
  gets the same defensive-backfill treatment `settings` already does: hydrate sets
  `draftCard: loaded.draftCard ?? null` rather than bumping the schema version again for
  a purely additive field. `saveDraftCard(kept, rejected, usedSecondPass)` and
  `clearDraftCard()` are the two actions — both plain `setState` writes, auto-persisted
  by the existing debounced-save effect with no new persistence plumbing. `createCard`
  clears nothing itself; `CreateCardScreen` calls `clearDraftCard()` right after a
  successful `createCard`.
- [src/feedback/](src/feedback/) — `haptics.ts` + `sound.ts` (settings-guarded via
  module-level flags the provider syncs) and `Celebration.tsx` (`Confetti`,
  `CelebrationOverlay` with `bingo` / `card` (full-card takeover) / `reward` variants — RN
  `Animated` only, no Reanimated).
- [src/notifications/scheduler.ts](src/notifications/scheduler.ts) — `reconcileNotifications(state)`
  cancels and re-schedules only if at least one card exists and it's enabled in Settings
  — one `WEEKLY` trigger per (day, minute-of-day) pair from `settings.weeklyCheckinDays` ×
  `settings.weeklyCheckinMinutes` (Expo's WEEKLY trigger only takes a single weekday/hour/
  minute, so multiple days/times means multiple `scheduleNotificationAsync` calls; each
  `weeklyCheckinMinutes` value is minutes since local midnight, split back into
  hour/minute here). The notification body sums `cardSummary()` across every card
  (`state.cards.reduce(...)`) rather than naming one card by title — there's no single
  "the card" to name once more than one can exist, so the title is a generic "Weekly
  check-in" and the body reads "{crossed}/{total} crossed across {N} card(s) ·
  {bingos} bingo(s)." Either day/minute list empty schedules nothing —
  `weeklyCheckinMinutes` defaults to `[]` (nothing configured) rather than a pre-filled
  time, so `SettingsScreen` shows a neutral "+ Add a time" affordance instead of a value
  the user never actually chose. Full minute precision — this is a native OS-level
  scheduled alarm, not polled, so there's no reason to restrict it the way AI Coach's
  server-checked minutes are (below).
- [src/ai/useInsight.ts](src/ai/useInsight.ts) — `useInsight('nudge' | 'reflection' |
  'breakdown', { periodType?, tileId?, auto? })`, the client for the `ai-insights` Edge
  Function ([supabase/functions/ai-insights](supabase/functions/ai-insights)).
  Deliberately **outside** `AppStateContext` — supplementary and online-only, so a
  failure here can never touch the core local-first state. Requires sign-in (the
  function reads `public.app_state`, which only exists once synced); callers gate on
  `useAuth().status === 'signedIn'`. Used by `CardDetailScreen` (a "COACH" line, one nudge
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
  separate from `scheduler.ts`'s local notifications. `registerForPush()` requests
  permission, calls `Notifications.getExpoPushTokenAsync({ projectId })` (needs
  `app.json`'s `extra.eas.projectId`, populated by `eas init` — done; see the EAS/dev-client
  requirement below) and upserts `public.push_prefs` (deliberately omitting
  `coach_minutes`/`coach_days` from that upsert so a fresh row gets the DB defaults —
  empty minutes, every day — while re-enabling an existing row preserves whatever was
  already configured); `setCoachMinutes`/`setCoachDays`/`disablePush` update it without
  discarding the stored token. Fails quietly (returns `false`) rather than throwing —
  `SettingsScreen`'s "AI Coach" toggle shows a one-line explanation when that happens.
  Both "The knock on the door" and "AI Coach" share `SettingsScreen`'s local `TimeSlots`
  component (values are minutes-since-midnight throughout, not hours, for real minute
  precision): each selected time is its own removable chip, plus a trailing "+ Add a
  time" chip that opens `@react-native-community/datetimepicker` (native iOS/Android
  only — no web support, so web falls back to a fixed multi-select chip list instead, of
  whole hours). Both moved from a single required hour to "zero or more times" — an
  empty list is itself the "not configured yet" state, so there's no separate boolean
  flag for it. iOS's spinner fires `onChange` continuously as each wheel column settles
  mid-scroll, so `TimeSlots` buffers picks into local state and only commits on "Done" —
  committing straight from `onChange` was both adding times before the user meant to and
  occasionally the wrong value, since it could grab an intermediate value one column
  hadn't finished settling on. AI Coach's instance passes `minuteInterval={5}`, snapping
  its picker to 5-minute steps — see `daily-coach-dispatch` below for why that value
  specifically matters, not just an arbitrary restriction.
- [src/config/features.ts](src/config/features.ts) — `FEATURES` (`aiCoach` / `stats` /
  `rewards`), all currently `false`. The single flip point for "bells and whistles" that
  are fully built but deliberately tucked away while v1 stays focused on the core loop (a
  fixed set of goal tiles to cross off) — nothing behind a flag is deleted, so bringing a
  feature back later is a one-line change, not a rebuild. `aiCoach` gates the Card tab's
  coach trigger/box and Settings' "Reflection" + "AI Coach" sections (and passes `auto:
  false` to their `useInsight` calls so they don't burn a cached Claude call while
  hidden); `stats` gates the Card tab's "View my stats" toggle and `RadarChart`;
  `rewards` gates the Rewards tab itself (`RootNavigator`) and the bingo-threshold
  reward-unlock celebration (`AppStateContext`'s `celebrationsFor` — without this guard
  a "REWARD UNLOCKED" takeover would still fire on a bingo and point at a tab that no
  longer exists). Reward CRUD (`addReward`/`editReward`/`removeReward`/`claimReward`)
  and the underlying data model are untouched — only the UI path to them is unreachable
  (and, with multiple cards now possible, `RewardsScreen` itself only ever looks at
  `state.cards[0]` as a placeholder — see the `src/screens/` note below).
- [src/navigation/RootNavigator.tsx](src/navigation/RootNavigator.tsx) — onboarding gate
  (`!settings.onboardingComplete || state.cards.length === 0`) → 2–3 tabs + three
  top-level modals. The `Card` tab is itself a small nested stack (`CardStack`, defined
  inline in this file the same way `Tabs` already is): `CardDashboard` →
  `CardDetail` (see `src/screens/` below). A screen nested this way can still reach the
  top-level modals by name — React Navigation's `navigate` walks up through parent
  navigators to find a matching screen name — so `CardDashboardScreen`/
  `CardDetailScreen` call `navigation.navigate('TileSheet' | 'SignIn' | 'CreateCard',
  ...)` exactly like the old single-screen `CardScreen` used to. The three top-level
  modals: `TileSheet`, `SignIn`, and `CreateCard` (new — the in-app "add another card"
  flow, entered from the dashboard). Renders `CelebrationOverlay` at root.
- [src/screens/](src/screens/) — `OnboardingNavigator.tsx` (welcome → intro → deck,
  then a shared reveal component — see `CardReveal.tsx` below),
  `SwipeDeckScreen.tsx` (the keep/skip deck — `PanResponder` + `Animated.ValueXY`, no
  Reanimated/gesture-handler; a `forwardRef`/`useImperativeHandle` card lets the ✕/✓
  buttons drive the same animation as a drag; **resumable** — `initialKept`/
  `initialRejected`/`initialUsedSecondPass` props seed a paused session back in, and
  `buildDeck(exclude)` (a param it already supported, unused until now) rebuilds the
  deck excluding whatever's already been decided so a resume never re-shows an
  already-swiped tile; an `onProgress(kept, rejected, usedSecondPass)` callback — one
  `useEffect` watching those three, not scattered through every mutator — fires on every
  change so the caller can persist progress; a mount-time safety net calls `onDone(kept)`
  immediately if a resumed deck comes up already-empty, since `buildDeck()` with no
  excludes is never empty on a fresh start but a heavily-excluded resume can be),
  `CardReveal.tsx` (the finished-grid stamp-in + confetti + editable title **and emoji**
  `TextInput`s, extracted so both card-creation paths share one component instead of
  duplicating it — takes `{ kept, defaultTitle, ctaLabel, onSave(title, emoji) }`; this
  is where naming a card, and giving it its emoji, actually happens now, not a Settings
  field. The emoji field is a small free-text box, not a curated picker — tapping it
  just brings up the device's own emoji keyboard, since "something that represents your
  emotions" is a personal, open-ended choice, not one a fixed palette should constrain),
  `CreateCardScreen.tsx` (the in-app "add another card" flow, reached from the
  dashboard's "+ Create a new card" — or "↻ Continue creating your card" — button; a
  top-level modal, sibling to `TileSheet`/`SignIn` in `RootNavigator`; skips
  welcome/intro since the user already knows the gesture, just `deck` → `CardReveal`.
  **Resumable**: reads `state.draftCard` on mount and passes it into `SwipeDeckScreen`
  as the `initial*` props when present, and wires `onProgress` to
  `saveDraftCard(kept, rejected, usedSecondPass)` — every swipe decision re-saves the
  draft (through the existing debounced-persist pipeline, no new plumbing needed), so
  even backgrounding or killing the app mid-deck doesn't lose progress, not just an
  explicit "Close" tap. Saving calls `createCard(kept, title, emoji)` then
  `clearDraftCard()` then `navigation.goBack()` to return to the dashboard, where the
  new card is now in the list — the "ta-da" moment already happened on the reveal
  screen, so there's no need to also deep-link into the new card's detail screen).

  **`CardDashboardScreen.tsx`** — the Card tab's landing screen (`CardStack`'s first
  route). Lists `state.cards`, each row showing **only the title** plus a big personal
  emoji (falls back to a generic 🃏 if the card has none) in a circle colored via
  `goalColor(index)` (`src/ui/theme.ts` — the same per-card accent palette used
  elsewhere, rotating by position in the list) — bigger and warmer than a typical list
  row, per "make the card pop more." Still deliberately minimal on progress: no focus
  tile, bingo count, or crossed count; those only exist inside `CardDetailScreen`,
  reached by tapping a row (`navigation.navigate('CardDetail', { cardId })`), so a
  glance at the dashboard never leaks per-card progress. Below the list: if
  `state.draftCard` has any progress (`kept.length + rejected.length > 0`), the usual
  dashed "+ Create a new card" affordance becomes "↻ Continue creating your card
  ({kept.length}/24 kept)" instead, plus a smaller "Start a new card instead" link that
  calls `clearDraftCard()` first — otherwise it's just "+ Create a new card" as before
  (visually matching `RewardsScreen`'s "＋ Add a rung" pattern) →
  `navigation.navigate('CreateCard')`. Also carries the sign-in banner (see the Sign-in
  note above) since this is the screen seen most often now, not the detail view.

  **`CardDetailScreen.tsx`** — a single card, opened by `cardId`. This is where
  everything that used to live directly on the old single-screen `CardScreen` now
  lives: editable title → focus-mode banner (conditional) → stat pills → grid → coach
  nudge (or its personified trigger, behind `FEATURES.aiCoach`) → "📊 View my stats"
  toggle → `RadarChart` (behind `FEATURES.stats`), in that order. The coach box and
  stats toggle are both currently flagged off — see `src/config/features.ts` — so on a
  fresh v1 build the screen ends at the grid; both blocks of JSX and the components
  behind them (`CoachTriggerButton`, `RadarChart`) are still here, just unreached. The
  app's own name is deliberately not shown anywhere on this screen — the card's own
  title is the only heading.
  - **The title**, and now the emoji beside it, are both tap-to-edit in place the same
    way: tapping the plain `Text` swaps it for an autofocused `TextInput` (local
    `editingTitle`/`titleDraft` and `editingEmoji`/`emojiDraft` state pairs), committing
    via `renameCard(cardId, title)` / `setCardEmoji(cardId, emoji)` on blur. This is now
    the *only* place a card's name (and its emoji) can be changed after creation — the
    "Card name" field that used to also live in `SettingsScreen` was removed once naming
    moved here, since a card's name only makes sense in the context of that one card,
    not account-wide settings.
  - **The grid** no longer has an open/closed "envelope" state at all — the dashboard is
    now that closed state, so navigating here already means "opened." It still gets a
    spring-in entrance for the same "feels good to open" payoff as before, just fired
    once from a mount `useEffect` (`triumphHit()`, a `Confetti` burst, `gridAnim`
    driving `opacity` + a `scale` interpolation 0.7 → 1) instead of an explicit "open"
    tap. A small "← My Cards" link at the top is the way back to the dashboard (no
    native header anywhere in this app — every screen builds its own chrome).
  - **The coach nudge** is fetched the same as always (`useInsight('nudge')` still
    auto-fetches on mount regardless of `showCoach`, so it's ready and waiting the
    moment someone taps in), but stays hidden behind `CoachTriggerButton` until tapped —
    a small round avatar (🧑‍🏫) with its own continuous `Animated.loop` pulse
    (personified — alive, not a flat button) and a small gold dot badge that only
    appears once the nudge has actually finished loading, hinting there's something to
    see without forcing it on screen.
  - Stat pills: bingos, crossed count, and (new) a "🏆 Complete" pill when
    `isCardComplete(card)` — this used to live in `SettingsScreen`'s now-removed "The
    card" section; it's contextual to one specific card, so it moved here instead of
    just being dropped.

  Also deliberately trimmed to those few pills — the old "Next reward" pill was dropped
  since `RewardsScreen` already shows that in full, and the bottom hint text under the
  grid was cut too, both in service of "less wordy, more symmetry". **Tapping a grid
  tile never crosses it off** — every tap (filled or empty) just opens `TileSheet` (now
  with `{ cell, cardId }` params); crossing off happens *only* from that sheet's "Cross
  it off" button, a deliberate choice over a quick grid tap feeling too easy to "lightly
  manipulate" something meant to matter. Focus mode is loud on purpose, not subtle, in
  two ways: a solid gold banner right under the title, explicitly labeled — a small
  "FOCUS TILE" kicker line above the tile's own emoji/label (an earlier version said
  "FOCUS GOAL," and before that had no labeling at all, just "🎯 [emoji] [label]," which
  read as unclear about what the banner even meant) — with a ✕ that dismisses the
  banner *and* stops the tunnel-vision dimming (local `bannerDismissed` state, resets
  whenever this screen is reopened, so the banner and dimming both have a fresh chance
  to show again next visit); it deliberately does **not** call
  `setFocusedTile(cardId, null)` — an earlier version did, and it read as the whole
  focus "going away" on a stray tap. Actually clearing focus is still only ever a
  deliberate action from that tile's own sheet ("★ Focused — tap to unfocus" in
  `TileSheetScreen`). Grid dimming (tied to `!bannerDismissed`, not to focus existing at
  all) is a genuine tunnel-vision recession while it's active — every non-focused tile
  renders at `opacity: 0.15` **and** `scale: 0.92` (the `dimmed` style), not just a
  light fade — but the focused tile's own marker is independent of dimming and stays
  visible either way: a gold glow (`shadowColor: colors.stampGold`, the `focused` style
  on the wrapping `View`) plus a small gold ★-in-a-circle badge (`CardTile`'s
  `isFocused` prop) in the tile's **top-right** corner — the same corner the
  crossed-off ✓ badge uses, safely, since crossing a tile off always clears its focus
  (the two are never shown at once). This badge briefly lived top-left, and briefly
  used to also double as "this tile is part of a completed bingo line" (the old
  `inBingoLine` prop / `BingoRail`'s per-tile-ribbon successor) — that dual-purpose use
  was retired, because every tile in a completed line is *by definition* crossed off,
  which directly conflicted with "crossed tiles shouldn't show the gold star": the two
  could never both be satisfied at once, since the star would always land on
  already-crossed tiles. There's currently no separate "part of a completed bingo"
  indicator as a result — if one's wanted again later it needs its own distinct visual,
  not this corner/color. This two-part split (dimming toggles with the banner, the
  tile's own focus marker never does) is what makes "✕ to see the rest of the grid, but
  still spot which tile is focused" work.

  A crossed-off tile now follows an explicit **"alive vs dead"** framing: an uncrossed
  tile stays fully colorful (its category wash, its gold border — untouched, "alive"),
  a crossed one is deliberately desaturated to read as drained of color, "dead," not
  just differently-accented. This settled after four rounds on the same neutral grey
  this had briefly landed on before a gold-branded detour: `colors.cardSunk` background
  / `colors.lineStrong` border / `colors.inkFaint` text — this app's existing
  "recessed/de-emphasized" tokens, not a new color. (History, in order, in case this
  gets revisited again: a dark `colors.ink` fill matching the FREE tile exactly → a
  green-bordered version → this neutral grey, praised → a gold-branded version
  (`goldSoft`/`stampGold`/`goldInk`, the same trio used for the sign-in banner/reward
  tickets) → explicitly reverted back to this grey, because gold still read as
  "vibrant/alive," working against the "dead" effect a completed tile is going for. If
  gold-branding this is ever revisited, the "alive vs dead" framing is the thing to
  satisfy first, not brand consistency alone.) The "done" signal is a small
  `colors.ink` circle badge with a white ✓ (`doneBadge`, top-right corner) — same
  shape/checkmark language as `TileSheetScreen`'s plan-step checkboxes — which has been
  unanimously well-received across every round above and hasn't changed once. Full
  opacity, not faded to near-invisible, is still the deliberate legibility choice
  underneath all of this: this app's shareability angle (showing a friend/family member
  the card to glance at what's done) depends on being able to actually read a crossed
  tile's label, not just see that *something* changed about it. The emoji stays visible
  too (`CardTile`, `src/ui/components.tsx`). The "alive" side of this (the uncrossed
  tile's own styling) hasn't been touched in any of these rounds — explicitly left as-is
  for a possible future pass.

  **`RewardsScreen.tsx`** (behind `FEATURES.rewards` — currently unreachable, see
  `src/config/features.ts`) — still assumes a single card: `state.cards[0]` is used as a
  fixed placeholder rather than adding a card-picker UI, since proper multi-card support
  for this screen is out of scope while the rewards feature itself is still deferred.

  **`SettingsScreen.tsx`** (draft-and-save editing plus a `__DEV__`-gated "Developer"
  section — see below).

  **`TileSheetScreen.tsx`** (three mutually-exclusive views per open: empty-cell picker,
  filled-tile detail, or a "swap" picker reusing the exact same
  suggestion-list-plus-custom-input UI as the empty-cell one, opened by "Swap for a
  different idea" instead of silently auto-picking `suggestions[0]` with no user choice
  at all. Each view's header row had a real layout bug, confirmed via a screenshot: the
  title `Text` had no `flex`/shrink constraint, so a long filled-tile label (e.g.
  "📈 Track your spending for a month") just kept growing instead of wrapping within
  the row, pushing "Close"/"Cancel" off the right edge of the screen entirely. Fixed by
  giving the title `flex: 1` (`styles.headerTitle`) so it wraps within whatever space is
  left after the fixed-width Close/Cancel text, across all three header instances even
  though only the dynamic filled-tile one could actually trigger it in practice; a "Get a
  plan" AI breakdown for a filled tile — see `src/ai/useInsight.ts` and
  the Edge Function notes below for both the web-search research and the personalization
  context box above the button, editable before every generate/regenerate. That context
  box now submits on its own: a multiline `TextInput`'s return key just inserts a
  newline on-device (there's no native "Enter submits" for a multiline field), so
  `handleContextChange` treats a trailing `\n` in `onChangeText` as the submit signal —
  strips it and calls `refreshBreakdown` right then — the standard workaround RN
  chat-style inputs use for this. The generated steps are also now interactive rather
  than static text: tapping a step toggles `selectedStep` (local, session-only — a gold
  left-border + wash, purely a "which step am I on" visual aid, not new synced state),
  and a ✎ per row opens that step's title/detail as `TextInput`s in place
  (`editingStepIndex`/`editTitle`/`editDetail`); each step also has its own small
  circular checkbox (reusing the step-number slot — shows the number normally, a ✓ on a
  filled `colors.success` background once `done`) so a step that's actually been
  completed can be crossed off independently of the tile itself, with the same
  strikethrough-plus-faded treatment (`stepTitleDone`/`stepDetailDone`) the app already
  uses for a crossed tile. Both the edit-save and the done-toggle (`saveStepEdit`/
  `toggleStepDone`) go through the same path: saving calls `useInsight`'s new
  `updateContent(json)`, which writes the edited `{steps: [...]}` (preserving each
  step's `done` across an edit, and vice versa) straight to the existing `ai_insights`
  row via a plain client-side Supabase `.update()` — no Claude call needed for either, so
  both are instant, and both persist (a closed-then-reopened tile sheet re-reads the
  edited/checked version, not the original). A full "↻ Try again" regenerate still
  resets every step's `done`, since that's a genuinely new plan, not an edit of the old
  one. This needed a new migration, `add_ai_insights_update_policy` — the table
  previously had only `insert own insights`/`select own insights` RLS policies, no
  `update`, so even this direct write would have been rejected; the new
  `update own insights` policy mirrors `app_state`'s/`push_prefs`'s existing per-owner
  update policies. (This likely also fixes a latent bug: the Edge Function's own
  `force: true` regenerate path does an `upsert`, whose `ON CONFLICT DO UPDATE` path
  needs an UPDATE policy to satisfy RLS on an *existing* row — it may have been
  silently failing before this migration.) The old "Regenerate with this context"
  button is now "↻ Try again" — plain regeneration without retyping is now the
  clearly-secondary path once typing itself can also trigger one. A "☆ Focus on this" /
  "★ Focused" toggle for any filled, uncrossed tile,
  calling `setFocusedTile(cardId, ...)`; "Cross it off" calls `pressTile(cardId, cell)`
  (not `setTileDone`) and passes the result through `src/feedback/celebrate.ts`'s
  `playOutcomeFeedback` for haptics/sound, since the grid no longer does this itself —
  the bingo/card-complete celebration *overlay* still fires automatically regardless,
  driven by the global queue `pressTile` already enqueues into internally, independent
  of which screen called it. Reads `cardId` from `route.params`, same as `cell`). The
  tile-idea presets shown in both pickers are a known, not-yet-addressed rough edge —
  currently just 3 random suggestions with no way to browse the full bank; making that
  properly scrollable/browsable is flagged as a future pass, not done.
  [src/ui/](src/ui/) — `theme.ts` (warm paper-card tokens, `categoryColor`/`categoryWash`)
  + `components.tsx` (`CardTile`, `Stamp`, `RoundButton`, `RewardTicket`,
  `cardLayout`, buttons) + `RadarChart.tsx` (the Card tab's "quick glance" goal-stats
  radar, one axis per `TileCategory` via `domain/logic.ts`'s `radarStats(card)` —
  current, crossed tiles only, as a solid shape; projected, every tile on the card as if
  finished, as a lighter dashed overlay on the same chart. Hand-rolled with
  `react-native-svg` primitives rather than a charting library, the same
  hand-roll-over-dependency choice `Celebration.tsx` made for confetti. `react-native-svg`
  needs a native rebuild to pick up, same as any other native module addition —
  `npx expo run:ios --device` or an EAS build, not just a JS reload. Takes an optional
  `focusedCategory` prop — when set, draws one extra hint: a hollow ring one step past
  that axis's current dot plus a dashed connecting line, both in `colors.success`,
  showing the "level up" crossing the focused tile off would give that category).

`SettingsScreen`'s "Feedback" (sound/haptics) and "The knock on the door" (weekly
check-in) sections are **draft-and-save, not live-applied**: every field in them writes
to a local `SettingsDraft` (`useState`, mirrors the relevant `Settings` fields) instead
of calling `updateSettings` directly, and nothing actually commits until the "Save
changes" button beneath those two sections is pressed — added because an accidental
toggle used to auto-apply on change with no way to back out. `dirty` is a
`JSON.stringify` compare between the draft and a `committed` snapshot built fresh from
`state` each render; the Save button is disabled when `!dirty`, and a `useEffect`
re-syncs the draft from `committed` whenever the *committed* side changes (hydrate, a
sync reconcile) **but only if the draft isn't already dirty** — an in-progress edit is
never silently overwritten by an external update. The one exception is the
weekly-check-in permission check: turning the toggle on still requests OS notification
permission immediately (`getPermission()`), same as before, since that's a one-time
system dialog, not a value to stage — only the resulting boolean lands in the draft.
(Card naming used to be a third draft-and-save section here too — it now lives only on
`CardDetailScreen`, see `src/screens/` above, since a card's name is only meaningful in
the context of one specific card.) Everything else on this screen keeps its own
independent save semantics unchanged: password change already had its own explicit
"Save" button (`editingPassword` flow), and Account/Reflection/AI Coach actions (sign
in/out, refresh) are one-shot actions, not settings to draft. The old user-facing "Data"
section ("Start over with a new card," which called `resetAll()` and wiped everything)
was removed entirely — the dashboard's "Create a new card" is now the normal,
non-destructive way to get a fresh card, so that destructive reset no longer has a
legitimate everyday use; a "⚠️ Reset all data" button calling the same `resetAll()`
moved into the `__DEV__`-gated Developer section below instead, purely as a testing
escape hatch.

The "Activity" log card shows only `ACTIVITY_PAGE_SIZE` (4) entries at a time —
`activityVisible` starts at 4 and a "Show more" `GhostButton` advances it by 4 more per
tap (`Math.min(v + ACTIVITY_PAGE_SIZE, ACTIVITY_MAX)`), disappearing once every entry up
to the `ACTIVITY_MAX` (25) ceiling is shown — added because the full log read as too
long/noisy by default once someone had logged more than a handful of tiles, and a single
jump straight to 25 was still a lot to land on from one tap.

`SettingsScreen`'s `__DEV__`-gated "Developer" section (only rendered in dev-client
builds, never production) exists purely for fast end-to-end testing of AI coaching, the
radar chart, and focus mode without hand-tapping a dozen tiles first: "Randomize
progress" crosses off a random 3-14 open tiles via the normal `setTileDone` (so bingos/
celebrations fire normally, just possibly several at once); "Focus a random open tile"
calls `setFocusedTile`; "Uncross everything" reverts — all three operate on
`state.cards[0]` (`devCard`), the same "just pick the first card" placeholder convention
as `RewardsScreen`, since there's no "current card" in global state to target and these
are purely dev-testing shortcuts. `CardDetailScreen`'s coach box also gets a dev-only
"↻ regenerate" link next to the COACH kicker (calls the nudge's `refresh(true)`) —
needed because the nudge is cached per calendar day, so seeding new random progress
wouldn't otherwise show a fresh nudge until the next day. (This section, like the rest
of AI coaching/stats, currently sits behind `FEATURES.aiCoach`/`stats` being off for
everyone else — the Developer shortcuts themselves aren't flag-gated, so they're still
usable in a dev client to exercise that code path without flipping the flags.) The
"⚠️ Reset all data" button here (see above) is the one destructive action in this
section — everything else is additive/reversible test data.

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
  flow changes. **Known gap**: the multi-card change (schema v5) did not update these SQL
  `comment on` strings — they still describe the old one-card-per-user flow; the actual
  `state jsonb` blob now holds `cards: Card[]`, since the JSONB column itself doesn't
  enforce any particular shape. Fix these comments next time a real migration touches
  this table, rather than as a comment-only migration on its own. That schema also still has empty, unused `boards` / `tiles` /
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
  secrets, so this is a manual, one-time step (**as of the last check (2026-09-25), the
  secret is present but its value is wrong** — every `ai-insights` call 502s with
  `Anthropic API 401: invalid x-api-key` in `function_logs`; get a fresh key from
  console.anthropic.com and replace the saved value, don't just confirm it exists).
  These functions are Deno, not Expo/RN; `tsconfig.json` excludes `supabase/functions/**`
  from the app's `tsc` run (a separate runtime with its own globals — `Deno`, `jsr:`
  imports — that the app's TypeScript project doesn't need to understand). Model is
  `claude-sonnet-5`, exported as `MODEL` from `_shared/coach.ts`. `AppStateShape`/
  `CardShape` here mirror the client's schema v5 shape (`cards: CardShape[]`, each with
  an `id`) — updated alongside the client's multi-card change even though this whole
  path is currently gated off client-side (`FEATURES.aiCoach`), so it doesn't sit
  silently broken against data it no longer understands. `summarize()`/
  `summarizeForPeriod()` pick `state.cards[0]` as a placeholder (no multi-card coaching
  redesign attempted here — out of scope while AI coaching itself is deferred);
  `findTile()` searches across every card since a tile id is looked up without a
  `cardId` in the request today. Both functions were redeployed after this change
  (`ai-insights` v12, `daily-coach-dispatch` v14) since both bundle `_shared/coach.ts`.
  All three system
  prompts (`NUDGE_SYSTEM`/`REFLECTION_SYSTEM`/`BREAKDOWN_SYSTEM`) explicitly ban em/en
  dashes in the model's output — a deliberate style choice, not a bug, since that
  punctuation reads as a telltale "AI" tic and undermines the coaching voice feeling
  human-written. `summarize()`'s returned stats (and therefore `summarizeForPeriod()`'s
  too, which spreads it) include `focusedTile` (the focused tile's label/category/note,
  or `null`) whenever `Card.focusedTileId` is set; `buildNudgePrompt`/
  `buildReflectionPrompt` fold that into the user-turn prompt as an explicit instruction
  to prioritize it, and `NUDGE_SYSTEM`/`REFLECTION_SYSTEM` reinforce the same rule at the
  system-prompt level so it isn't only a per-request nudge. `BREAKDOWN_SYSTEM` is the one
  prompt that gets Anthropic's server-side `web_search` tool (`WEB_SEARCH_TOOL`, type
  `web_search_20250305`, `max_uses: 3`) — a deliberate reversal of this feature's original
  "Claude's own knowledge only" decision, since a plan for a goal-sized tile (e.g. "Build
  and ship an app") is far more useful naming real current resources than reciting
  general knowledge. Anthropic executes the search server-side and feeds results back
  within the same request, so there's no client-side tool-execution loop to write; the
  tradeoff is real added latency (multiple seconds per search) and a small added cost per
  breakdown, both accepted for this one feature. `callClaude` takes an optional `tools`
  param for this (unused by the nudge/reflection calls) and now concatenates every `text`
  block in the response rather than reading `content[0]` — a tool-augmented reply can
  have several content blocks (search calls, results, text) interleaved, not just one.
  `parseBreakdown` was hardened to match: it pulls the `{...}` substring out of the
  response rather than assuming the whole string is pure JSON, since Claude can emit a
  preamble ("Let me look into this...") before the final answer once search is involved.
  Web search alone still produced factually-fine but generically-shaped plans (confirmed
  against a real generated example — accurate, well-cited, but written for "anyone," not
  this specific person), so `buildBreakdownPrompt(tile, userContext?)` takes a second,
  optional argument: free text the user typed about their own situation (skill level,
  constraints, timeline, what they've already tried), threaded through from the client's
  `TextInput` in `TileSheetScreen` → `useInsight`'s `refresh(force?, context?)` →
  the Edge Function's `body.context` → the prompt. `BREAKDOWN_SYSTEM` treats this context
  as the single most important input once present: shape every step around it, skip
  steps it makes irrelevant, match pacing to where the person actually is, not just
  acknowledge it in passing. The context box stays visible and editable above both the
  first-generate and "Regenerate with this context" buttons, so it isn't a one-time
  prompt the user can miss.
- Third migration, `add_coach_breakdown_and_push` — added the `'breakdown'` kind above,
  plus `public.push_prefs` (one row per user: `expo_push_token`, `timezone` (IANA name),
  `enabled`, RLS scoped to `auth.uid()`), and enabled `pg_cron` + `pg_net` (the latter's
  extension object lives in the `extensions` schema, not `public`, per the linter — its
  functions still resolve under `net.*` regardless). A fourth migration, `add_coach_days`,
  added `coach_days smallint[]` (default every day, `0`=Sunday..`6`=Saturday, JS
  `Date.getDay()` convention; constrained to that 0–6 range) — the nudge only sends on a
  day that's in this array, checked against the user's local weekday. A fifth migration,
  `add_coach_hours_multi`, replaced an original single `coach_hour int` (plus its
  `last_sent_date date` send-dedupe column) with `coach_hours smallint[]` and
  `last_sent_slot text` (a `"<local date>T<local hour>"` dedupe key — necessary once
  multiple daily times are allowed, since the old date-only key would've blocked every
  slot after the first one fired the same day). A sixth migration, `add_coach_minutes`,
  replaced `coach_hours` with **`coach_minutes smallint[]`** (default `'{}'` — empty
  means "not yet configured," so `daily-coach-dispatch` simply never matches and never
  sends until the user adds at least one; each value is minutes since local midnight,
  0–1439, range-checked by the `public.smallint_array_in_range` helper function since
  Postgres CHECK constraints can't contain a subquery — that function has an explicit
  `search_path = ''` set, flagged and fixed as a `function_search_path_mutable` advisory
  right after it was added) — whole-hour granularity wasn't enough once the local
  Weekly-check-in side got real minute precision. `last_sent_slot`'s format changed to
  `"<local date>T<minute-of-day>"` to match. This needed the cron itself to get more
  precise too: `cron.schedule('daily-coach-dispatch', '*/5 * * * *', ...)` now ticks every
  5 minutes (was hourly, `'0 * * * *'`) — the function checks each user's *local*
  minute-of-day and weekday against their `coach_minutes`/`coach_days`
  (`Intl.DateTimeFormat`, handles DST), and the client constrains AI Coach's picker to
  5-minute increments (`minuteInterval={5}`, see `push.ts` above) so a chosen value
  always lands exactly on a tick rather than needing fuzzy "close enough" matching. That
  function
  ([supabase/functions/daily-coach-dispatch/index.ts](supabase/functions/daily-coach-dispatch/index.ts))
  has `verify_jwt` off (cron has no user JWT) and is instead gated by an `x-cron-secret`
  header checked against a `CRON_DISPATCH_SECRET` Edge Function secret — also a manual
  dashboard step, same place as `ANTHROPIC_API_KEY`. It uses
  `SUPABASE_SERVICE_ROLE_KEY` (auto-injected, never set manually) to read every opted-in
  user's `app_state` and `push_prefs` across RLS, generates one nudge via Claude (same
  prompt/cache row as `ai-insights`'s on-demand `'nudge'` kind, so the Card tab and the
  push always match), and POSTs to Expo's push API
  (`https://exp.host/--/api/v2/push/send`). **Push requires a real device token, which
  Expo Go cannot provide.** This project is now EAS-linked (`app.json`'s
  `extra.eas.projectId` was populated by `eas init`) and has a working iOS dev-client
  build — that required enrolling in the paid Apple Developer Program specifically,
  since a free/Personal-Team Apple ID cannot sign a build with the Push Notifications
  capability at all (an Apple account-tier restriction, not an Expo/EAS limitation — it
  applies to `eas build` the same as a local `npx expo run:ios --device` build). Without
  that enrollment, `registerForPush()` ([src/notifications/push.ts](src/notifications/push.ts))
  fails quietly and `SettingsScreen`'s AI Coach toggle shows an explanatory hint instead
  of erroring. Rebuilding the dev client (`npx expo run:ios --device` or an EAS cloud
  build) is only needed again when a *native* dependency changes — a pure JS/backend
  change just needs a Metro reload.
- Seventh migration, `add_ai_insights_update_policy` — `public.ai_insights` previously
  had only `insert own insights` / `select own insights` RLS policies, no `update`;
  added `update own insights` (`for update using (auth.uid() = user_id) with check
  (auth.uid() = user_id)`, mirroring `app_state`'s/`push_prefs`'s existing per-owner
  update policies) so `useInsight.ts`'s `updateContent()` — a direct client-side
  `.update()` used for hand-editing a breakdown's steps without a new Claude call — is
  actually allowed to write. Also plausibly fixes a pre-existing latent bug: the
  `ai-insights` Edge Function's `force: true` regenerate path does a Supabase `upsert`,
  whose `ON CONFLICT DO UPDATE` path needs an UPDATE policy to satisfy RLS when a row
  already exists — worth confirming regenerate actually persists now, in case it was
  silently failing before this policy existed.
