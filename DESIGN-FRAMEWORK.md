# On My Card — App Design Framework

> One card. Twenty-five reasons to try something new. Built on the five-part app model
> (**core function → core loop → accessory features → surface-area check → retention
> hook**) and on research about novelty-seeking, comfort-zone challenge, and what actually
> keeps people checking a progress tracker.
>
> This document is the rationale *and* the build spec. §2 is the evidence base; §3–8 turn
> each finding into a product decision; §9–10 are the data model and architecture.

---

## 1. The framework on one screen

| Layer | Decision |
|---|---|
| **Core function** | **One fixed 5×5 card** of comfort-zone challenges and new experiences — that's the only option this app offers, deliberately. There is no typing at setup: the app presents pre-researched tile ideas one at a time, Tinder-style, and you **swipe right to keep, left to skip** until the card is full (or you run out of ideas to skip). Cross a tile off when you actually do it; any completed line (row/column/diagonal) is a **bingo** — a checkpoint; the card is **done when every tile is crossed off**. |
| **Core loop** | **Cross a tile off → get stamped.** A rubber-stamp mark lands (motion), the phone kicks (haptic), a woody thunk plays (sound). A completed line draws a gold rail and fires a bingo celebration; crossing the *last* tile on the whole card fires the full-screen "CARD COMPLETE" takeover. |
| **Accessory features** | A reward ladder (1st bingo, 6th, 12th — editable, claimable tickets). A "Swap for a different idea" escape hatch per tile, and a "＋" empty-cell suggestion flow, for when a kept tile stops feeling right. An activity log in Settings. |
| **Surface-area check** | **3 tabs** — Card, Rewards, Settings. No card list, no per-card stack, no `cardId` anywhere — there is exactly one card, ever (reset starts a new one from scratch). |
| **Retention hook** | One weekly check-in notification, off by default (opt in from Settings — onboarding stays about the excitement of building the card, not a permissions prompt). Every celebration — bingo, reward, full card — pulls the card back into view. |

**What changed from the goal-tracking version this app used to be:** no questionnaire, no
backward-planning wizard, no user-typed goals or steps, no multiple cards, no sprints/
deadlines, no habit-type tiles. The mechanic is **curation, not composition** — you're not
authoring a plan, you're picking which dares you're actually willing to take on.

---

## 2. The science

Ordered by how load-bearing each is. **[meta]** = peer-reviewed meta-analysis, **[study]**
= single study, **[theory]** = well-established theoretical model, **[industry]** = weaker,
vendor-reported.

### 2.1 Choice preserves autonomy even without authorship **[theory]**
Self-determination theory ties successful goal pursuit to *autonomous motivation* — feeling
the goal is yours, not imposed. A swipe deck isn't a goal-authorship tool, but every keep/
skip decision is still a real choice: nothing lands on the card without an explicit "yes."
→ **On My Card:** swiping, not auto-filling, is the whole point of the deck. A tile you
never approved never appears on your card, and "Swap for a different idea" or "Remove this
square" keep that consent live after the deck closes, not just during onboarding.

### 2.2 Novelty and stepping outside routine reliably lift mood and vitality **[meta / study]**
Well-being research on "self-expansion" and novelty-seeking finds that trying new
activities — not just pleasant familiar ones — produces outsized gains in reported
happiness and sense of vitality, distinct from simple pleasure-seeking. Comfort-zone
psychology frames small, voluntary discomfort (a hard conversation, an unfamiliar
activity) as the mechanism that builds confidence for the next, slightly bigger thing.
→ **On My Card:** the tile bank is deliberately built across categories that stretch in
different directions — social courage, adventure, creative risk, physical challenge — not
just "do more of what you already like."

### 2.3 They monitor progress — visibly, physically **[meta]**
Harkin et al. (2016), 138 studies / ~19,900 people: prompting progress monitoring reliably
raises attainment, and **more so when progress is physically recorded and made public**.
→ **On My Card:** the card *is* the physical record. Crossing a tile *is* the log action.
Bingo count and the next reward sit in the card's own header.

### 2.4 The goal-gradient effect: effort accelerates near the finish **[study]**
Hull's goal-gradient, updated by Kivetz, Urminsky & Zheng (2006) — people push harder the
closer a goal looks. A line one cell from done is more motivating than one at 1/5.
→ **On My Card:** the fixed 5×5 geometry with a permanent FREE centre manufactures many
near-complete lines by construction — every row/column already starts one cell "ahead."

### 2.5 They celebrate small wins **[study / theory]**
Amabile & Kramer's *progress principle*: visible progress in meaningful work is the single
biggest day-to-day motivator. Every cross-off gets the full stamp + haptic + sound, long
before any line is close to done.

