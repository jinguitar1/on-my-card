import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState as RNAppState } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { FEATURES } from '../config/features';
import { MAX_BINGOS, bingoCount, bonusFor, completedLines, isCardComplete, lineLabel, uid } from '../domain/logic';
import { conflictingLines, placeTiles, type PlacementGoal } from '../domain/placement';
import { boundaryForIndex, deriveAnchor, nextPeriod, type CardSchedule, type TimelineMode } from '../domain/schedule';
import { emptyState } from '../domain/seed';
import {
  CENTER,
  DEFAULT_SETTINGS,
  type AppState,
  type CardInstance,
  type CardTileInstance,
  type Goal,
  type LineKey,
  type PlanStep,
  type Reward,
  type Schedule,
  type Settings,
  type TileCategory,
  type TileOutcome,
  EMPTY_TILE_OUTCOME,
} from '../domain/types';
import type { CelebrationPayload } from '../feedback/Celebration';
import { setHapticsEnabled } from '../feedback/haptics';
import { setSoundEnabled } from '../feedback/sound';
import { cancelAll, reconcileNotifications } from '../notifications/scheduler';
import { repository } from '../storage';
import { migrate } from '../storage/migrations';

export interface GoalInput {
  title: string;
  details?: string;
  difficulty: Goal['difficulty'];
  type: Goal['type'];
  recurringTarget?: number;
  emoji?: string;
  note?: string;
  category?: TileCategory;
  bankId?: string;
}

export type ScheduleDefinition = Omit<CardSchedule, 'id' | 'createdAt' | 'lifecycleState'>;

export type CreateScheduleResult = { ok: true; scheduleId: string } | { ok: false; conflictingLines: LineKey[] };

interface AppApi {
  ready: boolean;
  state: AppState;
  celebration: CelebrationPayload | null;
  dismissCelebration: () => void;
  syncStatus: { lastSyncedAt: number | null; lastError: string | null };

  // goal library
  createGoal: (input: GoalInput) => Goal;
  updateGoal: (goalId: string, patch: Partial<GoalInput>) => void;
  archiveGoal: (goalId: string) => void;

  // schedules + the current card instance they produce
  createSchedule: (definition: ScheduleDefinition, goalIds: string[]) => CreateScheduleResult;
  renameSchedule: (scheduleId: string, title: string) => void;
  deleteSchedule: (scheduleId: string) => void;
  shuffleCurrentInstance: (scheduleId: string) => void;

  pressTile: (scheduleId: string, cell: number) => TileOutcome;
  setTile: (scheduleId: string, cell: number, goalId: string) => void;
  clearTile: (scheduleId: string, cell: number) => void;
  setFocusedTile: (scheduleId: string, tileId: string | null) => void;
  updateTileContent: (scheduleId: string, cell: number, patch: { title?: string; note?: string }) => void;
  setTilePlan: (scheduleId: string, cell: number, plan: PlanStep[]) => void;
  /** Pass `undefined` to clear. Instance-local — see `CardTileInstance.deadline`'s own
   *  comment for why this never touches the underlying `Goal`. */
  setTileDeadline: (scheduleId: string, cell: number, deadline: number | undefined) => void;

