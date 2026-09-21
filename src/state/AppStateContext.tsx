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

import { MAX_BINGOS, bingoCount, bonusFor, completedLines, isCardComplete, lineLabel, uid } from '../domain/logic';
import { emptyState } from '../domain/seed';
import {
  CENTER,
  SCHEMA_VERSION,
  type AppState,
  type Card,
  type Reward,
  type Settings,
  type Tile,
  type TileCategory,
  type TileOutcome,
  EMPTY_TILE_OUTCOME,
} from '../domain/types';
import type { CelebrationPayload } from '../feedback/Celebration';
import { setHapticsEnabled } from '../feedback/haptics';
import { setSoundEnabled } from '../feedback/sound';
import { cancelAll, reconcileNotifications } from '../notifications/scheduler';
import { repository } from '../storage';

export interface TileSeed {
  label: string;
  emoji?: string;
  note?: string;
  category?: TileCategory;
  bankId?: string;
}

interface AppApi {
  ready: boolean;
  state: AppState;
  celebration: CelebrationPayload | null;
  dismissCelebration: () => void;

  createCard: (kept: TileSeed[]) => void;
  renameCard: (title: string) => void;

  pressTile: (cell: number) => TileOutcome;
  setTileDone: (cell: number, done: boolean) => void;
  setTile: (cell: number, seed: TileSeed) => void;
  clearTile: (cell: number) => void;

  addReward: () => void;
  editReward: (rewardId: string, patch: Partial<Reward>) => void;
  removeReward: (rewardId: string) => void;
  claimReward: (rewardId: string) => void;

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

function celebrationsFor(before: Card, after: Card): CelebrationPayload[] {
  const out: CelebrationPayload[] = [];
  const beforeLines = new Set(completedLines(before));
  const newLines = completedLines(after).filter((l) => !beforeLines.has(l));
  const justCompleted = !isCardComplete(before) && isCardComplete(after);

  if (justCompleted) {
    out.push({ kind: 'card', cardName: after.title, tileCount: after.tiles.length, bingos: bingoCount(after) });
  } else {
    for (const line of newLines) out.push({ kind: 'bingo', lineLabel: lineLabel(line) });
  }

  const beforeBingos = bingoCount(before);
  const afterBingos = bingoCount(after);
  for (const rw of after.rewards) {
    if (rw.bingos > beforeBingos && rw.bingos <= afterBingos) {
      out.push({ kind: 'reward', bingos: rw.bingos, text: rw.text });
    }
  }
  return out;
}

function outcomeFor(before: Card, after: Card, crossed: boolean, uncrossed: boolean, bonus: boolean): TileOutcome {
  const beforeLines = new Set(completedLines(before));
  const newBingoLines = completedLines(after).filter((l) => !beforeLines.has(l));
  const cardCompleted = !isCardComplete(before) && isCardComplete(after);
  const beforeBingos = bingoCount(before);
  const afterBingos = bingoCount(after);
  const unlockedRewardIds = after.rewards.filter((r) => r.bingos > beforeBingos && r.bingos <= afterBingos).map((r) => r.id);
  return { crossed, uncrossed, bonus, newBingoLines, cardCompleted, unlockedRewardIds };
}

function defaultRewards(): Reward[] {
  return [
    { id: uid('rw'), bingos: 1, text: '' },
    { id: uid('rw'), bingos: Math.round(MAX_BINGOS / 2), text: '' },
    { id: uid('rw'), bingos: MAX_BINGOS, text: '' },
  ];
}

// --- provider -----------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<CelebrationPayload[]>([]);
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
      const loaded = await repository.load();
      const base = loaded && loaded.schemaVersion === SCHEMA_VERSION ? loaded : emptyState();
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

