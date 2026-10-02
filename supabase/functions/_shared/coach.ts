// On My Card — shared coaching logic, imported by both ai-insights (on-demand:
// nudge / reflection / breakdown) and daily-coach-dispatch (cron-triggered: nudge
// only). Keeping this in one place means the Card-tab nudge and the push
// notification body are always generated the exact same way.

export const MODEL = 'claude-sonnet-5';

// Neither function is meant to be called from a browser — the mobile app's own fetch
// calls aren't subject to CORS at all, and both endpoints authenticate via an
// Authorization header/shared secret rather than cookies, so a wildcard origin here
// bought nothing but unnecessary exposure. This allowlist exists purely so
// `expo start --web` (local dev only) can still call these functions from a browser.
const ALLOWED_ORIGINS = new Set<string>(['http://localhost:8081', 'http://localhost:19006']);

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** `origin` should be the caller's own `req.headers.get('origin')` — pass it through
 *  so the response's CORS header matches the request that's actually being answered. */
export function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// --- period keys (also the cache key / rate limit for ai_insights) --------

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

export function periodStartMs(periodType: 'weekly' | 'monthly', now = new Date()): number {
  if (periodType === 'monthly') return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const dayNum = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - dayNum + 1);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime();
}

// --- shape of the synced AppState (mirrors src/domain/types.ts) ---------

export interface Tile {
  id: string;
  cell: number;
  label: string;
  note?: string;
  category?: string;
  doneAt?: number;
}
export interface CardShape {
  id: string;
  title: string;
  intent?: string;
  tiles: Tile[];
  focusedTileId?: string;
}
export interface LogEntry {
  id: string;
  ts: number;
  kind: string;
  text: string;
}
export interface AppStateShape {
  cards: CardShape[];
  log: LogEntry[];
}

const GRID = 5;
const CENTER = 12;
const LINE_CELLS: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < GRID; r++) lines.push(Array.from({ length: GRID }, (_, c) => r * GRID + c));
  for (let c = 0; c < GRID; c++) lines.push(Array.from({ length: GRID }, (_, r) => r * GRID + c));
  lines.push(Array.from({ length: GRID }, (_, i) => i * GRID + i));
  lines.push(Array.from({ length: GRID }, (_, i) => i * GRID + (GRID - 1 - i)));
  return lines;
})();

function isCellDone(card: CardShape, cell: number): boolean {
  if (cell === CENTER) return true;
  return !!card.tiles.find((t) => t.cell === cell)?.doneAt;
}
function bingoCount(card: CardShape): number {
  return LINE_CELLS.filter((line) => line.every((c) => isCellDone(card, c))).length;
}
function byCategory(list: Tile[]): Record<string, number> {
  const m = new Map<string, number>();
  for (const t of list) m.set(t.category ?? 'other', (m.get(t.category ?? 'other') ?? 0) + 1);
  return Object.fromEntries(m);
}

// Multiple cards can exist now (see src/domain/types.ts's Card.id / AppState.cards),
// but this whole AI-coaching path is currently gated off client-side (FEATURES.aiCoach
// in src/config/features.ts) and was never redesigned for more than one card — this
// just picks the first card as a placeholder so the function stays correct/non-crashing
// rather than attempting a real multi-card coaching redesign here.
export function summarize(state: AppStateShape) {
  const card = state.cards[0]!;
  const crossed = card.tiles.filter((t) => t.doneAt);
  const open = card.tiles.filter((t) => !t.doneAt);
  const focused = card.focusedTileId ? card.tiles.find((t) => t.id === card.focusedTileId) : undefined;
  return {
    title: card.title,
    total: card.tiles.length,
    crossedCount: crossed.length,
    bingos: bingoCount(card),
    crossedByCategory: byCategory(crossed),
    openByCategory: byCategory(open),
    openLabels: open.slice(0, 8).map((t) => ({ label: t.label, category: t.category })),
    recentlyCrossed: crossed
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      .slice(0, 5)
      .map((t) => ({ label: t.label, category: t.category, when: new Date(t.doneAt!).toISOString().slice(0, 10) })),
    // The one tile the user explicitly chose to focus on right now, if any — coaching
    // should weight toward this over any other observation when it's set.
    focusedTile: focused ? { label: focused.label, category: focused.category, note: focused.note } : null,
  };
}

