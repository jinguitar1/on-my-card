/**
 * Pure selectors + date math over the single Card. Nothing here mutates or persists.
 */

import {
  CENTER,
  GRID,
  LINE_CELLS,
  LINE_KEYS,
  type Card,
  type LineKey,
  type Reward,
  type Tile,
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

// --- tiles on the card ------------------------------------------------

export function tileAt(card: Card, cell: number): Tile | undefined {
  return card.tiles.find((t) => t.cell === cell);
}

export function tileById(card: Card, id: string): Tile | undefined {
  return card.tiles.find((t) => t.id === id);
}

export function isTileCrossed(tile: Tile | undefined): boolean {
  return !!tile?.doneAt;
}

export function isCellDone(card: Card, cell: number): boolean {
  if (cell === CENTER) return true;
  return isTileCrossed(tileAt(card, cell));
}

// --- lines & bingos -----------------------------------------------------

export function lineProgress(card: Card, line: LineKey): { done: number; total: number } {
  const cells = LINE_CELLS[line];
  return { done: cells.filter((c) => isCellDone(card, c)).length, total: cells.length };
}

export function isLineComplete(card: Card, line: LineKey): boolean {
  return LINE_CELLS[line].every((c) => isCellDone(card, c));
}

export function completedLines(card: Card): LineKey[] {
  return LINE_KEYS.filter((l) => isLineComplete(card, l));
}

export function bingoCount(card: Card): number {
  return completedLines(card).length;
}

export const MAX_BINGOS = LINE_KEYS.length; // 12, fixed — one grid size

/** Lines one cell away from complete, with the missing cell. */
export function nearMissLines(card: Card): { line: LineKey; missingCell: number }[] {
  const out: { line: LineKey; missingCell: number }[] = [];
  for (const line of LINE_KEYS) {
    const open = LINE_CELLS[line].filter((c) => !isCellDone(card, c));
    if (open.length === 1) out.push({ line, missingCell: open[0] });
  }
  return out;
}

/** The card is complete once every tile that exists on it is crossed off. */
export function isCardComplete(card: Card): boolean {
  return card.tiles.length > 0 && card.tiles.every((t) => isTileCrossed(t));
}

export function cardSummary(card: Card): { crossed: number; total: number; bingos: number } {
  const total = card.tiles.length;
  const crossed = card.tiles.filter((t) => isTileCrossed(t)).length;
  return { crossed, total, bingos: bingoCount(card) };
}

// --- rewards ------------------------------------------------------

export function sortedRewards(card: Card): Reward[] {
  return [...card.rewards].sort((a, b) => a.bingos - b.bingos);
}

export function rewardUnlocked(card: Card, reward: Reward): boolean {
  return bingoCount(card) >= reward.bingos;
}

export function nextReward(card: Card): Reward | undefined {
  const n = bingoCount(card);
  return sortedRewards(card).find((r) => r.bingos > n);
}

export function claimableRewards(card: Card): Reward[] {
  return sortedRewards(card).filter((r) => rewardUnlocked(card, r) && !r.claimedAt);
}
