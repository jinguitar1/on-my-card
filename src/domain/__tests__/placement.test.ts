import { CENTER, LINE_CELLS, LINE_KEYS } from '../types';
import { conflictingLines, placeTiles, type PlacementGoal } from '../placement';

function goal(id: string, difficulty: PlacementGoal['difficulty']): PlacementGoal {
  return { id, difficulty };
}

function makeGoals(easy: number, medium: number, hard: number): PlacementGoal[] {
  const out: PlacementGoal[] = [];
  for (let i = 0; i < easy; i++) out.push(goal(`e${i}`, 'easy'));
  for (let i = 0; i < medium; i++) out.push(goal(`m${i}`, 'medium'));
  for (let i = 0; i < hard; i++) out.push(goal(`h${i}`, 'hard'));
  return out;
}

describe('placeTiles', () => {
  it('is deterministic for a given (goals, seed) pair', () => {
    const goals = makeGoals(12, 8, 4);
    const a = placeTiles(goals, 'schedule-1:0');
    const b = placeTiles(goals, 'schedule-1:0');
    expect(a).toEqual(b);
  });

  it('produces a different assignment for a different seed (not hardcoded to one shuffle)', () => {
    const goals = makeGoals(12, 8, 4);
    const a = placeTiles(goals, 'schedule-1:0');
    const b = placeTiles(goals, 'schedule-1:1');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.cellByGoalId).not.toEqual(b.cellByGoalId);
  });

  it('never places a goal on the center cell', () => {
    const goals = makeGoals(12, 8, 4);
    const result = placeTiles(goals, 'seed');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const cell of Object.values(result.cellByGoalId)) expect(cell).not.toBe(CENTER);
    }
  });

  it('satisfies the <=2-Hard-per-line constraint across all 12 lines for a satisfiable input', () => {
    // 4 Hard goals is comfortably satisfiable (max possible concentration on any one line
    // is bounded by only 4 Hard tiles existing at all).
    const goals = makeGoals(12, 8, 4);
    const result = placeTiles(goals, 'balanced-seed');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const key of LINE_KEYS) {
      const hardOnLine = LINE_CELLS[key].filter((cell) =>
        Object.entries(result.cellByGoalId).some(([goalId, c]) => c === cell && goals.find((g) => g.id === goalId)?.difficulty === 'hard')
      ).length;
      expect(hardOnLine).toBeLessThanOrEqual(2);
    }
  });

  it('returns ok:false with non-empty conflictingLines for a genuinely impossible input, not an infinite loop', () => {
    // 13 Hard goals on a 24-cell board with only 12 lines of 5 cells each (and every cell
    // sits on at least 2 lines) cannot possibly keep every line at <=2 Hard tiles — there
    // just aren't enough "slots" across the line structure to isolate that many Hard tiles.
    const goals = makeGoals(6, 5, 13);
    const result = placeTiles(goals, 'impossible-seed');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conflictingLines.length).toBeGreaterThan(0);
    for (const line of result.conflictingLines) expect(LINE_KEYS).toContain(line);
  });

  it('handles fewer than 24 goals by leaving the remaining cells unassigned, not fabricating goals', () => {
    const goals = makeGoals(5, 4, 1); // 10 goals total
    const result = placeTiles(goals, 'partial-seed');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.cellByGoalId)).toHaveLength(10);
  });
});

describe('conflictingLines', () => {
  it('flags a line with 3+ Hard tiles and reports it empty for a valid assignment', () => {
    const goals = [goal('h1', 'hard'), goal('h2', 'hard'), goal('h3', 'hard')];
    const lineCells = LINE_CELLS.R0; // [0,1,2,3,4]
    const badAssignment = { h1: lineCells[0], h2: lineCells[1], h3: lineCells[2] };
    expect(conflictingLines(badAssignment, goals)).toContain('R0');

    const goodAssignment = { h1: lineCells[0], h2: lineCells[1], h3: 5 /* row 1, not row 0 */ };
    expect(conflictingLines(goodAssignment, goals)).not.toContain('R0');
  });
});