### 2.6 Streaks work through loss aversion; anticipation beats certainty **[theory]**
Reward-prediction-error research finds dopamine peaks on the *anticipation* of an uncertain
outcome more than its receipt. The swipe deck itself borrows this — you don't know what the
next card is until you see it, which is part of why swipe-to-reveal interactions are so
sticky in the first place.

### 2.7 They exploit "fresh starts" **[study]**
Dai, Milkman & Riis (2014): people initiate change at temporal landmarks — New Year chief
among them. A "new year bingo" card leans directly into this rather than fighting it: the
card's whole framing (one card, one year, "this is the year you say yes") *is* the fresh-
start landmark.

### 2.8 Less reading, more feeling **[practice]**
Interfaces built around large tap targets, color, and shape rather than dense text reduce
cognitive load and read as more inviting for a low-stakes, exploratory decision — exactly
what "keep or skip this idea" is. This isn't a single citation so much as the working
principle behind the whole swipe deck and the welcome screen: **say less, show more.**

---

## 3. Core function — the deck, the card, the tiles

**Building the card** (once — there is only ever one card):
1. **Welcome.** One bold line, one supporting line, a burst of overlapping colored shapes.
   No bullet list, no citations, no form fields — this is the "anticipatory energy" moment,
   not homework.
2. **Swipe deck.** One idea at a time: big emoji, short label, a soft category-tinted wash
   behind it. The note/detail is one tap away behind a small "ⓘ" — never shown by default.
   **Swipe right (or tap ✓) to keep, left (or tap ✕) to skip.** A slim progress bar tracks
   kept tiles toward 24; no "12/25" text wall. Stops the instant 24 are kept. If the bank
   runs out first, the skipped pile gets one shuffled second pass, then the deck ends with
   whatever's kept — a card that's a few tiles short just has open "＋" cells, which is
   already how an empty cell renders.
3. **Reveal.** The assembled grid stamps in with confetti and a triumph haptic. "Enter my
   card" is the only action — this is also the moment `onboardingComplete` flips, so the
   reveal always gets to play before the app hands off to the main tabs.

**On the card:**
- **Tile:** label + emoji + note (tap "ⓘ" or long-press) + `bankId` (which bank entry it
  came from, so a swap never re-offers something already rejected or already on the card).
- **Grid:** fixed 5×5, 25 cells. The centre is a permanent FREE space. 24 tiles to fill.
- **Line:** a row, column, or diagonal. **Bingo** = a completed line — a checkpoint.
- **Done:** every one of the 24 tiles is crossed off.
- **A tile that's since gone stale:** "Swap for a different idea" (long-press → sheet)
  pulls a fresh, unused bank idea into that cell. "Remove this square" clears it back to an
  empty "＋" cell, which reopens the same curated-suggestion picker used at setup — 2–3
  random unused ideas as one-tap buttons, with "or type your own" underneath as the
  fallback, not the default.

---

## 4. The tile bank — what's actually in the deck

`src/domain/tileBank.ts` — roughly 80 hand-written entries across 8 categories, gathered
from real "new year bingo" / comfort-zone-challenge lists and rewritten into the app's own
short voice (2–5 word label, emoji, one-line note for the detail view):

- **Comfort zone / social courage** 🫣 — talk to a stranger, eat alone at a restaurant, ask
  for a discount, post something real online, try karaoke, show up alone to something.
- **Adventure / travel** 🧭 — visit a new country, sleep under the stars, a no-destination
  road trip, take a solo trip, watch a sunrise somewhere new.
- **Creative / hobby** 🎨 — learn an instrument, take an art class, a photo a day for a
  month, start the project you keep postponing.
- **Health / body** 💪 — run a 5K, try a new workout style, cook five new recipes, fix your
  sleep for two weeks.
- **Career / skill / money** 💼 — learn to code, save your first $1,000, start a side
  project, ask for the raise.
- **Kindness / relationships** 💛 — an anonymous kind act, write a real letter, host a
  dinner, reconnect with someone you lost touch with.
- **Spontaneity / fun** 🎉 — try a cuisine you've never had, go to a concert, a $20 thrift-
  store outfit, say yes to a plan you'd normally skip.
- **Mindfulness / self-care** 🌱 — a full digital-detox day, journal for two weeks,
  declutter a space that's bothered you, say no to something that drains you.

`buildDeck()` round-robins across all 8 categories when shuffling, so a swipe session
doesn't clump — five travel ideas in a row would feel repetitive, not varied. Content
sources are listed under **Sources** at the bottom of this doc.

