// On My Card — daily-coach-dispatch Edge Function
//
// Triggered every 5 minutes by a pg_cron job (see migrations add_coach_breakdown_and_push
// and add_coach_minutes), never by a user directly — there is no user JWT here, only a
// shared secret in the `x-cron-secret` header checked against the CRON_DISPATCH_SECRET
// env secret. On a match, uses SUPABASE_SERVICE_ROLE_KEY (auto-injected, never set
// manually) to scan every opted-in user's push_prefs row, and — for whoever's local
// minute-of-day is in their chosen coach_minutes (they can pick more than one time a
// day, each snapped to a 5-minute increment client-side so it always lines up with a
// cron tick), today's local weekday is in coach_days, and this exact (date, minute)
// slot hasn't already been sent — generates one Claude nudge (same prompt as
// ai-insights' "nudge" kind, from the shared module so the two paths can never drift
// apart), upserts it into ai_insights so the Card tab shows the identical content, and
// sends it as a push via Expo's push service. See public.push_prefs' table comment for
// the full data-flow story.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { AppStateShape, FAST_MODEL, NUDGE_SYSTEM, buildNudgePrompt, callClaude, corsHeaders, json, summarize, todayKey } from '../_shared/coach.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const CRON_DISPATCH_SECRET = Deno.env.get('CRON_DISPATCH_SECRET');

interface PushPrefRow {
  user_id: string;
  expo_push_token: string | null;
  timezone: string;
  coach_minutes: number[];
  coach_days: number[];
  enabled: boolean;
  last_sent_slot: string | null;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Minutes since local midnight (0-1439). The cron ticks every 5 minutes and the client
 *  only lets you pick a 5-minute-increment time, so this always lines up exactly with a
 *  chosen coach_minutes value instead of needing any "close enough" fuzzy matching. */
function localMinuteOfDay(timezone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes(); // an invalid stored timezone falls back to UTC rather than throwing
  }
}

function localWeekday(timezone: string, now: Date): number {
  try {
    const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(now);
    return WEEKDAY_INDEX[short] ?? now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

function localDateKey(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return todayKey(now);
  }
}

async function sendExpoPush(token: string, body: string): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify([{ to: token, title: 'Your coach', body, sound: 'default' }]),
  });
  if (!res.ok) throw new Error(`Expo push API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  // Expo can return 200 OK at the HTTP layer while the individual ticket inside still
  // reports a failure (e.g. missing APNs credentials, DeviceNotRegistered) — checking
  // res.ok alone was silently treating those as delivered.
  const payload = await res.json().catch(() => null);
  const ticket = payload?.data?.[0];
  if (ticket?.status === 'error') {
    throw new Error(`Expo push ticket error: ${ticket.message ?? 'unknown'} (${ticket.details?.error ?? 'no code'})`);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.headers.get('x-cron-secret') !== CRON_DISPATCH_SECRET || !CRON_DISPATCH_SECRET) {
    return json({ error: 'unauthorized' }, 401, origin);
  }
  if (!ANTHROPIC_API_KEY) return json({ error: 'server not configured' }, 500, origin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const utcPeriod = todayKey(now); // matches ai-insights' on-demand nudge cache key

  const { data: prefs, error: prefsErr } = await supabase
    .from('push_prefs')
    .select('user_id, expo_push_token, timezone, coach_minutes, coach_days, enabled, last_sent_slot')
    .eq('enabled', true)
    .not('expo_push_token', 'is', null);
  if (prefsErr) {
    console.error(prefsErr);
    return json({ error: 'failed to load push preferences' }, 500, origin);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of (prefs ?? []) as PushPrefRow[]) {
    const minuteOfDay = localMinuteOfDay(row.timezone, now);
    const weekday = localWeekday(row.timezone, now);
    const today = localDateKey(row.timezone, now);
    // "<local date>T<minute-of-day>" — lets each distinct time slot the same day fire
    // once, while a second cron tick within the same 5-minute window (retry) is a no-op.
    const slot = `${today}T${minuteOfDay}`;
    if (!row.coach_minutes.includes(minuteOfDay) || !row.coach_days.includes(weekday) || row.last_sent_slot === slot) {
      skipped++;
      continue;
    }

    try {
      const { data: stateRow } = await supabase.from('app_state').select('state').eq('user_id', row.user_id).maybeSingle();
      const state = stateRow?.state as AppStateShape | undefined;
      if (!state?.cards?.length || state.cards[0].tiles.length === 0) {
        skipped++;
        continue;
      }

      // Same model as ai-insights' on-demand nudge path (FAST_MODEL) so the two never
      // drift in cost or voice depending on which one happens to win the cache race.
      const content = await callClaude(ANTHROPIC_API_KEY, NUDGE_SYSTEM, buildNudgePrompt(summarize(state)), 200, undefined, FAST_MODEL);

      await supabase
        .from('ai_insights')
        .upsert({ user_id: row.user_id, kind: 'nudge', period: utcPeriod, content, model: FAST_MODEL }, { onConflict: 'user_id,kind,period' });

      await sendExpoPush(row.expo_push_token!, content);

      await supabase.from('push_prefs').update({ last_sent_slot: slot }).eq('user_id', row.user_id);
      sent++;
    } catch (err) {
      console.error(`daily-coach-dispatch failed for user ${row.user_id}`, err);
      failed++;
    }
  }

  return json({ sent, skipped, failed, total: prefs?.length ?? 0 }, 200, origin);
});
