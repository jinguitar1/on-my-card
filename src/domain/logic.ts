/**
 * Pure selectors + date math over a single `CardInstance`. Nothing here mutates or
 * persists.
 */

import {
  CENTER,
  GRID,
  LINE_CELLS,
  LINE_KEYS,
  type CardInstance,
  type CardTileInstance,
  type LineKey,
  type Reward,
  type TileCategory,
} from './types';

// --- ids & dates --------------------------------------------------------

let uidCounter = 0;
export function uid(prefix = 'id'): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}`;
}

export function prettyDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** ~16% of cross-offs get a bonus flourish. Deterministic per tile. */
export function bonusFor(tileId: string): boolean {
  return hashStr(tileId) % 100 < 16;
}

// --- grid geometry (fixed 5×5 — the only size this app offers) ----------

export function rowOf(cell: number): number {
  return Math.floor(cell / GRID);
}
export function colOf(cell: number): number {
  return cell % GRID;
}

export function lineLabel(line: LineKey): string {
  if (line[0] === 'R') return `Row ${Number(line[1]) + 1}`;
  if (line[0] === 'C') return `Column ${Number(line[1]) + 1}`;
  return line === 'D0' ? 'Diagonal ↘' : 'Diagonal ↙';
}

export function lineOrientation(line: LineKey): 'row' | 'col' | 'diagDown' | 'diagUp' {
  if (line[0] === 'R') return 'row';
  if (line[0] === 'C') return 'col';
  return line === 'D0' ? 'diagDown' : 'diagUp';
}

// --- tiles on the card instance ------------------------------------------------

export function tileAt(instance: CardInstance, cell: number): CardTileInstance | undefined {
  return instance.tiles.find((t) => t.cell === cell);
}

export function tileById(instance: CardInstance, id: string): CardTileInstance | undefined {
  return instance.tiles.find((t) => t.id === id);
}

/** A one-off tile is done once crossed; a recurring tile is done once its progress has
 *  reached its target (which is also exactly when `doneAt` gets set — see
 *  AppStateContext's `pressTile`) — this reads `doneAt` either way rather than
 *  recomputing from `progress`/`target`, so the two can never disagree. */
export function isTileCrossed(tile: CardTileInstance | undefined): boolean {
  return !!tile?.doneAt;
}

export function isCellDone(instance: CardInstance, cell: number): boolean {
  if (cell === CENTER) return true;
  return isTileCrossed(tileAt(instance, cell));
}

// --- lines & bingos -----------------------------------------------------

export function lineProgress(instance: CardInstance, line: LineKey): { done: number; total: number } {
  const cells = LINE_CELLS[line];
  return { done: cells.filter((c) => isCellDone(instance, c)).length, total: cells.length };
}

export function isLineComplete(instance: CardInstance, line: LineKey): boolean {
  return LINE_CELLS[line].every((c) => isCellDone(instance, c));
}

export function completedLines(instance: CardInstance): LineKey[] {
  return LINE_KEYS.filter((l) => isLineComplete(instance, l));
}

export function bingoCount(instance: CardInstance): number {
  return completedLines(instance).length;
}

export const MAX_BINGOS = LINE_KEYS.length; // 12, fixed — one grid size

/** Lines one cell away from complete, with the missing cell. */
export function nearMissLines(instance: CardInstance): { line: LineKey; missingCell: number }[] {
  const out: { line: LineKey; missingCell: number }[] = [];
  for (const line of LINE_KEYS) {
    const open = LINE_CELLS[line].filter((c) => !isCellDone(instance, c));
    if (open.length === 1) out.push({ line, missingCell: open[0] });
  }
  return out;
}

/** The card instance is complete once every tile that exists on it is crossed off. */
export function isCardComplete(instance: CardInstance): boolean {
  return instance.tiles.length > 0 && instance.tiles.every((t) => isTileCrossed(t));
}

export function cardSummary(instance: CardInstance): { crossed: number; total: number; bingos: number } {
  const total = instance.tiles.length;
  const crossed = instance.tiles.filter((t) => isTileCrossed(t)).length;
  return { crossed, total, bingos: bingoCount(instance) };
}

// --- rewards (legacy, carried over from a migrated v5 card — see CardInstance.rewards'
// own doc comment; Stage 2 reshapes this into the real tier system) ------------------

export function sortedRewards(instance: CardInstance): Reward[] {
  return [...(instance.rewards ?? [])].sort((a, b) => a.bingos - b.bingos);
}

export function rewardUnlocked(instance: CardInstance, reward: Reward): boolean {
  return bingoCount(instance) >= reward.bingos;
}

export function nextReward(instance: CardInstance): Reward | undefined {
  const n = bingoCount(instance);
  return sortedRewards(instance).find((r) => r.bingos > n);
}

export function claimableRewards(instance: CardInstance): Reward[] {
  return sortedRewards(instance).filter((r) => rewardUnlocked(instance, r) && !r.claimedAt);
}

// --- radar stats ------------------------------------------------

export const RADAR_CATEGORIES: TileCategory[] = [
  'comfort', 'adventure', 'creative', 'health', 'career', 'kindness', 'fun', 'mindful',
];

export interface CategoryStat {
  category: TileCategory;
  /** Crossed-off tiles in this category. */
  current: number;
  /** All tiles in this category currently on the card (crossed + open) — "where your
   *  stats land if you finish everything you've already committed to." */
  projected: number;
}

/** One current/projected pair per category, in a fixed axis order — the "quick glance"
 *  radar on the Card tab. */
export function radarStats(instance: CardInstance): CategoryStat[] {
  return RADAR_CATEGORIES.map((category) => {
    const inCategory = instance.tiles.filter((t) => t.category === category);
    return {
      category,
      current: inCategory.filter((t) => isTileCrossed(t)).length,
      projected: inCategory.length,
    };
  });
}
