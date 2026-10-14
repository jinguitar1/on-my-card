/**
 * On My Card — core data model (schema v6).
 *
 * Schema v6 (Stage 1 of the timeline/goal rearchitecture) replaces the old permanent,
 * never-expiring `Card` with a `Schedule` (daily/weekly/monthly/annual/custom, see
 * schedule.ts for the boundary math) that produces a sequence of `CardInstance`s, one per
 * resolved period — a schedule is the persistent, named thing; an instance is one
 * period's playable 5×5 board, built from `Goal` library records via `placement.ts`'s
 * balanced, Hard-tile-constrained deal. See `src/storage/migrations.ts` for how a v5
 * permanent `Card`/`Tile` losslessly becomes a never-expiring custom `Schedule` with one
 * `CardInstance`. (Schema v4 and earlier had exactly one card, ever, and v5 had any number
 * of permanent cards with no timeline at all — both migrations live in that same file now,
 * not inlined in AppStateContext's hydrate.)
 *
 * The centre cell (12) is still a permanent FREE space; completing a line is still a
 * bingo. Scoring, win-pattern tiers beyond plain lines, declared rewards, swap/rollover
 * limits, streaks, and photo-proof UI are Stage 2+ — see `CardInstance.predecessorInstanceId`
 * and `Schedule.instances`' full retained history, both added now specifically so those
 * stages are additive instead of a second migration.
 *
 * Plain JSON so it round-trips through the Repository (local now, Supabase later).
 */

import type { CardSchedule } from './schedule';

export const SCHEMA_VERSION = 6;

export const GRID = 5;
export const CELL_COUNT = GRID * GRID; // 25
export const CENTER = 12; // FREE SPACE
export const CAPACITY = CELL_COUNT - 1; // 24 fillable tiles

export type LineKey =
  | 'R0' | 'R1' | 'R2' | 'R3' | 'R4'
  | 'C0' | 'C1' | 'C2' | 'C3' | 'C4'
  | 'D0' | 'D1';

export const LINE_KEYS: LineKey[] = ['R0', 'R1', 'R2', 'R3', 'R4', 'C0', 'C1', 'C2', 'C3', 'C4', 'D0', 'D1'];

/** Cell indices for each of the 12 lines (row-major, 0..24). */
export const LINE_CELLS: Record<LineKey, number[]> = (() => {
  const out = {} as Record<LineKey, number[]>;
  for (let r = 0; r < GRID; r++) out[`R${r}` as LineKey] = Array.from({ length: GRID }, (_, c) => r * GRID + c);
  for (let c = 0; c < GRID; c++) out[`C${c}` as LineKey] = Array.from({ length: GRID }, (_, r) => r * GRID + c);
  out.D0 = Array.from({ length: GRID }, (_, i) => i * GRID + i); // ↘
  out.D1 = Array.from({ length: GRID }, (_, i) => i * GRID + (GRID - 1 - i)); // ↙
  return out;
})();

export const GOAL_ACCENTS = ['#E4572E', '#2E8B84', '#3D5A80', '#B5179E', '#6A994E', '#C08A2E', '#7B5EA7'] as const;

/** A category tags each tile-bank idea for shuffling variety and card-face colour. */
export type TileCategory =
  | 'comfort' | 'adventure' | 'creative' | 'health' | 'career' | 'kindness' | 'fun' | 'mindful';

/** One accent per category, in the order above — the swipe deck's colour wash. */
export const CATEGORY_ACCENTS: Record<TileCategory, string> = {
  comfort: '#E4572E',
  adventure: '#3D5A80',
  creative: '#B5179E',
  health: '#2E8B84',
  career: '#C08A2E',
  kindness: '#D6558C',
  fun: '#F5A623',
  mindful: '#6A994E',
};

/** Display name per category — section headers in the curated-presets browser
 *  (SuggestionPicker), axis labels on RadarChart. */
export const CATEGORY_LABELS: Record<TileCategory, string> = {
  comfort: 'Comfort',
  adventure: 'Adventure',
  creative: 'Creative',
  health: 'Health',
  career: 'Career',
  kindness: 'Kindness',
  fun: 'Fun',
  mindful: 'Mindful',
};

