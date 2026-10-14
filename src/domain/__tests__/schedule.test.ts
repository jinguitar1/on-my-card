import {
  boundaryForIndex,
  daysInMonth,
  nextPeriod,
  resolvePeriod,
  validateCustomRange,
  type CardSchedule,
} from '../schedule';

const TZ = 'America/New_York';

function baseSchedule(overrides: Partial<CardSchedule>): CardSchedule {
  return {
    id: 'sched-1',
    title: 'Test schedule',
    mode: 'daily',
    repeat: true,
    timezone: TZ,
    anchorYear: 2026,
    anchorMonth: 1,
    anchorDay: 1,
    createdAt: 0,
    lifecycleState: 'active',
    ...overrides,
  };
}

// A known-good reference instant: local midnight in America/New_York for a given civil
// date, computed independently of the module under test via Intl + a UTC guess, so the
// tests aren't just checking the implementation against itself.
function localMidnight(year: number, month: number, day: number, tz: string = TZ): number {
  // EST is UTC-5, EDT is UTC-4 — try both and pick whichever actually reads back as the
  // intended local midnight in `tz` (robust to whichever offset the date falls under).
  for (const offsetHours of [5, 4, 6, -4, -5]) {
    const guess = Date.UTC(year, month - 1, day, offsetHours);
    const read = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (t: string) => Number(read.find((p) => p.type === t)?.value);
    if (get('year') === year && get('month') === month && get('day') === day && get('hour') % 24 === 0) {
      return guess;
    }
  }
  throw new Error('localMidnight: could not resolve reference instant');
}

describe('daysInMonth', () => {
  it('handles short months and leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28); // 2026 is not a leap year
    expect(daysInMonth(2024, 2)).toBe(29); // 2024 is
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(31);
  });
});

describe('daily schedule', () => {
  it('resolves period n as the anchor date plus n civil days', () => {
    const s = baseSchedule({ mode: 'daily', anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2026, 1, 1));
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2026, 1, 2));
    expect(boundaryForIndex(s, 30)).toBe(localMidnight(2026, 1, 31));
  });

  it('steps correctly across a DST spring-forward transition (America/New_York, Mar 8 2026)', () => {
    const s = baseSchedule({ mode: 'daily', anchorYear: 2026, anchorMonth: 3, anchorDay: 5 });
    // index 0 = Mar 5, ... index 3 = Mar 8 (the transition day itself), index 4 = Mar 9
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2026, 3, 5));
    expect(boundaryForIndex(s, 3)).toBe(localMidnight(2026, 3, 8));
    expect(boundaryForIndex(s, 4)).toBe(localMidnight(2026, 3, 9));
    // Every period is still a local midnight-to-midnight day, even though the transition
    // day itself is only 23 hours of wall-clock time — this only holds if the module steps
    // in civil-date space, not raw milliseconds.
    const transitionDayMs = boundaryForIndex(s, 4) - boundaryForIndex(s, 3);
    expect(transitionDayMs).toBe(23 * 60 * 60 * 1000);
  });

  it('resolvePeriod finds the right index for a far-future `now`, including after many missed periods', () => {
    const s = baseSchedule({ mode: 'daily', anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    const now = localMidnight(2026, 2, 15) + 3 * 60 * 60 * 1000; // partway through day 45 (0-indexed 45)
    const period = resolvePeriod(s, now);
    expect(period.index).toBe(45);
    expect(period.start).toBe(localMidnight(2026, 2, 15));
    expect(period.end).toBe(localMidnight(2026, 2, 16));
  });

  it('half-open: an instant exactly at a period boundary belongs to the next period, not the one ending', () => {
    const s = baseSchedule({ mode: 'daily', anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    const boundary = localMidnight(2026, 1, 2);
    expect(resolvePeriod(s, boundary).index).toBe(1);
    expect(resolvePeriod(s, boundary - 1).index).toBe(0);
  });

  it('a non-repeating daily schedule only ever has period 0, with no successor', () => {
    const s = baseSchedule({ mode: 'daily', repeat: false, anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    const far = localMidnight(2026, 6, 1);
    expect(resolvePeriod(s, far)).toEqual(resolvePeriod(s, boundaryForIndex(s, 0)));
    expect(() => nextPeriod(s, 0)).toThrow();
  });
});

describe('weekly schedule', () => {
  it('honors a user-chosen start day, independent of the literal anchor weekday', () => {
    // Jan 1 2026 is a Thursday. A weekly schedule anchored there, but with weeklyStartDay
    // forced to Monday via a pre-aligned anchor (as real schedule creation would do),
    // should produce Monday-to-Monday periods.
    const s = baseSchedule({ mode: 'weekly', weeklyStartDay: 1, anchorYear: 2025, anchorMonth: 12, anchorDay: 29 }); // Dec 29 2025 is a Monday
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2025, 12, 29));
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2026, 1, 5));
    expect(boundaryForIndex(s, 2)).toBe(localMidnight(2026, 1, 12));
  });
});

