// On My Card — shared coaching logic, imported by both ai-insights (on-demand:
// nudge / reflection / breakdown) and daily-coach-dispatch (cron-triggered: nudge
// only). Keeping this in one place means the Card-tab nudge and the push
// notification body are always generated the exact same way.

export const MODEL = 'claude-sonnet-5';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
  title: string;
  tiles: Tile[];
}
export interface LogEntry {
  id: string;
  ts: number;
  kind: string;
  text: string;
}
export interface AppStateShape {
  card: CardShape | null;
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

export function summarize(state: AppStateShape) {
  const card = state.card!;
  const crossed = card.tiles.filter((t) => t.doneAt);
  const open = card.tiles.filter((t) => !t.doneAt);
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
  };
}

export function summarizeForPeriod(state: AppStateShape, periodType: 'weekly' | 'monthly') {
  const start = periodStartMs(periodType);
  const card = state.card!;
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
  return state.card?.tiles.find((t) => t.id === tileId);
}

// --- prompts --------------------------------------------------------------
// Nudge is capped at ~160 chars (not just 240) because the same text is used
// verbatim as a push-notification body, not only the Card-tab coach line.

export const NUDGE_SYSTEM =
  'You are a warm, specific, no-nonsense coach inside "On My Card" — an app where ' +
  'someone built a 5x5 bingo card of one-time comfort-zone challenges for the year ' +
  'and crosses them off as they do them (not a daily habit tracker — each tile ' +
  'happens once). Write ONE short nudge (1 sentence, under 160 characters — it is ' +
  'also used as a push notification body) in second person. Reference something ' +
  'concrete from their actual data (a specific tile label, a category imbalance, or ' +
  'how close they are to a bingo) — the style is "noticed you have been doing well ' +
  'on X, have you considered Y" when there is a real X and Y to point at. No generic ' +
  'self-help filler, no exclamation-point overload, no emoji.';

export const REFLECTION_SYSTEM =
  'You are a warm, specific coach inside "On My Card" — a yearly bingo card of ' +
  'one-time comfort-zone challenges (not a daily habit tracker). Write a short ' +
  'reflection (3-5 sentences, under 700 characters) summarizing this period: what ' +
  'they actually did, any pattern in which categories they lean toward or avoid, ' +
  'and one encouraging, concrete forward-looking note. Use real numbers from the ' +
  'data. No generic self-help filler, no emoji.';

export const BREAKDOWN_SYSTEM =
  'You are a practical, encouraging coach inside "On My Card". The user picked one ' +
  'goal-sized tile for their bingo card and wants a concrete plan, not motivation. ' +
  'Break it into 4-7 ordered, practical steps a reasonably motivated beginner could ' +
  'actually follow — specific and sequenced (each step should assume only the ' +
  'previous ones are done), not generic advice. Respond with ONLY valid JSON, no ' +
  'markdown fencing, no commentary, matching exactly: ' +
  '{"steps":[{"title":"short imperative title","detail":"1-2 sentence practical detail"}]}';

export function buildNudgePrompt(stats: ReturnType<typeof summarize>): string {
  return (
    `Card: "${stats.title}"\n` +
    `Crossed: ${stats.crossedCount}/${stats.total}, bingos: ${stats.bingos}\n` +
    `Crossed by category: ${JSON.stringify(stats.crossedByCategory)}\n` +
    `Still open by category: ${JSON.stringify(stats.openByCategory)}\n` +
    `A few open tiles: ${JSON.stringify(stats.openLabels)}\n` +
    `Most recently crossed: ${JSON.stringify(stats.recentlyCrossed)}\n\n` +
    `Write the nudge now.`
  );
}

export function buildReflectionPrompt(stats: ReturnType<typeof summarizeForPeriod>): string {
  return (
    `Period: ${stats.periodType}\n` +
    `Card: "${stats.title}"\n` +
    `Overall crossed: ${stats.crossedCount}/${stats.total}, bingos: ${stats.bingos}\n` +
    `Crossed by category (all-time): ${JSON.stringify(stats.crossedByCategory)}\n` +
    `Crossed this ${stats.periodType === 'weekly' ? 'week' : 'month'}: ${JSON.stringify(stats.crossedInPeriod)}\n` +
    `Activity-log entries this period: ${stats.logCount}\n\n` +
    `Write the reflection now.`
  );
}

export function buildBreakdownPrompt(tile: Tile): string {
  return (
    `Goal tile: "${tile.label}"${tile.category ? ` (category: ${tile.category})` : ''}\n` +
    (tile.note ? `Note the user attached: "${tile.note}"\n` : '') +
    `\nReturn the JSON plan now.`
  );
}

/** Calls Claude once. Throws on a non-2xx or an empty response — caller decides
 *  how to surface that (both callers here treat it as a clean 502). */
export async function callClaude(apiKey: string, system: string, prompt: string, maxTokens: number): Promise<string> {
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
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text?.trim();
  if (!content) throw new Error('Anthropic API returned an empty response');
  return content;
}

/** Defensive parse for the breakdown's JSON response — a slightly malformed
 *  response (stray markdown fence, trailing text) should never break the UI. */
export function parseBreakdown(raw: string): { steps: { title: string; detail: string }[] } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed?.steps) && parsed.steps.length > 0) {
      return { steps: parsed.steps.map((s: any) => ({ title: String(s.title ?? ''), detail: String(s.detail ?? '') })) };
    }
  } catch {
    // fall through to the single-step fallback below
  }
  return { steps: [{ title: 'Plan', detail: raw.slice(0, 1000) }] };
}
