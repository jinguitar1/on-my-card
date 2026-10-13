/**
 * Pure growth-stage + daily-line selectors for the companion (src/ui/Companion.tsx).
 * Nothing here is new persisted state — every input already exists on `Card`.
 */

import { bingoCount, cardSummary, isCardComplete, nearMissLines, tileAt } from './logic';
import type { Card } from './types';

export type CompanionStage = 0 | 1 | 2 | 3 | 4;

/** The companion's facial expression, driven by percent-of-tiles-crossed — a different
 *  axis than `stage` (which is bingo-count-based and drives body color/size). A card can
 *  have zero bingos yet (stage 0) while still being, say, 40% crossed (lots of singles,
 *  no completed line yet), and the face should reflect that real progress even though
 *  the stage/body hasn't grown — worried/low moods at low completion, building through
 *  neutral and into visibly excited/triumphant moods as the card actually fills in. */
export type CompanionMood = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CompanionState {
  stage: CompanionStage;
  label: string;
  mood: CompanionMood;
  /** 0..100 — tiles crossed as a percentage of the card's total fillable tiles. */
  pct: number;
  crossed: number;
  total: number;
  bingos: number;
  isComplete: boolean;
}

function moodForPct(pct: number): CompanionMood {
  if (pct >= 100) return 6;
  if (pct >= 85) return 5;
  if (pct >= 65) return 4;
  if (pct >= 45) return 3;
  if (pct >= 25) return 2;
  if (pct >= 1) return 1;
  return 0;
}

/** Mirrors the reward ladder's own default rungs (1 / 6 / 12 bingos — see `defaultRewards()`
 *  in AppStateContext.tsx) rather than inventing new breakpoints, plus a full-card-complete
 *  stage beyond the last rung (strictly stronger than 12 bingos: every tile, not just every
 *  line). Named for bingo status, not a plant-growth metaphor — "Seedling"/"Sprout"/"Bloom"
 *  read as a disconnected theme sitting on top of a bingo card, not a description of the
 *  card itself; these name what's actually true at each stage. */
const STAGE_LABELS: Record<CompanionStage, string> = {
  0: 'Just Started',
  1: 'Warming Up',
  2: 'On a Roll',
  3: 'Almost There',
  4: 'Card Complete',
};

export function companionState(card: Card): CompanionState {
  const { crossed, total, bingos } = cardSummary(card);
  const complete = isCardComplete(card);
  const stage: CompanionStage = complete ? 4 : bingos >= 12 ? 3 : bingos >= 6 ? 2 : bingos >= 1 ? 1 : 0;
  const pct = total > 0 ? (crossed / total) * 100 : 0;
  return { stage, label: STAGE_LABELS[stage], mood: moodForPct(pct), pct, crossed, total, bingos, isComplete: complete };
}

/** Deterministic per-day pick so the line changes daily without flickering between renders
 *  the same day — a plain `Date`-seeded index, no stored state. */
function pickForToday<T>(options: T[]): T {
  const dayKey = new Date().toISOString().slice(0, 10);
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

const STAGE_LINES: Record<CompanionStage, string[]> = {
  0: ["Pick a tile and let's get started.", 'Every card starts at zero. No rush.', "Cross off your first one when you're ready."],
  1: ['Off to a real start.', "First bingo's in — keep going.", 'That first line counts for a lot.'],
  2: ["You're building real momentum.", 'Halfway to the top rung.', "This is the stretch where it starts feeling real."],
  3: ['Top rung reached. One push to finish the whole card.', "You're almost at a full card."],
  4: ['Every tile crossed. This card is done.', 'Full bloom. Time to start a new one, or just sit with this.'],
};

/** Prefers a real, specific near-miss nudge over generic stage copy, since "two more and
 *  that's a bingo" is a genuine observation about this exact card, not filler. */
export function companionLine(card: Card, state: CompanionState): string {
  if (!state.isComplete) {
    const misses = nearMissLines(card);
    if (misses.length > 0) {
      const miss = pickForToday(misses);
      const tile = tileAt(card, miss.missingCell);
      if (tile) return `One tile from a bingo — ${tile.emoji ?? ''} ${tile.label} would do it.`.trim();
    }
  }
  return pickForToday(STAGE_LINES[state.stage]);
}
