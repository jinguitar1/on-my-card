/**
 * Seeded, deterministic balanced placement of goals onto a card's 24 non-center cells —
 * no line (row/column/diagonal) may end up with more than 2 Hard-difficulty tiles. Bounded
 * attempts (never an unbounded loop); on failure, explains *which* lines can't be
 * satisfied rather than silently placing anyway, per the product rules' own instruction
 * ("explain the conflict, let the user revise the selected goals").
 */

import { CENTER, LINE_CELLS, LINE_KEYS, type LineKey } from './types';

export interface PlacementGoal {
  id: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export type PlacementResult =
  | { ok: true; cellByGoalId: Record<string, number> }
  | { ok: false; conflictingLines: LineKey[] };

const MAX_ATTEMPTS = 250;

const NON_CENTER_CELLS: number[] = Array.from({ length: 25 }, (_, i) => i).filter((c) => c !== CENTER);

// --- seeded PRNG: same string-hash-to-int idiom companion.ts's pickForToday already uses,
// here feeding a small, standard mulberry32 generator instead of a plain modulo pick, since
// placement needs a full shuffle, not a single index. ---

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function mulberry32(seedInt: number): () => number {
  let a = seedInt;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Which of the 12 lines have more than 2 Hard-difficulty tiles under this cell
 *  assignment. Empty array means the assignment is valid. Exported on its own (not just
 *  used internally by `placeTiles`) so `shuffleCard` (AppStateContext) can re-validate a
 *  user-triggered reshuffle of an already-placed card against the same rule. */
export function conflictingLines(cellByGoalId: Record<string, number>, goals: PlacementGoal[]): LineKey[] {
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const hardCells = new Set(
    Object.entries(cellByGoalId)
      .filter(([goalId]) => goalById.get(goalId)?.difficulty === 'hard')
      .map(([, cell]) => cell)
  );
  return LINE_KEYS.filter((key) => LINE_CELLS[key].filter((cell) => hardCells.has(cell)).length > 2);
}

/** Assigns each goal a cell (fewer than 24 goals leaves the remaining cells unassigned —
 *  the caller renders those as empty "+" tiles, same as today's partial-card handling).
 *  Deterministic for a given `(goals, seed)` pair — the same seed always produces the same
 *  assignment, so a reported "impossible" case is reproducible from just the seed. */
export function placeTiles(goals: PlacementGoal[], seed: string): PlacementResult {
  const rand = mulberry32(hashSeed(seed));
  let lastAttempt: Record<string, number> = {};
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shuffledCells = seededShuffle(NON_CENTER_CELLS, rand);
    const cellByGoalId: Record<string, number> = {};
    goals.forEach((g, i) => {
      cellByGoalId[g.id] = shuffledCells[i];
    });
    const bad = conflictingLines(cellByGoalId, goals);
    if (bad.length === 0) return { ok: true, cellByGoalId };
    lastAttempt = cellByGoalId;
  }
  return { ok: false, conflictingLines: conflictingLines(lastAttempt, goals) };
}
