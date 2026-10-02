/**
 * Single flip point for "bells and whistles" that are built but deliberately tucked away
 * while v1 focuses on the core loop (a fixed set of goal tiles the user crosses off).
 * Flip any of these back to `true` to bring a feature back rather than re-wiring it from
 * scratch — nothing behind these flags is deleted, just unreached.
 */
export const FEATURES = {
  /** Coach nudge (Card tab + Settings) and the Settings "Reflection"/"AI Coach" sections. */
  aiCoach: false,
  /** The Card tab's "View my stats" radar chart toggle. */
  stats: false,
  /** The Rewards tab and the bingo-threshold reward-unlock celebration. */
  rewards: false,
  /** CreateCardScreen's "Let AI research this" option (tilegen) — an AI-researched deck
   *  in place of the curated bank for a new card. */
  aiCardGen: true,
};
