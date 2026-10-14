/**
 * Pure, testable timeline/boundary math for a `CardSchedule` — daily, weekly, monthly,
 * annual, or custom, each optionally repeating. No `Date.now()` calls anywhere in this
 * file; every function takes `now` as an explicit argument so callers (and tests) control
 * time exactly.
 *
 * The one invariant everything else here depends on: every period boundary is computed
 * fresh from the schedule's *immutable* anchor calendar fields and a period index, never
 * incrementally from a previously-resolved (possibly clamped) boundary. Stepping forward
 * from a clamped boundary (Jan 31 -> Feb 28) would permanently lose the original anchor
 * day; recomputing from the anchor every time means there's nothing to lose in the first
 * place — March's boundary is `min(31, 31)` regardless of what February's was.
 *
 * Calendar-vs-rolling monthly/annual periods aren't two code paths here — they're the same
 * math over different anchor fields, decided once at schedule-creation time (calendar mode
 * sets anchorDay=1 / anchorMonth+anchorDay=1,1; rolling mode keeps the real creation date).
 */

export type TimelineMode = 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom';

export interface CardSchedule {
  id: string;
  title: string;
  mode: TimelineMode;
  /** Daily/weekly/monthly/annual default to true (per the product rules); custom defaults
   *  to false. When false, there is exactly one period (index 0) and no successor. */
  repeat: boolean;
  /** IANA zone, captured once at creation and frozen forever after — boundary math always
   *  uses this, never the device's live current zone, so "the user traveled" only ever
   *  affects how a countdown is *displayed*, never which period is actually active. */
  timezone: string;
  /** Civil calendar fields of the anchor (period index 0's start), in `timezone`. For
   *  `mode: 'custom'` these mirror `customStart`'s civil date for display purposes only —
   *  `boundaryForIndex` doesn't consult them for custom. */
  anchorYear: number;
  anchorMonth: number; // 1-12
  anchorDay: number; // 1-31, civil day-of-month
  /** Only meaningful for `mode: 'weekly'`. 0=Sunday .. 6=Saturday, matching this project's
   *  existing `Settings.weeklyCheckinDays` convention. */
  weeklyStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Only meaningful for `mode: 'monthly' | 'annual'` — true keeps the real anchor day
   *  (e.g. "the 15th of every month"); false is a true calendar period (always the 1st, or
   *  for annual, always Jan 1). Purely descriptive for the UI; see the class comment above
   *  for why this doesn't branch the boundary math itself. */
  rollingAnchor?: boolean;
  /** Only meaningful for `mode: 'custom'` — explicit epoch-ms instants, `customEnd` must be
   *  strictly after `customStart` (validated by `validateCustomRange` below). */
  customStart?: number;
  customEnd?: number;
  createdAt: number;
  lifecycleState: 'active' | 'ended';
}

export interface Period {
  index: number;
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive — half-open range, so an instant exactly at `end` belongs to the
   *  *next* period, never this one. */
  end: number;
}

// --- civil-date <-> instant conversion, IANA-zone aware -----------------------------

interface CivilFields {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What civil date/time does this instant read as inside `timeZone`? Pure, no DST special-
 *  casing needed here — `Intl.DateTimeFormat` already resolves the zone's offset (including
 *  DST) for the given instant. */
function readCivilFieldsInZone(instant: number, timeZone: string): CivilFields {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // some engines report '24' for midnight under hourCycle:'h23'
    minute: get('minute'),
    second: get('second'),
  };
}

/** Inverse of the above: given civil fields meant to represent local time *in* `timeZone`,
 *  find the instant that reads that way. `Intl.DateTimeFormat` only goes instant->civil, so
 *  this inverts it with a short, standard fixed-point iteration: guess an instant (treating
 *  the civil fields as if they were UTC), see what civil fields that guess actually reads as
 *  in the target zone, and correct the guess by the difference. Two passes resolve every
 *  real-world case including a DST transition, since the second pass's offset is computed
 *  from a guess that's already within one zone-offset-change of correct. (A local time that
 *  doesn't exist at all, e.g. 2:30am during a spring-forward gap, is inherently ambiguous in
 *  any zone-aware date system, not just this one — not specially handled here.) */