describe('monthly schedule', () => {
  it('calendar mode (anchorDay=1) always lands on the 1st', () => {
    const s = baseSchedule({ mode: 'monthly', rollingAnchor: false, anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2026, 1, 1));
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2026, 2, 1));
    expect(boundaryForIndex(s, 2)).toBe(localMidnight(2026, 3, 1));
  });

  it('rolling mode preserves the anchor day through a short month and recovers it afterward (the core anti-drift case)', () => {
    const s = baseSchedule({ mode: 'monthly', rollingAnchor: true, anchorYear: 2026, anchorMonth: 1, anchorDay: 31 });
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2026, 1, 31)); // Jan 31
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2026, 2, 28)); // Feb has 28 days in 2026, clamped
    // The critical assertion: March recovers day 31 directly from the anchor, it does NOT
    // drift to "Feb 28 + 1 month" (which a naive incremental implementation would compute
    // as Mar 28).
    expect(boundaryForIndex(s, 2)).toBe(localMidnight(2026, 3, 31));
  });

  it('rolling mode wraps the year correctly', () => {
    const s = baseSchedule({ mode: 'monthly', rollingAnchor: true, anchorYear: 2026, anchorMonth: 11, anchorDay: 15 });
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2026, 11, 15));
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2026, 12, 15));
    expect(boundaryForIndex(s, 2)).toBe(localMidnight(2027, 1, 15));
  });
});

describe('annual schedule', () => {
  it('calendar mode always lands on Jan 1', () => {
    const s = baseSchedule({ mode: 'annual', rollingAnchor: false, anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2026, 1, 1));
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2027, 1, 1));
  });

  it('rolling mode with a Feb 29 leap anchor clamps on non-leap years and recovers on the next leap year', () => {
    const s = baseSchedule({ mode: 'annual', rollingAnchor: true, anchorYear: 2024, anchorMonth: 2, anchorDay: 29 });
    expect(boundaryForIndex(s, 0)).toBe(localMidnight(2024, 2, 29)); // 2024 is a leap year
    expect(boundaryForIndex(s, 1)).toBe(localMidnight(2025, 2, 28)); // clamped, 2025 isn't leap
    expect(boundaryForIndex(s, 2)).toBe(localMidnight(2026, 2, 28)); // still clamped
    expect(boundaryForIndex(s, 4)).toBe(localMidnight(2028, 2, 29)); // 2028 is leap again: day 29 recovered
  });
});

describe('custom schedule', () => {
  it('validateCustomRange rejects end <= start', () => {
    expect(validateCustomRange(100, 200)).toBe(true);
    expect(validateCustomRange(200, 200)).toBe(false);
    expect(validateCustomRange(200, 100)).toBe(false);
  });

  it('one-time custom always resolves to its single explicit range, regardless of now', () => {
    const start = localMidnight(2026, 6, 1);
    const end = localMidnight(2026, 6, 10);
    const s = baseSchedule({ mode: 'custom', repeat: false, customStart: start, customEnd: end });
    expect(resolvePeriod(s, start).start).toBe(start);
    expect(resolvePeriod(s, start).end).toBe(end);
    expect(resolvePeriod(s, end + 1000 * 60 * 60 * 24 * 365)).toEqual(resolvePeriod(s, start)); // a year later, same single period
    expect(() => nextPeriod(s, 0)).toThrow();
  });

  it('repeating custom tiles the same explicit length forward', () => {
    const start = localMidnight(2026, 6, 1);
    const end = localMidnight(2026, 6, 10); // 9-day period
    const s = baseSchedule({ mode: 'custom', repeat: true, customStart: start, customEnd: end });
    expect(boundaryForIndex(s, 1)).toBe(end);
    expect(boundaryForIndex(s, 2)).toBe(end + (end - start));
    const period = resolvePeriod(s, end + 1000); // just into period 1
    expect(period.index).toBe(1);
  });
});

describe('idempotent successor creation after missed periods', () => {
  it('resolving `now` after many missed daily periods still returns exactly one correct period, not a stack', () => {
    const s = baseSchedule({ mode: 'daily', anchorYear: 2026, anchorMonth: 1, anchorDay: 1 });
    const farFuture = localMidnight(2026, 1, 1) + 500 * 86_400_000 + 1000; // ~500 missed days in
    const period = resolvePeriod(s, farFuture);
    // Whatever index it resolves to, `nextPeriod` from the *previous* index should match it
    // exactly — i.e. there's one well-defined "current" period, not an ambiguous range.
    const prev = nextPeriod(s, period.index - 1);
    expect(prev).toEqual(period);
  });

  it('resolving `now` after a single missed monthly period (including a short-month clamp) is still exact', () => {
    const s = baseSchedule({ mode: 'monthly', rollingAnchor: true, anchorYear: 2026, anchorMonth: 1, anchorDay: 31 });
    const now = boundaryForIndex(s, 2) + 1000; // just into period index 2 (the recovered-31 month)
    const period = resolvePeriod(s, now);
    expect(period.index).toBe(2);
    expect(period.start).toBe(localMidnight(2026, 3, 31));
  });
});