  addReward: (scheduleId: string) => void;
  editReward: (scheduleId: string, rewardId: string, patch: Partial<Reward>) => void;
  removeReward: (scheduleId: string, rewardId: string) => void;
  claimReward: (scheduleId: string, rewardId: string) => void;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<AppApi | null>(null);

// --- helpers -------------------------------------------------------

function log(state: AppState, kind: AppState['log'][number]['kind'], text: string): AppState['log'] {
  return [{ id: uid('log'), ts: Date.now(), kind, text }, ...state.log].slice(0, 300);
}

function cellForIndex(i: number): number {
  return i < CENTER ? i : i + 1;
}

/** The one place a `CardTileInstance` is built from a `Goal` — every field a tile needs
 *  to display and play correctly without a live join back to the goal library. Used by
 *  initial generation, successor creation, and `setTile`'s fill/swap, so the three can
 *  never drift out of sync with each other about what "snapshotting a goal" means. */
function snapshotTile(goal: Goal, cell: number, existingId?: string): CardTileInstance {
  return {
    id: existingId ?? uid('tile'),
    cell,
    goalId: goal.id,
    title: goal.title,
    emoji: goal.emoji,
    note: goal.note,
    category: goal.category,
    bankId: goal.bankId,
    difficulty: goal.difficulty,
    type: goal.type,
    target: goal.type === 'recurring' ? goal.recurringTarget : undefined,
    progress: goal.type === 'recurring' ? 0 : undefined,
  };
}

/** A schedule's one playable board at any moment is always its most recently created
 *  instance — `instances` is append-only, so "current" is just "last". */
function currentInstance(schedule: Schedule): CardInstance | undefined {
  return schedule.instances[schedule.instances.length - 1];
}

/** Every per-instance mutator goes through this: find the schedule, find its current
 *  instance, hand it to `fn`, write the result back. Mirrors the single-level
 *  `st.cards.map(...)` pattern the old permanent-card model used, just one level deeper
 *  now that a schedule owns a list of instances instead of being the playable thing
 *  itself. */
function updateCurrentInstance(st: AppState, scheduleId: string, fn: (instance: CardInstance) => CardInstance): AppState {
  const schedule = st.schedules.find((s) => s.id === scheduleId);
  const instance = schedule && currentInstance(schedule);
  if (!schedule || !instance) return st;
  const nextInstance = fn(instance);
  const nextSchedule: Schedule = { ...schedule, instances: schedule.instances.map((i) => (i.id === instance.id ? nextInstance : i)) };
  return { ...st, schedules: st.schedules.map((s) => (s.id === scheduleId ? nextSchedule : s)) };
}

function celebrationsFor(scheduleTitle: string, before: CardInstance, after: CardInstance): CelebrationPayload[] {
  const out: CelebrationPayload[] = [];
  const beforeLines = new Set(completedLines(before));
  const newLines = completedLines(after).filter((l) => !beforeLines.has(l));
  const justCompleted = !isCardComplete(before) && isCardComplete(after);

  if (justCompleted) {
    out.push({ kind: 'card', cardName: scheduleTitle, tileCount: after.tiles.length, bingos: bingoCount(after) });
  } else {
    for (const line of newLines) out.push({ kind: 'bingo', lineLabel: lineLabel(line) });
  }

  // Rewards are tucked away (unfleshed-out feature) — skip the unlock celebration so it
  // never pops a "REWARD UNLOCKED" takeover pointing at a Rewards tab that isn't there.
  if (FEATURES.rewards) {
    const beforeBingos = bingoCount(before);
    const afterBingos = bingoCount(after);
    for (const rw of after.rewards ?? []) {
      if (rw.bingos > beforeBingos && rw.bingos <= afterBingos) {
        out.push({ kind: 'reward', bingos: rw.bingos, text: rw.text });
      }
    }
  }
  return out;
}

function outcomeFor(before: CardInstance, after: CardInstance, crossed: boolean, uncrossed: boolean, bonus: boolean): TileOutcome {
  const beforeLines = new Set(completedLines(before));
  const newBingoLines = completedLines(after).filter((l) => !beforeLines.has(l));
  const cardCompleted = !isCardComplete(before) && isCardComplete(after);
  const beforeBingos = bingoCount(before);
  const afterBingos = bingoCount(after);
  const unlockedRewardIds = (after.rewards ?? []).filter((r) => r.bingos > beforeBingos && r.bingos <= afterBingos).map((r) => r.id);
  return { crossed, uncrossed, bonus, newBingoLines, cardCompleted, unlockedRewardIds };
}

// --- provider -----------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<CelebrationPayload[]>([]);
  const [syncStatus, setSyncStatus] = useState(() => repository.getSyncStatus());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Several actions read `stateRef.current` synchronously to compute their next state
  // and return a synchronous result (e.g. pressTile's TileOutcome). `stateRef.current`
  // only catches up to `state` on the *next* render, so two such actions firing
  // back-to-back in one synchronous call would have the second overwrite the first with
  // a stale snapshot. Every action built this way must go through commitState, which
  // updates the ref immediately rather than waiting for a render.
  const commitState = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const enqueue = useCallback((items: CelebrationPayload[]) => {
    if (items.length) setQueue((q) => [...q, ...items]);
  }, []);
  const dismissCelebration = useCallback(() => setQueue((q) => q.slice(1)), []);