function zonedCivilToInstant(civil: CivilFields, timeZone: string): number {
  const targetAsUtc = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second);
  let guess = targetAsUtc;
  for (let i = 0; i < 2; i++) {
    const got = readCivilFieldsInZone(guess, timeZone);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const diff = targetAsUtc - gotAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/** Pure Gregorian calendar fact, independent of time zone — how many days does this
 *  (year, 1-indexed month) have. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function midnightInstant(year: number, month: number, day: number, timeZone: string): number {
  return zonedCivilToInstant({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
}

// --- boundary math -------------------------------------------------------------------

/** Step an anchor civil date forward by `n * stepDays` civil days (used by daily and
 *  weekly, which are the same math at a 1-day vs 7-day step) and resolve the result to a
 *  local-midnight instant. Stepping in civil-date space (not `+ n*86_400_000` ms) is what
 *  keeps this correct across a DST transition, where a civil day isn't always 24 hours. */
function stepCivilDays(schedule: CardSchedule, n: number, stepDays: number): number {
  const anchorUtc = Date.UTC(schedule.anchorYear, schedule.anchorMonth - 1, schedule.anchorDay);
  const stepped = new Date(anchorUtc);
  stepped.setUTCDate(stepped.getUTCDate() + n * stepDays);
  return midnightInstant(stepped.getUTCFullYear(), stepped.getUTCMonth() + 1, stepped.getUTCDate(), schedule.timezone);
}

function stepMonths(schedule: CardSchedule, n: number, monthsPerPeriod: number): number {
  const totalMonths = (schedule.anchorMonth - 1) + n * monthsPerPeriod;
  const targetYear = schedule.anchorYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
  const targetDay = Math.min(schedule.anchorDay, daysInMonth(targetYear, targetMonth));
  return midnightInstant(targetYear, targetMonth, targetDay, schedule.timezone);
}

/** The start instant of period `n` (0-indexed from the schedule's anchor). Throws for a
 *  custom schedule asked for an index it can't produce (n > 0 when one-time, or n < 0
 *  always) — a caller bug, not a runtime condition to silently tolerate. */
export function boundaryForIndex(schedule: CardSchedule, n: number): number {
  if (n < 0) throw new Error('boundaryForIndex: negative period index');
  switch (schedule.mode) {
    case 'daily':
      return stepCivilDays(schedule, n, 1);
    case 'weekly':
      return stepCivilDays(schedule, n, 7);
    case 'monthly':
      return stepMonths(schedule, n, 1);
    case 'annual':
      return stepMonths(schedule, n, 12);
    case 'custom': {
      if (schedule.customStart == null || schedule.customEnd == null) {
        throw new Error('boundaryForIndex: custom schedule missing customStart/customEnd');
      }
      if (!schedule.repeat) {
        if (n > 1) throw new Error('boundaryForIndex: one-time custom schedule has only index 0');
        return n === 0 ? schedule.customStart : schedule.customEnd;
      }
      const periodLength = schedule.customEnd - schedule.customStart;
      return schedule.customStart + n * periodLength;
    }
  }
}

/** A cheap, inexact starting guess for "which period index is `now` in" — corrected by the
 *  bounded probe in `resolvePeriod` below, so it only needs to land within a handful of
 *  periods of correct, not be exact (civil-month arithmetic across zones makes an exact
 *  closed form fiddlier than a one-line estimate + bounded probe). */
function estimateIndex(schedule: CardSchedule, now: number): number {
  switch (schedule.mode) {
    case 'daily':
      return Math.floor((now - boundaryForIndex(schedule, 0)) / 86_400_000);
    case 'weekly':
      return Math.floor((now - boundaryForIndex(schedule, 0)) / (7 * 86_400_000));
    case 'monthly': {
      const c = readCivilFieldsInZone(now, schedule.timezone);
      return (c.year - schedule.anchorYear) * 12 + (c.month - schedule.anchorMonth);
    }
    case 'annual': {
      const c = readCivilFieldsInZone(now, schedule.timezone);
      return Math.floor(((c.year - schedule.anchorYear) * 12 + (c.month - schedule.anchorMonth)) / 12);
    }
    case 'custom': {
      if (schedule.customStart == null || schedule.customEnd == null) return 0;
      const periodLength = schedule.customEnd - schedule.customStart;
      return periodLength > 0 ? Math.floor((now - schedule.customStart) / periodLength) : 0;
    }
  }
}

/** Resolves which period `now` currently falls in. Non-repeating schedules (any mode) only
 *  ever have index 0 — once it ends, there's no "next" to probe for. Repeating schedules use
 *  a closed-form estimate plus a small *bounded* probe (never an unbounded loop) to correct
 *  for the estimate landing a period or two off. Because this is closed-form in `now` rather
 *  than a walk from the last-seen period, resolving "which period is active after N missed
 *  periods" costs the same whether N is 1 or 1000 — which is exactly what makes successor
 *  creation idempotent and never produces a backfilled stack of empty periods. */
export function resolvePeriod(schedule: CardSchedule, now: number): Period {
  if (!schedule.repeat) {
    return { index: 0, start: boundaryForIndex(schedule, 0), end: boundaryForIndex(schedule, 1) };
  }
  let index = Math.max(0, estimateIndex(schedule, now));
  for (let tries = 0; tries < 8; tries++) {
    const start = boundaryForIndex(schedule, index);
    const end = boundaryForIndex(schedule, index + 1);
    if (now < start) {
      index -= 1;
      continue;
    }
    if (now >= end) {
      index += 1;
      continue;
    }
    return { index, start, end };
  }
  throw new Error('resolvePeriod: could not resolve a period within bounded probe attempts');
}

/** Pure sugar over `boundaryForIndex` for "the period right after this one" — deliberately
 *  takes the *index*, not the previous period's resolved `end`, so nobody is tempted to
 *  derive the next boundary incrementally from a (possibly clamped) prior instant, which is
 *  exactly the anchor-day-drift bug this module's whole design avoids. */
export function nextPeriod(schedule: CardSchedule, index: number): Period {
  if (!schedule.repeat) throw new Error('nextPeriod: schedule does not repeat, there is no next period');
  return { index: index + 1, start: boundaryForIndex(schedule, index + 1), end: boundaryForIndex(schedule, index + 2) };
}

/** `end` must be strictly after `start` — half-open ranges don't admit a zero-or-negative-
 *  length period. */
export function validateCustomRange(start: number, end: number): boolean {
  return end > start;
}

// --- anchor derivation (schedule-creation time only) ----------------------------------

export interface AnchorInput {
  mode: TimelineMode;
  now: number;
  timezone: string;
  /** monthly/annual only — true keeps today's actual day-of-month/day-of-year as the
   *  anchor; false (calendar mode) forces the 1st (of the month, or of the year for
   *  annual) regardless of what day it is today. */
  rollingAnchor?: boolean;
  /** weekly only — 0=Sunday..6=Saturday. */
  weeklyStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Computes the anchor calendar fields a *new* schedule should use, given when it's being
 *  created — this is the one place "calendar vs. rolling" and "which weekday the week
 *  starts on" actually get resolved into concrete anchor fields; `boundaryForIndex` itself
 *  stays agnostic to both (see the module comment up top). Not itself covered by
 *  `resolvePeriod`'s bounded-probe machinery since there's nothing to search for — a brand
 *  new schedule's period 0 always starts at this anchor by construction. */
export function deriveAnchor(input: AnchorInput): { anchorYear: number; anchorMonth: number; anchorDay: number } {
  const civil = readCivilFieldsInZone(input.now, input.timezone);
  switch (input.mode) {
    case 'daily':
    case 'custom':
      return { anchorYear: civil.year, anchorMonth: civil.month, anchorDay: civil.day };
    case 'weekly': {
      if (input.weeklyStartDay == null) return { anchorYear: civil.year, anchorMonth: civil.month, anchorDay: civil.day };
      // Snap back to the most recent occurrence of weeklyStartDay on/before today's civil
      // date — a pure calendar-weekday fact, independent of time zone offset subtleties.
      const jsDow = new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay(); // 0=Sun..6=Sat
      const diff = (jsDow - input.weeklyStartDay + 7) % 7;
      const snapped = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
      snapped.setUTCDate(snapped.getUTCDate() - diff);
      return { anchorYear: snapped.getUTCFullYear(), anchorMonth: snapped.getUTCMonth() + 1, anchorDay: snapped.getUTCDate() };
    }
    case 'monthly':
      return input.rollingAnchor
        ? { anchorYear: civil.year, anchorMonth: civil.month, anchorDay: civil.day }
        : { anchorYear: civil.year, anchorMonth: civil.month, anchorDay: 1 };
    case 'annual':
      return input.rollingAnchor
        ? { anchorYear: civil.year, anchorMonth: civil.month, anchorDay: civil.day }
        : { anchorYear: civil.year, anchorMonth: 1, anchorDay: 1 };
  }
}
