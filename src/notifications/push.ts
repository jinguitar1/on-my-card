import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '../lib/supabaseClient';
import { getPermission } from './scheduler';

/**
 * Remote push registration for the daily coach nudge (see
 * supabase/functions/daily-coach-dispatch). Separate from scheduler.ts's local
 * notifications: this needs a real device token, which needs an EAS-linked project
 * (`app.json`'s `extra.eas.projectId`, populated by `eas init`) and a dev-client build —
 * Expo Go cannot receive push. Until that's set up, `registerForPush` fails quietly and
 * returns false, same fail-quiet convention as the rest of src/ai.
 */

const web = Platform.OS === 'web';

export interface PushPrefs {
  enabled: boolean;
  coachHour: number;
}

export async function getPushPrefs(): Promise<PushPrefs | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    const { data } = await supabase
      .from('push_prefs')
      .select('enabled, coach_hour')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (!data) return null;
    return { enabled: data.enabled, coachHour: data.coach_hour };
  } catch {
    return null;
  }
}

export async function registerForPush(coachHour: number): Promise<boolean> {
  if (web) return false;
  try {
    if (!(await getPermission())) return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return false;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return false;

    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const { error } = await supabase.from('push_prefs').upsert({
      user_id: userData.user.id,
      expo_push_token: tokenData,
      timezone,
      coach_hour: coachHour,
      enabled: true,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function setCoachHour(coachHour: number): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return false;
    const { error } = await supabase
      .from('push_prefs')
      .update({ coach_hour: coachHour })
      .eq('user_id', userData.user.id);
    return !error;
  } catch {
    return false;
  }
}

export async function disablePush(): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return false;
    const { error } = await supabase.from('push_prefs').update({ enabled: false }).eq('user_id', userData.user.id);
    return !error;
  } catch {
    return false;
  }
}
