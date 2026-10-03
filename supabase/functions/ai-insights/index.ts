// On My Card — ai-insights Edge Function
//
// Mobile App -> this function -> Claude API, reading public.app_state for the
// caller. One function, five `kind`s:
//   - "nudge": a short coaching line for the Card tab. Cached per calendar day.
//     (Also generated proactively by daily-coach-dispatch — see that function —
//     so this on-demand path is mostly a cache read / a fallback if cron hasn't
//     run yet for a new user.)
//   - "reflection": a weekly/monthly summary for the Settings tab. Cached per
//     ISO week or month.
//   - "breakdown": an ordered, practical plan for one specific tile (the
//     TileSheetScreen "Get a plan" button). Cached per tile — `period` holds the
//     tile's id instead of a date/week/month key.
//   - "tilegen": a researched set of 24-30 tile ideas for a brand-new card
//     (CreateCardScreen's "Let AI research this" option, behind
//     FEATURES.aiCardGen) — the only kind that doesn't read public.app_state at
//     all, since it's generating the deck for a card that doesn't exist yet.
//     `period` holds a client-minted draftId rather than a date/week/tile key.
//   - "tilesuggest": 3 AI-researched ideas for one empty square on a card that
//     already exists (TileSheetScreen's empty-cell / swap pickers' "Research an
//     idea with AI" option) — aware of every tile already on that specific card
//     so it never suggests a duplicate. `period` holds `${cardId}:${cell}`.
//
// Deploy target for db comments / CLAUDE.md: see public.ai_insights table comment.
// Requires the ANTHROPIC_API_KEY secret (set in the Supabase dashboard — not
// checked in anywhere). SUPABASE_URL / SUPABASE_ANON_KEY are injected
// automatically by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  AppStateShape,
  BREAKDOWN_SYSTEM,
  NUDGE_SYSTEM,
  REFLECTION_SYSTEM,
  TILEGEN_SYSTEM,
  TILEGEN_WEB_SEARCH_TOOL,
  WEB_SEARCH_TOOL,
  buildBreakdownPrompt,
  buildNudgePrompt,
  buildReflectionPrompt,
  buildTilegenPrompt,
  buildTilesuggestPrompt,
  callClaude,
  corsHeaders,
  findTile,
  isoWeekKey,
  json,
  monthKey,
  parseBreakdown,
  parseTilegen,
  summarize,
  summarizeForPeriod,
  todayKey,
  TILESUGGEST_SYSTEM,
  MODEL,
  FAST_MODEL,
} from '../_shared/coach.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

type Kind = 'nudge' | 'reflection' | 'breakdown' | 'tilegen' | 'tilesuggest';
const VALID_KINDS = new Set<string>(['nudge', 'reflection', 'breakdown', 'tilegen', 'tilesuggest']);