/** One step in a tile's manual plan (TileEditScreen's "Set up a plan") — user-typed, not
 *  AI-generated; AI features are on hold for v1. Keyed by its own `id`, not array
 *  position, since a manual list supports real mid-list delete (unlike the AI version it
 *  replaced, which only ever replaced its whole array at once via "Try again"). */
export interface PlanStep {
  id: string;
  title: string;
  detail?: string;
  done?: boolean;
}

export interface Tile {
  id: string;
  cell: number; // 0..24, never CENTER
  label: string;
  emoji?: string;
  note?: string; // shown on long-press / the ⓘ tap
  category?: TileCategory;
  /** The tile-bank idea this came from, if any — lets "swap" avoid repeats. Absent for a
   *  hand-typed tile (the escape hatch on an empty cell). */
  bankId?: string;
  doneAt?: number; // set once crossed off
  /** The user's own step-by-step breakdown of this tile, if they've set one up — purely
   *  additive, absent on every tile that existed before this field did. */
  plan?: PlanStep[];
}

export interface Reward {
  id: string;
  bingos: number; // unlocks at this many completed lines
  text: string;
  claimedAt?: number;
}

// --- Stage 1 of the timeline/goal rearchitecture (schema v6) ------------------------
//
// A `Goal` is a reusable library record (title, difficulty, type, recurring target) —
// separate from a `CardTileInstance`, which snapshots the gameplay fields it needs
// (difficulty/type/target) at the moment a card is generated, plus a `goalId` back-
// reference. This split is what the product rules' "don't calculate historical results
// from mutable current goal definitions" requires: editing a Goal later never rewrites
// what an already-generated card's tiles say they were worth.
//
// A `Schedule` (the persisted, app-level record — extends schedule.ts's pure
// `CardSchedule`, which stays dependency-free so its boundary math and its tests never
// need to know about the rest of this file) owns every `CardInstance` it has ever had,
// forever, append-only. Streak computation (Stage 2+) needs the full run; a "history
// screen hasn't been built yet" is a UI gap, not a reason to discard data a user is
// already accumulating during this stage's TestFlight window.

export interface Goal {
  id: string;
  title: string;
  details?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'oneOff' | 'recurring';
  /** Required when `type === 'recurring'` — how many times this goal needs doing before
   *  the tile it's snapshotted onto counts as done. */
  recurringTarget?: number;
  /** Carried from the curated bank when a goal is added that way (SuggestionPicker's
   *  "Curated Ideas") — absent for a hand-typed goal. Every one of these is copied onto
   *  a `CardTileInstance` at generation time, same as the goal's title/difficulty/type. */
  emoji?: string;
  note?: string;
  category?: TileCategory;
  bankId?: string;
  createdAt: number;
  /** Archived goals stay in the library (past cards still reference them by id for
   *  display) but are excluded from "eligible goals" counts for new cards. */
  archivedAt?: number;
}

export interface CardTileInstance {
  id: string;
  cell: number; // 0..24, never CENTER
  /** Which `Goal` this tile was generated from. */
  goalId: string;
  // Snapshotted from the Goal at generation time — see the module comment above for why
  // this isn't just a live join against `goalId`.
  title: string;
  emoji?: string;
  note?: string;
  category?: TileCategory;
  bankId?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'oneOff' | 'recurring';
  target?: number;
  /** Current progress toward `target`, for a recurring tile. Never exceeds `target`. */
  progress?: number;
  doneAt?: number;
  plan?: PlanStep[];
  /** Local-only photo reference — optional accountability, never a completion gate (Stage
   *  1 doesn't yet expose UI for this; the field exists so Stage 2's photo-proof UI is
   *  additive, not a second migration). */
  photoUri?: string;
  /** Epoch ms — an optional deadline for this one tile, this one card cycle. Instance-local
   *  like `plan`/`progress`/`doneAt`, not on `Goal`: a deadline is specific to "finish this
   *  by Friday" on *this* card, not a permanent property of the reusable goal, so a fresh
   *  tile (new cycle, or a swap) never inherits a stale one. Set/cleared from TileEditScreen,
   *  purely informational for now (no overdue gating or scoring tie-in). */
  deadline?: number;
}