  // hydrate
  useEffect(() => {
    let alive = true;
    (async () => {
      const loadedRaw = await repository.load();
      const migrated = migrate(loadedRaw);
      const base: AppState = migrated
        ? { ...migrated, settings: { ...DEFAULT_SETTINGS, ...migrated.settings } }
        : emptyState();
      if (!alive) return;
      commitState(base);
      setHapticsEnabled(base.settings.hapticsEnabled);
      setSoundEnabled(base.settings.soundEnabled);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [commitState]);

  // debounced persist — always local-first; SyncRepository fires the background
  // Supabase push itself once a user is set, so this line is unchanged by sync.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void repository.save(stateRef.current), 300);
    return () => clearTimeout(t);
  }, [state, ready]);

  // keep the repository's notion of "who" current, and reconcile once per sign-in
  useEffect(() => {
    repository.setUser(session?.user?.id ?? null);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!ready || !session?.user) return;
    let alive = true;
    void repository.reconcile().then((remote) => {
      if (alive && remote) commitState(remote);
    });
    return () => {
      alive = false;
    };
  }, [session?.user?.id, ready, commitState]);

  // reactive sync status for the Settings screen
  useEffect(() => repository.subscribe(() => setSyncStatus(repository.getSyncStatus())), []);

  useEffect(() => {
    setHapticsEnabled(state.settings.hapticsEnabled);
    setSoundEnabled(state.settings.soundEnabled);
  }, [state.settings.hapticsEnabled, state.settings.soundEnabled]);