  // debounced persist
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void repository.save(stateRef.current), 300);
    return () => clearTimeout(t);
  }, [state, ready]);

  useEffect(() => {
    setHapticsEnabled(state.settings.hapticsEnabled);
    setSoundEnabled(state.settings.soundEnabled);
  }, [state.settings.hapticsEnabled, state.settings.soundEnabled]);

  // foreground: keep notifications in sync
  useEffect(() => {
    const handle = () => void reconcileNotifications(stateRef.current);
    handle();
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && handle());
    return () => sub.remove();
  }, [ready]);

  // --- card creation ---
  const createCard = useCallback(
    (kept: TileSeed[]) => {
      const s = stateRef.current;
      const tiles: Tile[] = kept.slice(0, 24).map((seed, i) => ({
        id: uid('tile'),
        cell: cellForIndex(i),
        label: seed.label,
        emoji: seed.emoji,
        note: seed.note,
        category: seed.category,
        bankId: seed.bankId,
      }));
      const card: Card = {
        title: `My ${new Date().getFullYear()} Card`,
        year: new Date().getFullYear(),
        createdAt: Date.now(),
        tiles,
        rewards: defaultRewards(),
      };
      commitState({ ...s, card, log: log(s, 'card', 'Card built') });
    },
    [commitState]
  );

  const renameCard = useCallback((title: string) => {
    setState((st) => (st.card ? { ...st, card: { ...st.card, title: title.trim() || st.card.title } } : st));
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

  const pressTile = useCallback(
    (cell: number): TileOutcome => {
      const s = stateRef.current;
      const card = s.card;
      const tile = card?.tiles.find((t) => t.cell === cell);
      if (!card || !tile) return EMPTY_TILE_OUTCOME;

      const willCross = !tile.doneAt;
      const { before, after } = commit((st) => {
        if (!st.card) return st;
        const nextCard: Card = {
          ...st.card,
          tiles: st.card.tiles.map((t) => (t.id === tile.id ? { ...t, doneAt: willCross ? Date.now() : undefined } : t)),
        };
        const withLog = willCross ? { ...st, card: nextCard, log: log(st, 'tile', `Crossed off "${tile.label}"`) } : { ...st, card: nextCard };
        return withLog;
      });
      if (!before.card || !after.card) return EMPTY_TILE_OUTCOME;
      enqueue(celebrationsFor(before.card, after.card));
      return outcomeFor(before.card, after.card, willCross, !willCross, willCross && bonusFor(tile.id));
    },
    [commit, enqueue]
  );

  const setTileDone = useCallback(
    (cell: number, done: boolean) => {
      const card = stateRef.current.card;
      const tile = card?.tiles.find((t) => t.cell === cell);
      if (!card || !tile) return;
      const { before, after } = commit((st) => {
        if (!st.card) return st;
        const nextCard: Card = {
          ...st.card,
          tiles: st.card.tiles.map((t) => (t.id === tile.id ? { ...t, doneAt: done ? Date.now() : undefined } : t)),
        };
        return done ? { ...st, card: nextCard, log: log(st, 'tile', `Crossed off "${tile.label}"`) } : { ...st, card: nextCard };
      });
      if (before.card && after.card) enqueue(celebrationsFor(before.card, after.card));
    },
    [commit, enqueue]
  );

  const setTile = useCallback((cell: number, seed: TileSeed) => {
    if (cell === CENTER) return;
    setState((st) => {
      if (!st.card) return st;
      const existing = st.card.tiles.find((t) => t.cell === cell);
      const tile: Tile = {
        id: existing?.id ?? uid('tile'),
        cell,
        label: seed.label,
        emoji: seed.emoji,
        note: seed.note,
        category: seed.category,
        bankId: seed.bankId,
      };
      const tiles = existing ? st.card.tiles.map((t) => (t.id === existing.id ? tile : t)) : [...st.card.tiles, tile].sort((a, b) => a.cell - b.cell);
      return { ...st, card: { ...st.card, tiles } };
    });
  }, []);

  const clearTile = useCallback((cell: number) => {
    setState((st) => {
      if (!st.card) return st;
      return { ...st, card: { ...st.card, tiles: st.card.tiles.filter((t) => t.cell !== cell) } };
    });
  }, []);

  // --- rewards ---
  const addReward = useCallback(() => {
    setState((st) => {
      if (!st.card) return st;
      const max = st.card.rewards.reduce((m, r) => Math.max(m, r.bingos), 0);
      return { ...st, card: { ...st.card, rewards: [...st.card.rewards, { id: uid('rw'), bingos: Math.min(MAX_BINGOS, max + 1), text: '' }] } };
    });
  }, []);
  const editReward = useCallback((rewardId: string, patch: Partial<Reward>) => {
    setState((st) => (st.card ? { ...st, card: { ...st.card, rewards: st.card.rewards.map((r) => (r.id === rewardId ? { ...r, ...patch } : r)) } } : st));
  }, []);
  const removeReward = useCallback((rewardId: string) => {
    setState((st) => (st.card ? { ...st, card: { ...st.card, rewards: st.card.rewards.filter((r) => r.id !== rewardId) } } : st));
  }, []);
  const claimReward = useCallback((rewardId: string) => {
    setState((st) => {
      if (!st.card) return st;
      const rw = st.card.rewards.find((r) => r.id === rewardId);
      const card: Card = { ...st.card, rewards: st.card.rewards.map((r) => (r.id === rewardId ? { ...r, claimedAt: Date.now() } : r)) };
      return rw ? { ...st, card, log: log(st, 'reward', `Claimed: ${rw.text || `${rw.bingos}-bingo reward`}`) } : { ...st, card };
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
      createCard,
      renameCard,
      pressTile,
      setTileDone,
      setTile,
      clearTile,
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
      createCard,
      renameCard,
      pressTile,
      setTileDone,
      setTile,
      clearTile,
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

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