export function summarizeForPeriod(state: AppStateShape, periodType: 'weekly' | 'monthly') {
  const start = periodStartMs(periodType);
  const card = state.cards[0]!;
  const crossedInPeriod = card.tiles.filter((t) => t.doneAt && t.doneAt >= start);
  const logInPeriod = state.log.filter((e) => e.ts >= start);
  return {
    ...summarize(state),
    periodType,
    crossedInPeriod: crossedInPeriod.map((t) => ({ label: t.label, category: t.category })),
    logCount: logInPeriod.length,
  };
}

export function findTile(state: AppStateShape, tileId: string): Tile | undefined {
  for (const card of state.cards) {
    const t = card.tiles.find((t) => t.id === tileId);
    if (t) return t;
  }
  return undefined;
}

// --- prompts --------------------------------------------------------------
// Nudge is capped at ~160 chars (not just 240) because the same text is used
// verbatim as a push-notification body, not only the Card-tab coach line.

// All three prompts below explicitly ban em/en dashes in the model's output — they
// read as a telltale "AI" tic, and the fewer of them show up in a coaching line the
// more it reads like something a person actually wrote.

export const NUDGE_SYSTEM =
  'You are a warm, specific, no-nonsense coach inside "On My Card", an app where ' +
  'someone built a 5x5 bingo card of one-time comfort-zone challenges for the year ' +
  'and crosses them off as they do them (not a daily habit tracker; each tile ' +
  'happens once). Write ONE short nudge (1 sentence, under 160 characters; it is ' +
  'also used as a push notification body) in second person. Reference something ' +
  'concrete from their actual data (a specific tile label, a category imbalance, or ' +
  'how close they are to a bingo). The style is "noticed you have been doing well ' +
  'on X, have you considered Y" when there is a real X and Y to point at. If the data ' +
  'includes a tile the user is explicitly focusing on, the nudge must be about that ' +
  'tile specifically, not a general observation. No generic self-help filler, no ' +
  'exclamation-point overload, no emoji. Never use an em dash (—) or en dash (–); use a ' +
  'comma, period, or parentheses instead.';

export const REFLECTION_SYSTEM =
  'You are a warm, specific coach inside "On My Card", a yearly bingo card of ' +
  'one-time comfort-zone challenges (not a daily habit tracker). Write a short ' +
  'reflection (3-5 sentences, under 700 characters) summarizing this period: what ' +
  'they actually did, any pattern in which categories they lean toward or avoid, ' +
  'and one encouraging, concrete forward-looking note. If the data includes a tile the ' +
  'user is explicitly focusing on, that forward-looking note must be about making ' +
  'progress on that specific tile. Use real numbers from the data. No generic ' +
  'self-help filler, no emoji. Never use an em dash (—) or en dash (–); use a comma, ' +
  'period, or parentheses instead.';

export const BREAKDOWN_SYSTEM =
  'You are a practical, encouraging coach inside "On My Card". The user picked one ' +
  'goal-sized tile for their bingo card and wants a concrete, well-researched, ' +
  'genuinely personalized plan, not motivation and not a generic plan that could apply ' +
  'to anyone. Use the web_search tool before answering: look up current, real ' +
  'information relevant to this specific goal (actual named resources, tools, programs, ' +
  'typical costs or timelines, well-regarded current guides or communities) rather than ' +
  'relying only on what you already know. If the user gave their own context about ' +
  'their situation (current skill level, constraints, timeline, what they already have ' +
  'or have tried), that context is the most important input you have: every step must ' +
  'be shaped by it specifically, not just generically acknowledged. Skip steps that ' +
  'their context makes irrelevant, and adjust pacing/difficulty to match where they ' +
  'actually are. Then break it into 4-7 ordered, practical steps a reasonably motivated ' +
  'person at their level could actually follow (specific and sequenced; each step should ' +
  'assume only the previous ones are done), naming the specific things you found where ' +
  'that makes a step more actionable. Never use an em dash (—) or en dash (–) in the ' +
  'title or detail text; use a comma, period, or parentheses instead. After you are done ' +
  'researching, your FINAL message must be ONLY valid JSON, no markdown fencing, no ' +
  'commentary before or after it, matching exactly: ' +
  '{"steps":[{"title":"short imperative title","detail":"1-2 sentence practical detail"}]}';

