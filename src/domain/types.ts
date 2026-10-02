/**
 * On My Card — core data model (schema v5).
 *
 * The user can build any number of cards (a "My Cards" dashboard lists them); each one
 * is a fixed 5×5 grid of comfort-zone challenges and new experiences, built by swiping
 * through a curated bank of ideas (see tileBank.ts) rather than typed in. The centre
 * cell (12) is a permanent FREE space. Completing a line (row/column/diagonal) is a
 * bingo — a checkpoint against that card's own reward ladder; a card is complete when
 * every tile on it is crossed off. (Schema v4 and earlier had exactly one card, ever —
 * see AppStateContext's hydrate migration for how an old single-card blob becomes the
 * first entry in `cards`.)
 *
 * Plain JSON so it round-trips through the Repository (local now, Supabase later).
 */

export const SCHEMA_VERSION = 5;

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
}

export interface Reward {
  id: string;
  bingos: number; // unlocks at this many completed lines
  text: string;
  claimedAt?: number;
}

export interface Card {
  id: string;
  title: string;
  /** A small personal touch shown big on the dashboard — how the user feels about this
   *  card, not a category icon. Free choice (their own device emoji keyboard), not a
   *  curated set. Optional; falls back to a generic 🃏 wherever it's displayed. */
  emoji?: string;
  /** Free text the user gave when creating this card, if it was AI-researched
   *  (FEATURES.aiCardGen) — absent for a curated-bank card. Kept for reference/future AI
   *  coaching context; not shown anywhere in the UI yet. */
  intent?: string;
  year: number;
  createdAt: number;
  tiles: Tile[]; // up to 24, from the swipe deck
  rewards: Reward[];
  /** The one tile the user is currently focusing on, if any — dims the rest of the grid
   *  and steers AI coaching (nudge/reflection) toward it. Never a crossed tile: crossing
   *  the focused tile off clears this. */
  focusedTileId?: string;
}

/** A tile the user has already swiped a decision on while building a card — kept or
 *  rejected. Structurally identical to tileBank.ts's `TileIdea`, defined separately here
 *  (rather than imported) so this file never depends on tileBank.ts, which itself
 *  depends on this file for `TileCategory` — importing the other way would be circular. */
export interface DraftCardTile {
  id: string;
  emoji: string;
  label: string;
  note: string;
  category?: TileCategory;
}

/** An in-progress "building a card" session, saved so it can be paused and resumed —
 *  picking 24 tiles in one sitting isn't always realistic. Cleared once the card is
 *  actually created (`AppStateContext`'s `clearDraftCard`).
 *
 *  `AppState.draftCards` is a *list*, not a single slot — a card being AI-researched in
 *  the background must not block starting a second, independent card (bank or AI) in the
 *  meantime, and a single-slot model can't tell two concurrent drafts apart without one
 *  silently overwriting the other's progress. Each draft carries its own stable `id`,
 *  minted client-side the moment a "Create a new card" session starts and threaded through
 *  every `saveDraftCard`/`clearDraftCard` call for that session — it's unrelated to the
 *  `Card.id` a draft eventually becomes once `createCard` runs. */
export interface DraftCard {
  id: string;
  kept: DraftCardTile[];
  rejected: DraftCardTile[];
  usedSecondPass: boolean;
  /** The name typed on the intent screen, if any — persisted here (not just local screen
   *  state) specifically so it survives navigating away during a background generation
   *  and back; it used to live only in CreateCardScreen's own state and was silently lost
   *  on that round trip, which is why a named "Disneyland 2026" draft could come back as
   *  the generic "My 2026 Card" default once research finished. */
  title?: string;
  /** Only set for an AI-researched card (FEATURES.aiCardGen) — the full generated pool of
   *  ideas, persisted so a resumed draft's remaining deck doesn't silently fall back to
   *  the curated bank (SwipeDeckScreen has no other way to know a non-bank deck was ever
   *  in play). Absent for a bank-sourced draft. */
  pool?: DraftCardTile[];
  /** Free text the user gave the AI about what this card is for — only set alongside
   *  `pool`. */
  intent?: string;
  source?: 'bank' | 'ai';
  /** True while a tilegen request is in flight — set the moment "Generate deck" is
   *  tapped (before `pool` exists) and cleared once it resolves either way, so the
   *  dashboard can show research-in-progress state across navigation instead of the
   *  user being stuck waiting on CreateCardScreen itself. */
  generating?: boolean;
  /** Set only if the in-flight generation above failed, so re-opening "Create a new
   *  card" after navigating away can surface what happened instead of silently
   *  pretending nothing was ever tried. Cleared on the next generate attempt. */
  genError?: string;
}

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
  /** Every bingo card the user has built — empty until the welcome → swipe-deck →
   *  reveal flow finishes building the first one. Newest first. */
  cards: Card[];
  /** Every card currently being built — empty array when nothing's in progress. Was a
   *  single `draftCard: DraftCard | null` slot (added after schema v5 shipped as a purely
   *  additive field); changed to a list so a background AI-researched draft and an
   *  independent second draft can coexist instead of one clobbering the other. See
   *  `AppStateContext`'s hydrate for the (also lossless, no schema-version-bump) transform
   *  from the old single-slot shape. */
  draftCards: DraftCard[];
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