---

## 5. Core loop — the reward stack

| Channel | How |
|---|---|
| Motion (`Animated`, no Reanimated) | Cross-off: the `<Stamp>` mark scales 1.7→1 with a −8° rotate and an ink-bleed fade. Line complete: a solid gold rail draws along it. Card complete: the full-screen takeover. Swipe deck: `PanResponder` + `Animated.ValueXY` drives translate + rotate + KEEP/SKIP badge opacity as the card is dragged. |
| Haptic (`expo-haptics`) | Cross-off: `impactAsync(Rigid)` → `notificationAsync(Success)`. Swipe keep: `stampHit`. Bingo: double `impactAsync(Heavy)`. Reward: 3× `Medium`. Card complete / reveal: `triumphHit`. |
| Sound (`expo-audio`, synthesized by `scripts/gen-sounds.js`) | `stamp` (woody thunk) on cross-off and on a kept swipe · `chord` on a bingo · `fanfare` on a reward claim · `trophy` on card complete. Respects the silent switch. |

Escalation: **cross-off → bingo → reward ticket → card complete**. Crossing the last tile
can complete multiple lines at once — the card-complete takeover subsumes the individual
bingo toasts, and any newly unlocked reward still shows.

---

## 6. Retention hook — the weekly knock

- **Weekly check-in:** one `WEEKLY` local notification, **off by default**, opt-in from
  Settings — "{crossed}/24 crossed. Cross one off." Kept deliberately out of onboarding so
  the first-run experience stays about excitement, not a permissions ask.
- No sprints, no deadlines, no per-goal pings — there's one card and one cadence.
- Local notifications work in Expo Go; a dev build is more reliable for exact timing.

---

## 7. Accessory features

1. **Reward ladder** — rungs at 1 / 6 / 12 bingos (`defaultRewards()`), each an editable
   tear-off ticket with locked / unlocked / claimed states. "+ Add a rung" for more.
2. **Swap / remove / re-suggest** — the per-tile escape hatches described in §3, so a kept
   idea that stops feeling right doesn't have to sit there being ignored.
3. **Activity log** — every cross-off, bingo, and reward claim, in Settings.

---

## 8. Surface-area check — screen inventory

**Steady state: 3 tabs.**

| # | Screen | Job |
|---|---|---|
| 1 | **Card** | The 5×5 grid: cross off, bingo rails, header stats (bingos, crossed count, next reward). Tap an empty cell to fill it; long-press a filled one for its detail sheet. |
| 2 | **Rewards** | The reward ladder — locked/unlocked/claimed, "+ Add a rung." |
| 3 | **Settings** | Card name, sound/haptics, weekly check-in toggle, activity log, "every square crossed off" pill once complete, reset. |

**Modal:** `TileSheet` — view/swap/remove a filled tile, or pick/type a suggestion for an
empty one.

**First-run only:** Welcome → swipe deck → reveal → lands on the Card tab with all 24 (or
however many were kept) tiles filled in.

Celebrations are overlays, not screens.

---

## 9. Data model

See [src/domain/types.ts](src/domain/types.ts). Sketch (schema v4):

```ts
const GRID = 5, CELL_COUNT = 25, CENTER = 12, CAPACITY = 24;

type TileCategory = 'comfort'|'adventure'|'creative'|'health'|'career'
                   |'kindness'|'fun'|'mindful';

Tile     { id; cell: 0..24 except 12; label; emoji?; note?; category?; bankId?; doneAt? }
Reward   { id; bingos; text; claimedAt? }
Card     { title; year; createdAt; tiles: Tile[]; rewards: Reward[] }
Settings { onboardingComplete: boolean; sound; haptics; weeklyCheckIn; … }
AppState { schemaVersion: 4; card: Card | null; settings: Settings; log }
```

`card` is `null` until the swipe deck finishes and the user taps "Enter my card" on the
Reveal screen — `settings.onboardingComplete` is a *separate* flag from `card` existing,
set only at that tap (see the stale-ref/ordering note in §10 — this exists specifically so
the Reveal animation always gets to play before the root navigator swaps away). The grid is
a fixed constant, not parameterized by size — there's only one size now.

---

## 10. Architecture