export function buildNudgePrompt(stats: ReturnType<typeof summarize>): string {
  return (
    `Card: "${stats.title}"\n` +
    `Crossed: ${stats.crossedCount}/${stats.total}, bingos: ${stats.bingos}\n` +
    `Crossed by category: ${JSON.stringify(stats.crossedByCategory)}\n` +
    `Still open by category: ${JSON.stringify(stats.openByCategory)}\n` +
    `A few open tiles: ${JSON.stringify(stats.openLabels)}\n` +
    `Most recently crossed: ${JSON.stringify(stats.recentlyCrossed)}\n` +
    (stats.focusedTile
      ? `The user is explicitly focusing on this tile right now: ${JSON.stringify(stats.focusedTile)}. ` +
        `Write the nudge about making progress on exactly this tile, not anything else.\n`
      : '') +
    `\nWrite the nudge now.`
  );
}

export function buildReflectionPrompt(stats: ReturnType<typeof summarizeForPeriod>): string {
  return (
    `Period: ${stats.periodType}\n` +
    `Card: "${stats.title}"\n` +
    `Overall crossed: ${stats.crossedCount}/${stats.total}, bingos: ${stats.bingos}\n` +
    `Crossed by category (all-time): ${JSON.stringify(stats.crossedByCategory)}\n` +
    `Crossed this ${stats.periodType === 'weekly' ? 'week' : 'month'}: ${JSON.stringify(stats.crossedInPeriod)}\n` +
    `Activity-log entries this period: ${stats.logCount}\n` +
    (stats.focusedTile
      ? `The user is explicitly focusing on this tile right now: ${JSON.stringify(stats.focusedTile)}. ` +
        `Include a specific, encouraging note about progress toward exactly this tile.\n`
      : '') +
    `\nWrite the reflection now.`
  );
}

export function buildBreakdownPrompt(tile: Tile, userContext?: string): string {
  return (
    `Goal tile: "${tile.label}"${tile.category ? ` (category: ${tile.category})` : ''}\n` +
    (tile.note ? `Note the user attached: "${tile.note}"\n` : '') +
    (userContext?.trim()
      ? `The user's own context about their situation (use this to personalize every step): "${userContext.trim()}"\n`
      : '') +
    `\nReturn the JSON plan now.`
  );
}

/** Anthropic's server-side web search tool — Claude decides when to search and
 *  Anthropic's own infrastructure executes it and feeds the results back within the
 *  same request; no client-side tool-execution loop needed. `max_uses` caps how many
 *  searches one breakdown can trigger, bounding cost/latency. */
export const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 3 };

/** A tighter search budget for tilegen specifically — each round-trip to Anthropic's
 *  search backend is a meaningful chunk of this call's latency, and generating 24-30
 *  tiles already takes a while on its own; capping at 2 instead of breakdown's 3 trims
 *  real wall-clock time with only a small research-depth tradeoff. */
export const TILEGEN_WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 2 };

/** Calls Claude once. Throws on a non-2xx or an empty response — caller decides
 *  how to surface that (both callers here treat it as a clean 502). Optional `tools`
 *  (only the breakdown path passes any, currently just WEB_SEARCH_TOOL) means the
 *  response content array can include search/tool-result blocks interleaved with text —
 *  every `text` block is concatenated in order rather than assuming a single block, so
 *  a tool-augmented response is handled the same way as a plain one. */
