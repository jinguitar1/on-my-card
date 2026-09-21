import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { cardSummary } from '../domain/logic';
import type { AppState } from '../domain/types';

/**
 * Local notifications — the retention hook. Just one weekly check-in; there's a single
 * card and no per-goal sprints anymore.
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

export async function listScheduled(): Promise<number> {
  if (web) return 0;
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).length;
  } catch {
    return 0;
  }
}

/** Cancel everything and re-schedule the weekly check-in from the current state. */
export async function reconcileNotifications(state: AppState): Promise<void> {
  if (web) return;
  await cancelAll();
  if (!state.settings.notificationsEnabled || !state.card) return;

  const { weeklyCheckinDay, weeklyCheckinHour } = state.settings;
  const weekday = (((weeklyCheckinDay % 7) + 7) % 7) + 1; // expo: 1 = Sunday
  const { crossed, total, bingos } = cardSummary(state.card);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${state.card.title} — check-in`,
        body: `${crossed}/${total} crossed · ${bingos} bingo${bingos === 1 ? '' : 's'}. Cross one off.`,
        data: { type: 'weekly' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour: weeklyCheckinHour, minute: 0 },
    });
  } catch {
    /* skip */
  }
}