  // foreground: keep notifications and every schedule's current period in sync
  useEffect(() => {
    const handle = () => {
      void reconcileNotifications(stateRef.current);
      advanceSchedules();
    };
    handle();
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && handle());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Finalizes any schedule whose current instance has ended and, for repeating
  // schedules, creates exactly one successor at whatever period `now` currently resolves
  // to — never a backfilled stack, however many periods were missed (see schedule.ts's
  // own module comment for why this is idempotent regardless of how long the app was
  // closed). Rollover is 0/off in this stage — the next instance's goals always start
  // fresh; Stage 2 reads `predecessorInstanceId` to offer carrying some forward.
  const advanceSchedules = useCallback(() => {
    const now = Date.now();
    setState((st) => {
      let changed = false;
      const nextSchedules = st.schedules.map((schedule) => {
        const instance = currentInstance(schedule);
        if (!instance || instance.lifecycleState !== 'active' || now < instance.end) return schedule;
        changed = true;
        const finalizedInstance: CardInstance = { ...instance, lifecycleState: 'finalized' };
        if (!schedule.repeat) {
          return { ...schedule, instances: [...schedule.instances.slice(0, -1), finalizedInstance], lifecycleState: 'ended' as const };
        }
        const period = nextPeriod(schedule, instance.periodIndex);
        const goalIds = instance.tiles.map((t) => t.goalId);
        const goals = goalIds.map((id) => st.goals.find((g) => g.id === id)).filter((g): g is Goal => !!g);
        const placementGoals: PlacementGoal[] = goals.map((g) => ({ id: g.id, difficulty: g.difficulty }));
        const seed = `${schedule.id}:${period.index}`;
        const placed = placeTiles(placementGoals, seed);
        const cellByGoalId = placed.ok ? placed.cellByGoalId : {};
        const newInstance: CardInstance = {
          id: uid('inst'),
          scheduleId: schedule.id,
          periodIndex: period.index,
          start: period.start,
          end: period.end,
          createdAt: now,
          placementSeed: seed,
          predecessorInstanceId: instance.id,
          swapUsed: false,
          lifecycleState: 'active',
          tiles: goals.map((g) => snapshotTile(g, cellByGoalId[g.id] ?? 0)),
        };
        return { ...schedule, instances: [...schedule.instances.slice(0, -1), finalizedInstance, newInstance] };
      });
      return changed ? { ...st, schedules: nextSchedules } : st;
    });
  }, []);

  // --- goal library ---
  const createGoal = useCallback((input: GoalInput): Goal => {
    const goal: Goal = { id: uid('goal'), createdAt: Date.now(), ...input };
    setState((st) => ({ ...st, goals: [goal, ...st.goals] }));
    return goal;
  }, []);

  const updateGoal = useCallback((goalId: string, patch: Partial<GoalInput>) => {
    setState((st) => ({ ...st, goals: st.goals.map((g) => (g.id === goalId ? { ...g, ...patch } : g)) }));
  }, []);

  const archiveGoal = useCallback((goalId: string) => {
    setState((st) => ({ ...st, goals: st.goals.map((g) => (g.id === goalId ? { ...g, archivedAt: Date.now() } : g)) }));
  }, []);

  // --- schedules ---
  const createSchedule = useCallback((definition: ScheduleDefinition, goalIds: string[]): CreateScheduleResult => {
    const s = stateRef.current;
    const goals = goalIds.map((id) => s.goals.find((g) => g.id === id)).filter((g): g is Goal => !!g);
    const placementGoals: PlacementGoal[] = goals.map((g) => ({ id: g.id, difficulty: g.difficulty }));
    const scheduleId = uid('sched');
    const seed = `${scheduleId}:0`;
    const placed = placeTiles(placementGoals, seed);
    if (!placed.ok) return { ok: false, conflictingLines: placed.conflictingLines };

    const now = Date.now();
    const pending: CardSchedule = { ...definition, id: scheduleId, createdAt: now, lifecycleState: 'active' };
    const tiles: CardTileInstance[] = goals.map((g) => snapshotTile(g, placed.cellByGoalId[g.id]));
    const instance: CardInstance = {
      id: uid('inst'),
      scheduleId,
      periodIndex: 0,
      start: boundaryForIndex(pending, 0),
      end: boundaryForIndex(pending, 1),
      createdAt: now,
      placementSeed: seed,
      tiles,
      swapUsed: false,
      lifecycleState: 'active',
    };
    const schedule: Schedule = { ...pending, instances: [instance] };
    commitState({ ...s, schedules: [schedule, ...s.schedules], log: log(s, 'card', `Created "${definition.title}"`) });
    return { ok: true, scheduleId };
  }, [commitState]);

  const renameSchedule = useCallback((scheduleId: string, title: string) => {
    setState((st) => ({
      ...st,
      schedules: st.schedules.map((sc) => (sc.id === scheduleId ? { ...sc, title: title.trim() || sc.title } : sc)),
    }));
  }, []);

  // Permanent and irreversible on this device — CardDetailScreen is the one place this is
  // reachable, and only behind its own confirmation dialog, matching how every other
  // genuinely destructive action in this app (resetAll) requires an explicit confirm.
  const deleteSchedule = useCallback((scheduleId: string) => {
    setState((st) => {
      const schedule = st.schedules.find((sc) => sc.id === scheduleId);
      if (!schedule) return st;
      return { ...st, schedules: st.schedules.filter((sc) => sc.id !== scheduleId), log: log(st, 'card', `Deleted "${schedule.title}"`) };
    });
  }, []);

  // Randomly reassigns which (already-filled) cell each existing tile sits in, same as
  // before, but now re-validated against the <=2-Hard-per-line constraint (placement.ts's
  // `conflictingLines`) on every attempt, bounded the same way initial placement is —
  // goals carry real difficulty now, so a free Fisher–Yates could otherwise reintroduce 3
  // Hard tiles on one line.
  const shuffleCurrentInstance = useCallback((scheduleId: string) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => {
        const placementGoals: PlacementGoal[] = instance.tiles.map((t) => ({ id: t.id, difficulty: t.difficulty }));
        const cells = instance.tiles.map((t) => t.cell);
        let best = cells;
        for (let attempt = 0; attempt < 250; attempt++) {
          const shuffled = [...cells];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const assignment: Record<string, number> = {};
          instance.tiles.forEach((t, i) => (assignment[t.id] = shuffled[i]));
          if (conflictingLines(assignment, placementGoals).length === 0) {
            best = shuffled;
            break;
          }
        }
        return { ...instance, tiles: instance.tiles.map((t, i) => ({ ...t, cell: best[i] })) };
      })
    );
  }, []);

  // --- tile interaction ---
  const commit = useCallback(
    (mutate: (s: AppState) => AppState): { before: AppState; after: AppState } => {
      const before = stateRef.current;
      const after = mutate(before);
      commitState(after);
      return { before, after };
    },
    [commitState]
  );

  /** One-off tiles toggle done/not-done, same as always. Recurring tiles instead
   *  increment progress toward their target on each tap (crossing off automatically once
   *  target is reached); tapping an already-done recurring tile resets it to zero rather
   *  than decrementing by one, since "undo the whole thing" reads clearer than "undo my
   *  last tap" once it's already been celebrated as complete. */
  const pressTile = useCallback(
    (scheduleId: string, cell: number): TileOutcome => {
      const s = stateRef.current;
      const schedule = s.schedules.find((sc) => sc.id === scheduleId);
      const instance = schedule && currentInstance(schedule);
      const tile = instance?.tiles.find((t) => t.cell === cell);
      if (!schedule || !instance || !tile) return EMPTY_TILE_OUTCOME;

      const wasCrossed = isDone(tile);
      const { before, after } = commit((st) =>
        updateCurrentInstance(st, scheduleId, (inst) => {
          const nextTiles = inst.tiles.map((t) => (t.id === tile.id ? advanceTile(t) : t));
          const nextInst = {
            ...inst,
            tiles: nextTiles,
            focusedTileId: isDone(nextTiles.find((t) => t.id === tile.id)) && inst.focusedTileId === tile.id ? undefined : inst.focusedTileId,
          };
          return nextInst;
        })
      );
      const beforeInstance = before.schedules.find((sc) => sc.id === scheduleId) && currentInstance(before.schedules.find((sc) => sc.id === scheduleId)!);
      const afterInstance = after.schedules.find((sc) => sc.id === scheduleId) && currentInstance(after.schedules.find((sc) => sc.id === scheduleId)!);
      if (!beforeInstance || !afterInstance) return EMPTY_TILE_OUTCOME;
      const nowCrossed = isDone(afterInstance.tiles.find((t) => t.id === tile.id));
      if (nowCrossed && !wasCrossed) {
        commitState({ ...after, log: log(after, 'tile', `Crossed off "${tile.title}"`) });
      }
      enqueue(celebrationsFor(schedule.title, beforeInstance, afterInstance));
      return outcomeFor(beforeInstance, afterInstance, nowCrossed && !wasCrossed, wasCrossed && !nowCrossed, nowCrossed && !wasCrossed && bonusFor(tile.id));
    },
    [commit, commitState, enqueue]
  );

  const setTile = useCallback((scheduleId: string, cell: number, goalId: string) => {
    if (cell === CENTER) return;
    setState((st) => {
      const goal = st.goals.find((g) => g.id === goalId);
      if (!goal) return st;
      return updateCurrentInstance(st, scheduleId, (instance) => {
        const existing = instance.tiles.find((t) => t.cell === cell);
        const tile = snapshotTile(goal, cell, existing?.id);
        const tiles = existing
          ? instance.tiles.map((t) => (t.id === existing.id ? tile : t))
          : [...instance.tiles, tile].sort((a, b) => a.cell - b.cell);
        return { ...instance, tiles };
      });
    });
  }, []);

  const clearTile = useCallback((scheduleId: string, cell: number) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => {
        const removed = instance.tiles.find((t) => t.cell === cell);
        const tiles = instance.tiles.filter((t) => t.cell !== cell);
        const focusedTileId = removed && instance.focusedTileId === removed.id ? undefined : instance.focusedTileId;
        return { ...instance, tiles, focusedTileId };
      })
    );
  }, []);

  /** Pass `null` to clear focus. Only ever one tile focused at a time per instance —
   *  setting a new one replaces whatever was focused before, matching "pick the one
   *  thing to work toward" rather than a growing list. */
  const setFocusedTile = useCallback((scheduleId: string, tileId: string | null) => {
    setState((st) => updateCurrentInstance(st, scheduleId, (instance) => ({ ...instance, focusedTileId: tileId ?? undefined })));
  }, []);

  /** A narrow patch for TileEditScreen's "Save changes" — only overwrites the tile's own
   *  snapshot (title/note), never the underlying Goal (which may be reused by other
   *  schedules/future instances — editing one card's tile shouldn't retroactively rename
   *  it everywhere). Deliberately NOT built on `setTile`, which re-snapshots from a Goal
   *  and would silently drop any field not carried by that snapshot (doneAt, progress,
   *  plan...). */
  const updateTileContent = useCallback((scheduleId: string, cell: number, patch: { title?: string; note?: string }) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => {
        const existing = instance.tiles.find((t) => t.cell === cell);
        if (!existing) return instance;
        const tile: CardTileInstance = { ...existing, title: patch.title?.trim() || existing.title, note: patch.note };
        return { ...instance, tiles: instance.tiles.map((t) => (t.id === existing.id ? tile : t)) };
      })
    );
  }, []);

  /** Replaces a tile's whole plan — the caller (TileEditScreen) always passes the full
   *  next array (add/edit/delete/toggle-done all compute the next array client-side and
   *  hand it back whole), same convention `setTile` and friends already use. */
  const setTilePlan = useCallback((scheduleId: string, cell: number, plan: PlanStep[]) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => {
        const existing = instance.tiles.find((t) => t.cell === cell);
        if (!existing) return instance;
        return { ...instance, tiles: instance.tiles.map((t) => (t.id === existing.id ? { ...t, plan } : t)) };
      })
    );
  }, []);

  const setTileDeadline = useCallback((scheduleId: string, cell: number, deadline: number | undefined) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => {
        const existing = instance.tiles.find((t) => t.cell === cell);
        if (!existing) return instance;
        return { ...instance, tiles: instance.tiles.map((t) => (t.id === existing.id ? { ...t, deadline } : t)) };
      })
    );
  }, []);

  // --- rewards (legacy/decorative — see CardInstance.rewards; Stage 2 reshapes this into
  // the real tier system, this just keeps the hidden-behind-FEATURES.rewards screen from
  // crashing against the new optional field in the meantime) ---
  const addReward = useCallback((scheduleId: string) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => {
        const rewards = instance.rewards ?? [];
        const max = rewards.reduce((m, r) => Math.max(m, r.bingos), 0);
        return { ...instance, rewards: [...rewards, { id: uid('rw'), bingos: Math.min(MAX_BINGOS, max + 1), text: '' }] };
      })
    );
  }, []);
  const editReward = useCallback((scheduleId: string, rewardId: string, patch: Partial<Reward>) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => ({
        ...instance,
        rewards: (instance.rewards ?? []).map((r) => (r.id === rewardId ? { ...r, ...patch } : r)),
      }))
    );
  }, []);
  const removeReward = useCallback((scheduleId: string, rewardId: string) => {
    setState((st) =>
      updateCurrentInstance(st, scheduleId, (instance) => ({ ...instance, rewards: (instance.rewards ?? []).filter((r) => r.id !== rewardId) }))
    );
  }, []);
  const claimReward = useCallback((scheduleId: string, rewardId: string) => {
    setState((st) => {
      const schedule = st.schedules.find((sc) => sc.id === scheduleId);
      const instance = schedule && currentInstance(schedule);
      const rw = instance?.rewards?.find((r) => r.id === rewardId);
      const next = updateCurrentInstance(st, scheduleId, (inst) => ({
        ...inst,
        rewards: (inst.rewards ?? []).map((r) => (r.id === rewardId ? { ...r, claimedAt: Date.now() } : r)),
      }));
      return rw ? { ...next, log: log(next, 'reward', `Claimed: ${rw.text || `${rw.bingos}-bingo reward`}`) } : next;
    });
  }, []);

  // --- settings ---
  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const nextState = { ...stateRef.current, settings: { ...stateRef.current.settings, ...patch } };
      commitState(nextState);
      await reconcileNotifications(nextState);
    },
    [commitState]
  );

  const resetAll = useCallback(async () => {
    await cancelAll();
    await repository.clear();
    commitState(emptyState());
    setQueue([]);
  }, [commitState]);

  const api = useMemo<AppApi>(
    () => ({
      ready,
      state,
      celebration: queue[0] ?? null,
      dismissCelebration,
      syncStatus,
      createGoal,
      updateGoal,
      archiveGoal,
      createSchedule,
      renameSchedule,
      deleteSchedule,
      shuffleCurrentInstance,
      pressTile,
      setTile,
      clearTile,
      setFocusedTile,
      updateTileContent,
      setTilePlan,
      setTileDeadline,
      addReward,
      editReward,
      removeReward,
      claimReward,
      updateSettings,
      resetAll,
    }),
    [
      ready,
      state,
      queue,
      dismissCelebration,
      syncStatus,
      createGoal,
      updateGoal,
      archiveGoal,
      createSchedule,
      renameSchedule,
      deleteSchedule,
      shuffleCurrentInstance,
      pressTile,
      setTile,
      clearTile,
      setFocusedTile,
      updateTileContent,
      setTilePlan,
      setTileDeadline,
      addReward,
      editReward,
      removeReward,
      claimReward,
      updateSettings,
      resetAll,
    ]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function isDone(tile: CardTileInstance | undefined): boolean {
  return !!tile?.doneAt;
}

/** The actual tap-handling rule for `pressTile`, factored out since it's pure and
 *  `pressTile` itself is already deep in `commit`/`updateCurrentInstance` nesting. */
function advanceTile(tile: CardTileInstance): CardTileInstance {
  if (tile.type !== 'recurring') {
    return { ...tile, doneAt: tile.doneAt ? undefined : Date.now() };
  }
  const target = tile.target ?? 1;
  if (!tile.doneAt) {
    const progress = Math.min(target, (tile.progress ?? 0) + 1);
    return { ...tile, progress, doneAt: progress >= target ? Date.now() : undefined };
  }
  return { ...tile, progress: 0, doneAt: undefined };
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

// Re-exported so screens that only need the shape (not the live context) can import from
// one place — matches how `TileSeed` used to live here before Stage 1.
export type { TimelineMode };
