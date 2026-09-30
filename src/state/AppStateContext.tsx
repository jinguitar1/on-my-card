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
import { emptyState } from '../domain/seed';
import {
  CENTER,
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type AppState,
  type Card,
  type DraftCard,
  type DraftCardTile,
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
  syncStatus: { lastSyncedAt: number | null; lastError: string | null };

  createCard: (kept: TileSeed[], title: string, emoji?: string) => void;
  renameCard: (cardId: string, title: string) => void;
  setCardEmoji: (cardId: string, emoji: string) => void;
  saveDraftCard: (kept: DraftCardTile[], rejected: DraftCardTile[], usedSecondPass: boolean) => void;
  clearDraftCard: () => void;

  pressTile: (cardId: string, cell: number) => TileOutcome;
  setTileDone: (cardId: string, cell: number, done: boolean) => void;
  setTile: (cardId: string, cell: number, seed: TileSeed) => void;
  clearTile: (cardId: string, cell: number) => void;
  setFocusedTile: (cardId: string, tileId: string | null) => void;

  addReward: (cardId: string) => void;
  editReward: (cardId: string, rewardId: string, patch: Partial<Reward>) => void;
  removeReward: (cardId: string, rewardId: string) => void;
  claimReward: (cardId: string, rewardId: string) => void;

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

  // Rewards are tucked away (unfleshed-out feature) — skip the unlock celebration so it
  // never pops a "REWARD UNLOCKED" takeover pointing at a Rewards tab that isn't there.
  if (FEATURES.rewards) {
    const beforeBingos = bingoCount(before);
    const afterBingos = bingoCount(after);
    for (const rw of after.rewards) {
      if (rw.bingos > beforeBingos && rw.bingos <= afterBingos) {
        out.push({ kind: 'reward', bingos: rw.bingos, text: rw.text });
      }
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
      // v4 → v5: the old shape had one `card: Card | null` instead of `cards: Card[]`.
      // This is a real, lossless transform (unlike a version mismatch with no known
      // shape), so — deliberately, see LocalRepository's key comment — the AsyncStorage
      // key was NOT bumped for this change, specifically so this old data is still found
      // here instead of being silently orphaned under an unreachable key.
      let loaded: AppState | null = null;
      if (loadedRaw) {
        const raw = loadedRaw as unknown as
          | AppState
          | { schemaVersion: 4; card: Card | null; settings: AppState['settings']; log: AppState['log'] };
        if (raw.schemaVersion === SCHEMA_VERSION) {
          loaded = raw as AppState;
        } else if (raw.schemaVersion === 4 && 'card' in raw) {
          loaded = {
            schemaVersion: SCHEMA_VERSION,
            cards: raw.card ? [{ ...raw.card, id: uid('card') }] : [],
            draftCard: null,
            settings: raw.settings,
            log: raw.log,
          };
        }
      }
      // Merge onto DEFAULT_SETTINGS (not a bare pass-through) so a settings field added
      // after some data was already persisted — same schemaVersion, just missing a key
      // that didn't exist yet — backfills to its default instead of reading as
      // `undefined` at every call site. `draftCard` gets the same treatment: it was
      // added after v5 shipped, so old v5 data simply lacks the key.
      const base = loaded
        ? { ...loaded, draftCard: loaded.draftCard ?? null, settings: { ...DEFAULT_SETTINGS, ...loaded.settings } }
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

  // foreground: keep notifications in sync
  useEffect(() => {
    const handle = () => void reconcileNotifications(stateRef.current);
    handle();
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && handle());
    return () => sub.remove();
  }, [ready]);

  // --- card creation ---
  const createCard = useCallback(
    (kept: TileSeed[], title: string, emoji?: string) => {
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
        id: uid('card'),
        title: title.trim() || `My ${new Date().getFullYear()} Card`,
        emoji: emoji?.trim() || undefined,
        year: new Date().getFullYear(),
        createdAt: Date.now(),
        tiles,
        rewards: defaultRewards(),
      };
      // Newest first — the dashboard shows `cards` in this order with no separate sort.
      commitState({ ...s, cards: [card, ...s.cards], log: log(s, 'card', 'Card built') });
    },
    [commitState]
  );

  const renameCard = useCallback((cardId: string, title: string) => {
    setState((st) => ({
      ...st,
      cards: st.cards.map((c) => (c.id === cardId ? { ...c, title: title.trim() || c.title } : c)),
    }));
  }, []);

  const setCardEmoji = useCallback((cardId: string, emoji: string) => {
    setState((st) => ({
      ...st,
      cards: st.cards.map((c) => (c.id === cardId ? { ...c, emoji: emoji.trim() || undefined } : c)),
    }));
  }, []);

  // --- draft card (an in-progress swipe-deck session, paused and resumed) ---
  const saveDraftCard = useCallback((kept: DraftCardTile[], rejected: DraftCardTile[], usedSecondPass: boolean) => {
    setState((st) => ({ ...st, draftCard: { kept, rejected, usedSecondPass } }));
  }, []);

  const clearDraftCard = useCallback(() => {
    setState((st) => ({ ...st, draftCard: null }));
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
    (cardId: string, cell: number): TileOutcome => {
      const s = stateRef.current;
      const card = s.cards.find((c) => c.id === cardId);
      const tile = card?.tiles.find((t) => t.cell === cell);
      if (!card || !tile) return EMPTY_TILE_OUTCOME;

      const willCross = !tile.doneAt;
      const { before, after } = commit((st) => {
        const stCard = st.cards.find((c) => c.id === cardId);
        if (!stCard) return st;
        const nextCard: Card = {
          ...stCard,
          tiles: stCard.tiles.map((t) => (t.id === tile.id ? { ...t, doneAt: willCross ? Date.now() : undefined } : t)),
          // Crossing off the focused tile clears the focus — nothing left to steer toward.
          focusedTileId: willCross && stCard.focusedTileId === tile.id ? undefined : stCard.focusedTileId,
        };
        const nextCards = st.cards.map((c) => (c.id === cardId ? nextCard : c));
        return willCross
          ? { ...st, cards: nextCards, log: log(st, 'tile', `Crossed off "${tile.label}"`) }
          : { ...st, cards: nextCards };
      });
      const beforeCard = before.cards.find((c) => c.id === cardId);
      const afterCard = after.cards.find((c) => c.id === cardId);
      if (!beforeCard || !afterCard) return EMPTY_TILE_OUTCOME;
      enqueue(celebrationsFor(beforeCard, afterCard));
      return outcomeFor(beforeCard, afterCard, willCross, !willCross, willCross && bonusFor(tile.id));
    },
    [commit, enqueue]
  );

  const setTileDone = useCallback(
    (cardId: string, cell: number, done: boolean) => {
      const card = stateRef.current.cards.find((c) => c.id === cardId);
      const tile = card?.tiles.find((t) => t.cell === cell);
      if (!card || !tile) return;
      const { before, after } = commit((st) => {
        const stCard = st.cards.find((c) => c.id === cardId);
        if (!stCard) return st;
        const nextCard: Card = {
          ...stCard,
          tiles: stCard.tiles.map((t) => (t.id === tile.id ? { ...t, doneAt: done ? Date.now() : undefined } : t)),
          focusedTileId: done && stCard.focusedTileId === tile.id ? undefined : stCard.focusedTileId,
        };
        const nextCards = st.cards.map((c) => (c.id === cardId ? nextCard : c));
        return done ? { ...st, cards: nextCards, log: log(st, 'tile', `Crossed off "${tile.label}"`) } : { ...st, cards: nextCards };
      });
      const beforeCard = before.cards.find((c) => c.id === cardId);
      const afterCard = after.cards.find((c) => c.id === cardId);
      if (beforeCard && afterCard) enqueue(celebrationsFor(beforeCard, afterCard));
    },
    [commit, enqueue]
  );

  const setTile = useCallback((cardId: string, cell: number, seed: TileSeed) => {
    if (cell === CENTER) return;
    setState((st) => {
      const stCard = st.cards.find((c) => c.id === cardId);
      if (!stCard) return st;
      const existing = stCard.tiles.find((t) => t.cell === cell);
      const tile: Tile = {
        id: existing?.id ?? uid('tile'),
        cell,
        label: seed.label,
        emoji: seed.emoji,
        note: seed.note,
        category: seed.category,
        bankId: seed.bankId,
      };
      const tiles = existing ? stCard.tiles.map((t) => (t.id === existing.id ? tile : t)) : [...stCard.tiles, tile].sort((a, b) => a.cell - b.cell);
      return { ...st, cards: st.cards.map((c) => (c.id === cardId ? { ...stCard, tiles } : c)) };
    });
  }, []);

  const clearTile = useCallback((cardId: string, cell: number) => {
    setState((st) => {
      const stCard = st.cards.find((c) => c.id === cardId);
      if (!stCard) return st;
      const tiles = stCard.tiles.filter((t) => t.cell !== cell);
      const removed = stCard.tiles.find((t) => t.cell === cell);
      const focusedTileId = removed && stCard.focusedTileId === removed.id ? undefined : stCard.focusedTileId;
      return { ...st, cards: st.cards.map((c) => (c.id === cardId ? { ...stCard, tiles, focusedTileId } : c)) };
    });
  }, []);

  /** Pass `null` to clear focus. Only ever one tile focused at a time per card — setting
   *  a new one replaces whatever was focused before, matching "pick the one thing to
   *  work toward" rather than a growing list. */
  const setFocusedTile = useCallback((cardId: string, tileId: string | null) => {
    setState((st) => ({
      ...st,
      cards: st.cards.map((c) => (c.id === cardId ? { ...c, focusedTileId: tileId ?? undefined } : c)),
    }));
  }, []);

  // --- rewards ---
  const addReward = useCallback((cardId: string) => {
    setState((st) => {
      const stCard = st.cards.find((c) => c.id === cardId);
      if (!stCard) return st;
      const max = stCard.rewards.reduce((m, r) => Math.max(m, r.bingos), 0);
      const nextCard = { ...stCard, rewards: [...stCard.rewards, { id: uid('rw'), bingos: Math.min(MAX_BINGOS, max + 1), text: '' }] };
      return { ...st, cards: st.cards.map((c) => (c.id === cardId ? nextCard : c)) };
    });
  }, []);
  const editReward = useCallback((cardId: string, rewardId: string, patch: Partial<Reward>) => {
    setState((st) => ({
      ...st,
      cards: st.cards.map((c) =>
        c.id === cardId ? { ...c, rewards: c.rewards.map((r) => (r.id === rewardId ? { ...r, ...patch } : r)) } : c
      ),
    }));
  }, []);
  const removeReward = useCallback((cardId: string, rewardId: string) => {
    setState((st) => ({
      ...st,
      cards: st.cards.map((c) => (c.id === cardId ? { ...c, rewards: c.rewards.filter((r) => r.id !== rewardId) } : c)),
    }));
  }, []);
  const claimReward = useCallback((cardId: string, rewardId: string) => {
    setState((st) => {
      const stCard = st.cards.find((c) => c.id === cardId);
      if (!stCard) return st;
      const rw = stCard.rewards.find((r) => r.id === rewardId);
      const nextCard = { ...stCard, rewards: stCard.rewards.map((r) => (r.id === rewardId ? { ...r, claimedAt: Date.now() } : r)) };
      const nextCards = st.cards.map((c) => (c.id === cardId ? nextCard : c));
      return rw ? { ...st, cards: nextCards, log: log(st, 'reward', `Claimed: ${rw.text || `${rw.bingos}-bingo reward`}`) } : { ...st, cards: nextCards };
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
      createCard,
      renameCard,
      setCardEmoji,
      saveDraftCard,
      clearDraftCard,
      pressTile,
      setTileDone,
      setTile,
      clearTile,
      setFocusedTile,
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
      createCard,
      renameCard,
      setCardEmoji,
      saveDraftCard,
      clearDraftCard,
      pressTile,
      setTileDone,
      setTile,
      clearTile,
      setFocusedTile,
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