export async function callClaude(apiKey: string, system: string, prompt: string, maxTokens: number, tools?: unknown[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      ...(tools && tools.length > 0 ? { tools } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const content = blocks
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('\n')
    .trim();
  if (!content) throw new Error('Anthropic API returned an empty response');
  return content;
}

/** Defensive parse for the breakdown's JSON response — a slightly malformed response
 *  (stray markdown fence, trailing text) should never break the UI. With web search in
 *  play, Claude can also emit a text preamble before the final answer (e.g. "Let me look
 *  into this...") ahead of the actual JSON, so this pulls out the {...} substring rather
 *  than assuming the whole string is pure JSON. */
export function parseBreakdown(raw: string): { steps: { title: string; detail: string }[] } {
  const fenceStripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const firstBrace = fenceStripped.indexOf('{');
  const lastBrace = fenceStripped.lastIndexOf('}');
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? fenceStripped.slice(firstBrace, lastBrace + 1) : fenceStripped;
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed?.steps) && parsed.steps.length > 0) {
      return { steps: parsed.steps.map((s: any) => ({ title: String(s.title ?? ''), detail: String(s.detail ?? '') })) };
    }
  } catch {
    // fall through to the single-step fallback below
  }
  return { steps: [{ title: 'Plan', detail: raw.slice(0, 1000) }] };
}

// --- tilegen: an AI-researched swipe deck for a brand-new card -----------
// (CreateCardScreen's "Let AI research this" option, behind FEATURES.aiCardGen)

export const TILEGEN_SYSTEM =
  'You are a practical, well-researched assistant inside "On My Card", an app where the ' +
  'user builds a 5x5 bingo card of specific things to do or experience, then crosses each ' +
  'one off once they actually do it (not a daily habit tracker; each tile happens once). ' +
  'The user is about to build a new card and has told you what it is for. Use the ' +
  'web_search tool to research real, current, specific things relevant to what they ' +
  'described (actual named attractions, events, dishes, landmarks, traditions, not generic ' +
  'categories) rather than relying only on what you already know, especially when they ' +
  'named a specific place, date, or event. Respect anything they said about their own ' +
  'preferences or constraints (what they dislike, already know, or want to avoid) by ' +
  'skipping or deprioritizing ideas that conflict with it, rather than including them ' +
  'anyway just to pad the list. Return 24 to 30 distinct tile ideas (the card only needs ' +
  '24; don\'t over-generate beyond a small buffer), biased toward specific and memorable ' +
  'over generic. Each tile needs a short label (2-5 words), one emoji that fits it, and a ' +
  'one-sentence note written the way a well-traveled friend would casually explain it to ' +
  'you in person: warm and specific, never like a brochure, encyclopedia entry, or ' +
  'marketing copy. The note has to actually teach the user something, not just restate the ' +
  'label more formally — name the real thing, and say what it looks or feels like or why ' +
  'it\'s worth doing. This note is the user\'s only in-app explanation of any jargon or ' +
  'reference (e.g. a parade or dish name), so it must stand alone and genuinely inform, not ' +
  'just sound nice. Never use an em dash (—) or en dash (–); use a comma, period, or ' +
  'parentheses instead. After you are done researching, your FINAL message must be ONLY ' +
  'valid JSON, no markdown fencing, no commentary before or after it, matching exactly: ' +
  '{"tiles":[{"emoji":"🎉","label":"short label","note":"one sentence explaining what it is"}]}';

export function buildTilegenPrompt(intent: string): string {
  return `What this card is for, in the user's own words: "${intent.trim()}"\n\nReturn the JSON tile list now.`;
}

// --- tilesuggest: AI-researched idea(s) for one empty square on a card the ---
// user already started (TileSheetScreen's empty-cell / swap pickers' "Research
// an idea with AI" option). Shares tilegen's exact tile JSON shape ({emoji,
// label, note}) so parseTilegen is reused as-is rather than writing a second
// parser for an identical format.

