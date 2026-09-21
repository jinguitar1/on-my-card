import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Settings-guarded haptics. The AppState provider calls `setHapticsEnabled` whenever
 * the toggle changes; screens call the semantic helpers.
 */

let enabled = true;
export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

const web = Platform.OS === 'web';

async function safe(fn: () => Promise<void>) {
  if (!enabled || web) return;
  try {
    await fn();
  } catch {
    // haptics are best-effort
  }
}

/** Habit +1, below target. */
export const tapTick = () => safe(() => Haptics.selectionAsync());

/** A tile crossed off — the rubber-stamp thunk. */
export const stampHit = () =>
  safe(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    await wait(50);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  });

/** A line completed (bingo). */
export const bingoHit = () =>
  safe(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await wait(90);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  });

/** A reward unlocked. */
export const rewardHit = () =>
  safe(async () => {
    for (let i = 0; i < 3; i++) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await wait(70);
    }
  });

/** A goal achieved / a sprint made. */
export const triumphHit = () =>
  safe(async () => {
    for (let i = 0; i < 2; i++) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await wait(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await wait(120);
    }
  });

/** A light nudge for undo / neutral UI. */
export const lightTap = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