// A `force: true` regenerate bypasses the normal per-period cache (the real rate
// limit for nudge/reflection) entirely, and a breakdown's cache key never advances on
// its own — without this, a client could loop `force: true` and trigger unbounded,
// web-search-augmented Claude calls against the project's Anthropic bill.
const FORCE_COOLDOWN_MS = 60_000;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401, origin);
  if (!ANTHROPIC_API_KEY) return json({ error: 'server not configured' }, 500, origin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401, origin);
  const userId = userData.user.id;

  let body: {
    kind?: string;
    periodType?: string;
    tileId?: string;
    force?: boolean;
    context?: string;
    intent?: string;
    draftId?: string;
    cardId?: string;
    cell?: number;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.kind !== undefined && !VALID_KINDS.has(body.kind)) {
    return json({ error: 'invalid kind' }, 400, origin);
  }
  if (body.periodType !== undefined && body.periodType !== 'weekly' && body.periodType !== 'monthly') {
    return json({ error: 'invalid periodType' }, 400, origin);
  }
  const kind: Kind = (body.kind as Kind) ?? 'nudge';
  const periodType: 'weekly' | 'monthly' = body.periodType === 'monthly' ? 'monthly' : 'weekly';
  const force = body.force === true;

  let period: string;
  if (kind === 'nudge') period = todayKey();
  else if (kind === 'reflection') period = periodType === 'monthly' ? monthKey() : isoWeekKey();
  else if (kind === 'breakdown') {
    if (!body.tileId) return json({ error: 'tileId required for breakdown' }, 400, origin);
    period = body.tileId;
  } else if (kind === 'tilegen') {
    // tilegen: no existing card is involved yet (this generates the deck for one that
    // doesn't exist until the user finishes swiping), so there's no natural cache key —
    // the client mints one draftId per card-creation session instead, reused across an
    // explicit "regenerate" so the cooldown below still applies.
    if (!body.intent?.trim()) return json({ error: 'intent required for tilegen' }, 400, origin);
    if (!body.draftId) return json({ error: 'draftId required for tilegen' }, 400, origin);
    period = body.draftId;
  } else {
    // tilesuggest: one empty square on a card that already exists — cached per
    // (cardId, cell) so reopening the same square without an explicit "try again"
    // doesn't re-burn a Claude call.
    if (!body.cardId) return json({ error: 'cardId required for tilesuggest' }, 400, origin);
    if (typeof body.cell !== 'number') return json({ error: 'cell required for tilesuggest' }, 400, origin);
    period = `${body.cardId}:${body.cell}`;
  }

  // Cache hit -> no Claude call, unless the caller explicitly wants a fresh one
  // (e.g. "Regenerate" — a breakdown's cache key is permanent per-tile, so without
  // this there would be no way to ever get a second opinion on the same tile). A
  // `force` hit still isn't free, though: it's throttled by FORCE_COOLDOWN_MS so a
  // runaway client can't loop this into an unbounded Claude bill.
  const { data: existing } = await supabase.from('ai_insights').select('*').eq('kind', kind).eq('period', period).maybeSingle();
  if (existing && !force) return json({ insight: existing, cached: true }, 200, origin);
  if (existing && force) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < FORCE_COOLDOWN_MS) {
      return json({ error: 'try again in a moment' }, 429, origin);
    }
  }

  // tilegen doesn't read or require an existing card at all — it's generating the deck
  // for one that doesn't exist yet — so it skips this fetch/gate entirely.
  let state: AppStateShape | undefined;
  let tilesuggestCard: AppStateShape['cards'][number] | undefined;
  if (kind === 'tilesuggest') {
    const { data: row } = await supabase.from('app_state').select('state').maybeSingle();
    state = row?.state as AppStateShape | undefined;
    tilesuggestCard = state?.cards?.find((c) => c.id === body.cardId);
    if (!tilesuggestCard) return json({ error: 'card not found' }, 404, origin);
  } else if (kind !== 'tilegen') {
    const { data: row } = await supabase.from('app_state').select('state').maybeSingle();
    state = row?.state as AppStateShape | undefined;
    if (!state?.cards?.length || state.cards[0].tiles.length === 0) return json({ error: 'no card yet' }, 404, origin);
  }

  let system: string;
  let prompt: string;
  let maxTokens: number;
  let tools: unknown[] | undefined;
  // Nudge/reflection are short, formulaic, and never search — Haiku instead of Sonnet
  // for a fraction of the cost with no meaningful quality loss. Every other kind stays
  // on the default (MODEL, set inside callClaude).
  let model: string = MODEL;

  if (kind === 'nudge') {
    system = NUDGE_SYSTEM;
    prompt = buildNudgePrompt(summarize(state!));
    maxTokens = 200;
    model = FAST_MODEL;
  } else if (kind === 'reflection') {
    system = REFLECTION_SYSTEM;
    prompt = buildReflectionPrompt(summarizeForPeriod(state!, periodType));
    maxTokens = 500;
    model = FAST_MODEL;
  } else if (kind === 'breakdown') {
    const tile = findTile(state!, body.tileId!);
    if (!tile) return json({ error: 'tile not found' }, 404, origin);
    system = BREAKDOWN_SYSTEM;
    prompt = buildBreakdownPrompt(tile, body.context);
    maxTokens = 1500; // higher than the other kinds: room for tool-augmented research plus the final JSON
    tools = [WEB_SEARCH_TOOL];
  } else if (kind === 'tilegen') {
    system = TILEGEN_SYSTEM;
    prompt = buildTilegenPrompt(body.intent!);
    // max_tokens caps the *entire* response including web_search tool-use/result blocks,
    // not just the final text — confirmed in production logs that 6000 (an earlier,
    // speed-motivated cut from 8000) was genuinely too tight: a real capture showed 9
    // well-written tiles generated, then truncation mid-10th with no closing brackets,
    // which the old parser treated as total failure. That's the direct cause of the
    // "fails more often than not" reports, so reliability wins over the marginal latency
    // this would save — parseTilegen's salvage-partial-JSON fallback is a second line of
    // defense regardless, but shouldn't be the first line.
    maxTokens = 10000;
    tools = [TILEGEN_WEB_SEARCH_TOOL];
  } else {
    system = TILESUGGEST_SYSTEM;
    prompt = buildTilesuggestPrompt(tilesuggestCard!);
    // Confirmed in production logs: 1500 was too tight, the same failure mode tilegen
    // hit before its own maxTokens bump. max_tokens caps the *entire* response including
    // web_search tool-use/result blocks, not just the final 3-tile answer — a themed card
    // (e.g. a real trip) reliably makes Claude search, and the search round-trip alone can
    // burn past 1500 before any answer text gets written, which callClaude correctly
    // treats as a hard failure (zero text blocks) rather than silently returning nothing.
    maxTokens = 4000;
    tools = [TILEGEN_WEB_SEARCH_TOOL];
  }

  let content: string;
  try {
    content = await callClaude(ANTHROPIC_API_KEY, system, prompt, maxTokens, tools, model);
  } catch (err) {
    console.error(err);
    return json({ error: 'coach unavailable' }, 502, origin);
  }

  if (kind === 'breakdown') {
    // Store validated/normalized JSON, not whatever Claude literally returned —
    // a slightly malformed response should never break the client's render.
    content = JSON.stringify(parseBreakdown(content));
  } else if (kind === 'tilegen' || kind === 'tilesuggest') {
    // Same {"tiles":[{emoji,label,note}]} shape for both, so parseTilegen's
    // clean-parse-then-regex-salvage logic applies unchanged to tilesuggest's smaller,
    // 3-idea response.
    const parsed = parseTilegen(content);
    if (parsed.tiles.length === 0) {
      // This should be rare now that maxTokens is generous, but it silently produced an
      // empty deck once before with no way to tell why — log enough of the raw response
      // to diagnose a repeat (truncation vs. a genuinely malformed/refused answer).
      console.error(`${kind} parsed to zero tiles; raw content (first 2000 chars):`, content.slice(0, 2000));
    }
    content = JSON.stringify(parsed);
  }

  const { data: inserted, error: insErr } = await supabase
    .from('ai_insights')
    .upsert({ user_id: userId, kind, period, content, model }, { onConflict: 'user_id,kind,period' })
    .select()
    .single();

  if (insErr) {
    console.error(insErr);
    return json({ error: 'failed to save insight' }, 500, origin);
  }

  return json({ insight: inserted, cached: false }, 200, origin);
});