```
src/
  domain/   types.ts · logic.ts (pure selectors, fixed 5×5) · tileBank.ts (the curated
            deck + buildDeck/shuffle/randomSuggestions) · seed.ts (emptyState() only)
  storage/  Repository interface + LocalRepository (AsyncStorage, key
            onmycard:appstate:v4)  ← Supabase swap point
  state/    AppStateContext.tsx — useApp(); hydrate / persist / foreground reconcile;
            createCard / pressTile / setTile / clearTile / rewards / settings actions;
            celebration queue. (See the "stale-ref" note below.)
  feedback/ haptics.ts · sound.ts · Celebration.tsx (Confetti, CelebrationOverlay:
            bingo / card / reward variants)
  notifications/ scheduler.ts — one weekly check-in, only if a card exists and it's on
  ui/       theme.ts (warm paper-card tokens + categoryColor/categoryWash) ·
            components.tsx (CardTile, Stamp, BingoRail, RoundButton, RewardTicket, …)
  navigation/ RootNavigator.tsx — onboarding gate (`!onboardingComplete || !card`) → 3
              tabs + a TileSheet modal
  screens/  OnboardingNavigator (welcome/deck/reveal) · SwipeDeckScreen ·
            CardScreen · RewardsScreen · SettingsScreen · TileSheetScreen
```

No Reanimated, no `react-native-gesture-handler` — the swipe deck is the standard "Tinder
card" recipe built from the built-in `PanResponder` + `Animated.ValueXY`
(`onPanResponderMove` maps gesture dx/dy onto translate + a rotation interpolation;
`onPanResponderRelease` either flings the card off past `SWIPE_THRESHOLD` or springs it
back). A `forwardRef`/`useImperativeHandle` pattern lets the ✕/✓ buttons drive the exact
same animation as a drag.

**A concurrency note worth keeping in mind when extending `AppStateContext`:** several
actions read `stateRef.current` synchronously to compute their next state (rather than
using React's `setState(prev => ...)` functional form), because they also need to hand back
a synchronous result — e.g. `pressTile` returns a `TileOutcome` the screen uses immediately
for animation. `stateRef.current` is only guaranteed to catch up to `state` on the *next
render*, so two such actions firing back-to-back inside one synchronous call can otherwise
have the second call silently discard the first, reading a stale snapshot. This is exactly
why the onboarding flow keeps `createCard(...)` and `updateSettings({ onboardingComplete:
true })` as two *separately triggered* actions (deck-finish vs. the Reveal screen's "Enter
my card" tap) rather than firing them back-to-back — but every action that computes a next
state by reading `stateRef.current` directly must still go through the `commitState()`
helper, which updates `stateRef.current` immediately rather than waiting for a render.
Actions using the plain functional `setState(prev => ...)` form don't have this problem —
React applies queued functional updates in order regardless of render timing — but any new
action written in the "read-stateRef-then-setState-a-plain-object" style must call
`commitState`, not `setState`, or this exact bug reappears.

**Verify:** `npx tsc --noEmit` · `npx expo-doctor` · `npx expo export --platform ios` ·
`npx expo start --ios`, walk Welcome → swipe deck (✕/✓ buttons and drag both work) → keep
tiles until 24 → Reveal animates in and "Enter my card" lands on a full Card grid → cross a
line to bingo (celebration + reward-ladder progress) → long-press a filled tile for the
swap/remove sheet → tap an empty cell for the suggestion picker → Settings rename/reset
returns to Welcome with no card.

---

## Sources

Peer-reviewed / research-backed:
- Self-determination theory: [SDT goal-motives review](https://selfdeterminationtheory.org/SDT/documents/2008_KoestnerOtisPowesPelletierGagnon_JOP.pdf)
- [Harkin et al. (2016), *Does monitoring goal progress promote goal attainment?*](https://www.apa.org/pubs/journals/releases/bul-bul0000025.pdf) — Psychological Bulletin
- Kivetz, Urminsky & Zheng (2006), *The goal-gradient hypothesis resurrected* — Journal of Marketing Research
- Dai, Milkman & Riis (2014), *The Fresh Start Effect*, Management Science
- Amabile & Kramer (2011), *The Progress Principle*

Content sources for the tile bank (not research citations — real "new year bingo" and
comfort-zone-challenge templates the bank draws its tone and coverage from):
- [Hip2Save — New Year's Bingo](https://hip2save.com/diy/new-years-bingo/)
- [icebreaker-games.org — 2026 Bingo Card Ideas](https://icebreaker-games.org/2026-bingo-card-ideas)
- [The Zag — Comfort Zone Challenges](https://www.thezag.com/comfort-zone-challenges/)
- [Healthy Happy Impactful — Ways to Get Out of Your Comfort Zone](https://healthyhappyimpactful.com/ways-get-out-comfort-zone-quotes/)
- [Bingo Card Creator — Bucket List Bingo](https://www.bingocardcreator.com/bingo-cards/bucket-list/)

Industry / practice:
- [Streaks & milestones for retention (Plotline)](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps)