export interface CardInstance {
  id: string;
  scheduleId: string;
  /** This instance's position in its schedule's period sequence — see schedule.ts's
   *  `Period.index`. */
  periodIndex: number;
  /** Resolved half-open range for this specific instance, frozen at creation (not
   *  re-resolved later — a schedule's own anchor could in principle be inspected again,
   *  but an instance's actual played period never silently moves). */
  start: number;
  end: number;
  createdAt: number;
  /** The exact seed `placement.ts` used to generate this instance's layout — kept for
   *  reproducibility if a placement conflict is ever reported back. */
  placementSeed: string;
  tiles: CardTileInstance[];
  swapUsed: boolean;
  /** The instance this one replaced, if any (every repeating schedule's 2nd+ instance has
   *  one). Unused by Stage 1 itself — Stage 2's rollover selection reads a predecessor's
   *  incomplete tiles through this link, so it exists now rather than being unreconstructable
   *  later. */
  predecessorInstanceId?: string;
  lifecycleState: 'active' | 'finalized';
  /** Carried over verbatim from a migrated v5 `Card.rewards` — legacy/decorative until
   *  Stage 2 reshapes rewards into the tier system the product rules describe. Absent on
   *  any instance created fresh under this schema. */
  rewards?: Reward[];
  focusedTileId?: string;
}

/** The persisted, app-level schedule record. Extends schedule.ts's pure `CardSchedule`
 *  (title/mode/repeat/timezone/anchor fields/lifecycle) with the one thing that's
 *  app-state, not boundary math: every instance this schedule has ever produced. */
export interface Schedule extends CardSchedule {
  instances: CardInstance[];
}

// `Card`, `Tile`, `DraftCardTile`, and `DraftCard` (the pre-Stage-1 permanent-card model,
// and the paused-build-session concept that went with it) are gone from the live domain
// model as of schema v6 — see `src/storage/migrations.ts` for the legacy shapes, kept
// there (migration-only, not exported for general use) since v5 data still needs to be
// read and transformed. Goals are now a persistent library (see `Goal` above) you build up
// over time rather than a 24-in-one-sitting swipe session, so there's no longer a
// multi-step "build a card" session to pause mid-way — picking goals + a timeline +
// generating is meant to be quick enough not to need it.

export type LogKind = 'tile' | 'bingo' | 'card' | 'reward';

export interface LogEntry {
  id: string;
  ts: number;
  kind: LogKind;
  text: string;
}

export interface Settings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  weeklyCheckinDays: number[]; // 0 (Sun) .. 6 (Sat), one or more, at least one always kept
  weeklyCheckinMinutes: number[]; // minutes since midnight (0..1439), one or more — empty means "not yet configured"
  /** Flips true only once the welcome → swipe-deck → reveal flow is dismissed — kept
   *  separate from `card` existing so the reveal screen gets to play out before
   *  RootNavigator swaps to the main app. */
  onboardingComplete: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  hapticsEnabled: true,
  notificationsEnabled: false,
  weeklyCheckinDays: [1], // Monday
  weeklyCheckinMinutes: [], // nothing chosen yet — SettingsScreen shows "+ Add a time"
  onboardingComplete: false,
};

export interface AppState {
  schemaVersion: number;
  /** The goal library — every `Goal` the user has defined, across every schedule. Empty
   *  until onboarding's first card is built. */
  goals: Goal[];
  /** Every schedule the user has created — the dashboard lists these (not raw cards
   *  directly anymore), each opening its current `CardInstance` when opened. Newest
   *  first. */
  schedules: Schedule[];
  settings: Settings;
  log: LogEntry[]; // newest first
}

/** What a single tile interaction produced — drives the celebration queue. */
export interface TileOutcome {
  crossed: boolean;
  uncrossed: boolean;
  bonus: boolean;
  newBingoLines: LineKey[];
  cardCompleted: boolean;
  unlockedRewardIds: string[];
}

export const EMPTY_TILE_OUTCOME: TileOutcome = {
  crossed: false,
  uncrossed: false,
  bonus: false,
  newBingoLines: [],
  cardCompleted: false,
  unlockedRewardIds: [],
};

export type CelebrationEvent =
  | { kind: 'bingo'; line: LineKey }
  | { kind: 'card' }
  | { kind: 'reward'; rewardId: string };
