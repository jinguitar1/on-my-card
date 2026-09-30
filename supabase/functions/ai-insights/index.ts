// On My Card — ai-insights Edge Function
//
// Mobile App -> this function -> Claude API, reading public.app_state for the
// caller. One function, three `kind`s:
//   - "nudge": a short coaching line for the Card tab. Cached per calendar day.
//     (Also generated proactively by daily-coach-dispatch — see that function —
//     so this on-demand path is mostly a cache read / a fallback if cron hasn't
//     run yet for a new user.)
//   - "reflection": a weekly/monthly summary for the Settings tab. Cached per
//     ISO week or month.
//   - "breakdown": an ordered, practical plan for one specific tile (the
//     TileSheetScreen "Get a plan" button). Cached per tile — `period` holds the
//     tile's id instead of a date/week/month key.
//
// Deploy target for db comments / CLAUDE.md: see public.ai_insights table comment.
// Requires the ANTHROPIC_API_KEY secret (set in the Supabase dashboard — not
// checked in anywhere). SUPABASE_URL / SUPABASE_ANON_KEY are injected
// automatically by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  AppStateShape,
  BREAKDOWN_SYSTEM,
  CORS_HEADERS,
  NUDGE_SYSTEM,
  REFLECTION_SYSTEM,
  WEB_SEARCH_TOOL,
  buildBreakdownPrompt,
  buildNudgePrompt,
  buildReflectionPrompt,
  callClaude,
  findTile,
  isoWeekKey,
  json,
  monthKey,
  parseBreakdown,
  summarize,
  summarizeForPeriod,
  todayKey,
  MODEL,
} from '../_shared/coach.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

type Kind = 'nudge' | 'reflection' | 'breakdown';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);
  if (!ANTHROPIC_API_KEY) return json({ error: 'server not configured' }, 500);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { kind?: string; periodType?: string; tileId?: string; force?: boolean; context?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const kind: Kind = body.kind === 'reflection' ? 'reflection' : body.kind === 'breakdown' ? 'breakdown' : 'nudge';
  const periodType: 'weekly' | 'monthly' = body.periodType === 'monthly' ? 'monthly' : 'weekly';
  const force = body.force === true;

  let period: string;
  if (kind === 'nudge') period = todayKey();
  else if (kind === 'reflection') period = periodType === 'monthly' ? monthKey() : isoWeekKey();
  else {
    if (!body.tileId) return json({ error: 'tileId required for breakdown' }, 400);
    period = body.tileId;
  }

  // Cache hit -> no Claude call, unless the caller explicitly wants a fresh one
  // (e.g. "Regenerate" — a breakdown's cache key is permanent per-tile, so without
  // this there would be no way to ever get a second opinion on the same tile).
  if (!force) {
    const { data: existing } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('kind', kind)
      .eq('period', period)
      .maybeSingle();
    if (existing) return json({ insight: existing, cached: true });
  }

  const { data: row } = await supabase.from('app_state').select('state').maybeSingle();
  const state = row?.state as AppStateShape | undefined;
  if (!state?.cards?.length || state.cards[0].tiles.length === 0) return json({ error: 'no card yet' }, 404);

  let system: string;
  let prompt: string;
  let maxTokens: number;
  let tools: unknown[] | undefined;

  if (kind === 'nudge') {
    system = NUDGE_SYSTEM;
    prompt = buildNudgePrompt(summarize(state));
    maxTokens = 200;
  } else if (kind === 'reflection') {
    system = REFLECTION_SYSTEM;
    prompt = buildReflectionPrompt(summarizeForPeriod(state, periodType));
    maxTokens = 500;
  } else {
    const tile = findTile(state, body.tileId!);
    if (!tile) return json({ error: 'tile not found' }, 404);
    system = BREAKDOWN_SYSTEM;
    prompt = buildBreakdownPrompt(tile, body.context);
    maxTokens = 1500; // higher than the other kinds: room for tool-augmented research plus the final JSON
    tools = [WEB_SEARCH_TOOL];
  }

  let content: string;
  try {
    content = await callClaude(ANTHROPIC_API_KEY, system, prompt, maxTokens, tools);
  } catch (err) {
    console.error(err);
    return json({ error: 'coach unavailable' }, 502);
  }

  if (kind === 'breakdown') {
    // Store validated/normalized JSON, not whatever Claude literally returned —
    // a slightly malformed response should never break the client's render.
    content = JSON.stringify(parseBreakdown(content));
  }

  const { data: inserted, error: insErr } = await supabase
    .from('ai_insights')
    .upsert({ user_id: userId, kind, period, content, model: MODEL }, { onConflict: 'user_id,kind,period' })
    .select()
    .single();

  if (insErr) return json({ error: insErr.message }, 500);

  return json({ insight: inserted, cached: false });
});
