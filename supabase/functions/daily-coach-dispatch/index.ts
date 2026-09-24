// On My Card — daily-coach-dispatch Edge Function
//
// Triggered hourly by a pg_cron job (see migration add_coach_breakdown_and_push),
// never by a user directly — there is no user JWT here, only a shared secret in
// the `x-cron-secret` header checked against the CRON_DISPATCH_SECRET env secret.
// On a match, uses SUPABASE_SERVICE_ROLE_KEY (auto-injected, never set manually)
// to scan every opted-in user's push_prefs row, and — for whoever's local hour
// matches their chosen coach_hour and hasn't already been sent today — generates
// one Claude nudge (same prompt as ai-insights' "nudge" kind, from the shared
// module so the two paths can never drift apart), upserts it into ai_insights so
// the Card tab shows the identical content, and sends it as a push via Expo's
// push service. See public.push_prefs' table comment for the full data-flow story.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { AppStateShape, CORS_HEADERS, MODEL, NUDGE_SYSTEM, buildNudgePrompt, callClaude, json, summarize, todayKey } from '../_shared/coach.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const CRON_DISPATCH_SECRET = Deno.env.get('CRON_DISPATCH_SECRET');

interface PushPrefRow {
  user_id: string;
  expo_push_token: string | null;
  timezone: string;
  coach_hour: number;
  enabled: boolean;
  last_sent_date: string | null;
}

function localHour(timezone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).formatToParts(now);
    return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  } catch {
    return now.getUTCHours(); // an invalid stored timezone falls back to UTC rather than throwing
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.headers.get('x-cron-secret') !== CRON_DISPATCH_SECRET || !CRON_DISPATCH_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!ANTHROPIC_API_KEY) return json({ error: 'server not configured' }, 500);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const utcPeriod = todayKey(now); // matches ai-insights' on-demand nudge cache key

  const { data: prefs, error: prefsErr } = await supabase
    .from('push_prefs')
    .select('user_id, expo_push_token, timezone, coach_hour, enabled, last_sent_date')
    .eq('enabled', true)
    .not('expo_push_token', 'is', null);
  if (prefsErr) return json({ error: prefsErr.message }, 500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of (prefs ?? []) as PushPrefRow[]) {
    const hour = localHour(row.timezone, now);
    const today = localDateKey(row.timezone, now);
    if (hour !== row.coach_hour || row.last_sent_date === today) {
      skipped++;
      continue;
    }

    try {
      const { data: stateRow } = await supabase.from('app_state').select('state').eq('user_id', row.user_id).maybeSingle();
      const state = stateRow?.state as AppStateShape | undefined;
      if (!state?.card || state.card.tiles.length === 0) {
        skipped++;
        continue;
      }

      const content = await callClaude(ANTHROPIC_API_KEY, NUDGE_SYSTEM, buildNudgePrompt(summarize(state)), 200);

      await supabase
        .from('ai_insights')
        .upsert({ user_id: row.user_id, kind: 'nudge', period: utcPeriod, content, model: MODEL }, { onConflict: 'user_id,kind,period' });

      await sendExpoPush(row.expo_push_token!, content);

      await supabase.from('push_prefs').update({ last_sent_date: today }).eq('user_id', row.user_id);
      sent++;
    } catch (err) {
      console.error(`daily-coach-dispatch failed for user ${row.user_id}`, err);
      failed++;
    }
  }

  return json({ sent, skipped, failed, total: prefs?.length ?? 0 });
});
