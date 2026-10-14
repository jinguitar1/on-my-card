import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { cardSummary } from '../domain/logic';
import type { AppState, CardInstance } from '../domain/types';

/** Every schedule's current (most recent) instance, active ones only — a finalized/ended
 *  instance has nothing left to "check in" on. */
function activeInstances(state: AppState): CardInstance[] {
  return state.schedules
    .map((s) => s.instances[s.instances.length - 1])
    .filter((i): i is CardInstance => !!i && i.lifecycleState === 'active');
}

/**
 * Local notifications — the retention hook. Just one weekly check-in, summarizing
 * progress across every card rather than naming one — there's no single "the card" to
 * name once more than one exists.
 *
 * Local notifications work in Expo Go; a dev build is more reliable for exact timing.
 */

const web = Platform.OS === 'web';

export function configureNotifications() {
  if (web) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getPermission(): Promise<boolean> {
  if (web) return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
    return req.granted;
  } catch {
    return false;
  }
}

export async function cancelAll(): Promise<void> {
  if (web) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* ignore */
  }
}

/** Cancel everything and re-schedule the weekly check-in from the current state — one
 *  recurring WEEKLY trigger per (day, minute-of-day) pair, since Expo's WEEKLY trigger
 *  only takes a single weekday/hour/minute. Either list being empty schedules nothing. */
export async function reconcileNotifications(state: AppState): Promise<void> {
  if (web) return;
  await cancelAll();
  const instances = activeInstances(state);
  if (!state.settings.notificationsEnabled || instances.length === 0) return;

  const { weeklyCheckinDays, weeklyCheckinMinutes } = state.settings;
  const totals = instances.reduce(
    (acc, instance) => {
      const s = cardSummary(instance);
      return { crossed: acc.crossed + s.crossed, total: acc.total + s.total, bingos: acc.bingos + s.bingos };
    },
    { crossed: 0, total: 0, bingos: 0 }
  );
  const cardCount = instances.length;

  for (const day of weeklyCheckinDays) {
    const weekday = (((day % 7) + 7) % 7) + 1; // expo: 1 = Sunday
    for (const minuteOfDay of weeklyCheckinMinutes) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Weekly check-in',
            body: `${totals.crossed}/${totals.total} crossed across ${cardCount} card${cardCount === 1 ? '' : 's'} · ${totals.bingos} bingo${totals.bingos === 1 ? '' : 's'}. Cross one off.`,
            data: { type: 'weekly' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute },
        });
      } catch {
        /* skip this slot, keep scheduling the rest */
      }
    }
  }
}