export const TILESUGGEST_SYSTEM =
  'You are a practical, well-researched assistant inside "On My Card", an app where the ' +
  'user builds a 5x5 bingo card of specific things to do or experience, then crosses each ' +
  'one off once they actually do it (not a daily habit tracker; each tile happens once). ' +
  'The card already exists and the user is filling in one remaining empty square on it. ' +
  'Use the web_search tool when it would genuinely help (e.g. the card is themed around a ' +
  'real place, trip, or event) to find real, current, specific things relevant to the ' +
  'card\'s theme (actual named attractions, events, dishes, landmarks, activities, not ' +
  'generic categories) rather than relying only on what you already know. You are given ' +
  'every tile already on this card. Every idea you return must be genuinely distinct from ' +
  'all of them, not just avoiding an exact repeat of the label, but avoiding a near-duplicate ' +
  'of the same place, activity, or experience under different wording. Return exactly 3 ' +
  'distinct tile ideas for the one empty square, biased toward specific and memorable over ' +
  'generic, matching the theme and tone of the card\'s existing tiles (or, if the card has no ' +
  'clear theme, something that rounds out the mix of categories it already leans toward). ' +
  'Each tile needs a short label (2-5 words), one emoji that fits it, and a one-sentence note ' +
  'written the way a well-traveled friend would casually explain it to you in person: warm ' +
  'and specific, never like a brochure, encyclopedia entry, or marketing copy, and it has to ' +
  'actually teach the user something, not just restate the label more formally. Never use an ' +
  'em dash (—) or en dash (–); use a comma, period, or parentheses instead. After you are ' +
  'done researching, your FINAL message must be ONLY valid JSON, no markdown fencing, no ' +
  'commentary before or after it, matching exactly: ' +
  '{"tiles":[{"emoji":"🎉","label":"short label","note":"one sentence explaining what it is"}]}';

export function buildTilesuggestPrompt(card: CardShape): string {
  const existing = card.tiles.map((t) => ({ label: t.label, note: t.note }));
  return (
    `Card title: "${card.title}"\n` +
    (card.intent?.trim() ? `What this card is for, in the user's own words: "${card.intent.trim()}"\n` : '') +
    `Every tile already on this card (do not duplicate or near-duplicate any of these): ${JSON.stringify(existing)}\n` +
    `\nReturn the JSON list of 3 new tile ideas for the empty square now.`
  );
}

/** Turns a regex-captured JSON string body (still containing \" \\ etc. escapes) back
 *  into the real string, by handing it to JSON.parse wrapped in quotes rather than
 *  reinventing JSON's escaping rules by hand. */
function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/** Confirmed in production logs: a web-search-augmented, high-output call like this one
 *  truncates mid-generation (hits max_tokens before the closing brackets) far more often
 *  than a short plain-text reply would — one real capture showed 9 fully-formed, genuinely
 *  good tiles followed by a cut-off 10th with no closing `]}`. The original parser treated
 *  that as total failure (JSON.parse throws on an unterminated string) and discarded every
 *  tile the model *had* finished writing, which is exactly why generation was failing far
 *  more than it should have. This still tries the clean, complete-JSON path first, and only
 *  falls back to pulling out each complete {"emoji","label","note"} object via regex (skipping
 *  whatever trailing partial object never finished) when that fails — a partial deck someone
 *  can actually swipe through beats a hard error. */
export function parseTilegen(raw: string): { tiles: { emoji: string; label: string; note: string }[] } {
  const fenceStripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const firstBrace = fenceStripped.indexOf('{');
  const lastBrace = fenceStripped.lastIndexOf('}');
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? fenceStripped.slice(firstBrace, lastBrace + 1) : fenceStripped;
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed?.tiles) && parsed.tiles.length > 0) {
      return {
        tiles: parsed.tiles
          .map((t: any) => ({ emoji: String(t.emoji ?? '✨'), label: String(t.label ?? '').trim(), note: String(t.note ?? '').trim() }))
          .filter((t: { label: string }) => t.label.length > 0),
      };
    }
  } catch {
    // fall through to salvage mode below
  }
  const tileRegex = /\{\s*"emoji"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"label"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"note"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  const salvaged: { emoji: string; label: string; note: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = tileRegex.exec(fenceStripped)) !== null) {
    const label = unescapeJsonString(match[2]).trim();
    if (!label) continue;
    salvaged.push({ emoji: unescapeJsonString(match[1]), label, note: unescapeJsonString(match[3]) });
  }
  return { tiles: salvaged };
}
