import type { TileOutcome } from '../domain/types';
import { bingoHit, lightTap, stampHit, triumphHit } from './haptics';
import type { SoundApi } from './sound';

/** Haptic + sound feedback for a TileOutcome. Crossing off used to only ever happen from
 *  a direct tap on the grid (CardScreen), which triggered this feedback inline — now that
 *  the grid tap always opens the tile sheet instead (crossing off feeling "too easy to
 *  lightly tap into" was the point), TileSheetScreen's "Cross it off" button is the only
 *  place this fires from, so it's a shared helper rather than duplicated. The bigger
 *  bingo/card-complete celebration overlay isn't handled here — that's driven by the
 *  global celebration queue `pressTile` already enqueues into internally, independent of
 *  whichever screen called it. */
export function playOutcomeFeedback(outcome: TileOutcome, sound: SoundApi) {
  if (outcome.crossed) {
    stampHit();
    sound.play('stamp');
  } else if (outcome.uncrossed) {
    lightTap();
  }

  if (outcome.cardCompleted) {
    triumphHit();
    sound.play('trophy');
  } else if (outcome.newBingoLines.length > 0) {
    bingoHit();
    sound.play('chord');
  }
}
