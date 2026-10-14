/**
 * All schema migrations live here — both `AppStateContext`'s hydrate effect and
 * `SyncRepository.reconcile()` call the single `migrate()` entry point, so a remote row
 * from an older schema (a second device, or a reinstall syncing before this device has
 * ever written v6 data) gets the same lossless transform local hydrate always has, instead
 * of `reconcile()`'s previous behavior of rejecting any schema mismatch outright with a
 * user-facing error.
 *
 * Legacy shapes are defined locally here, not exported from `domain/types.ts` — they're
 * migration-only, not part of the live domain model.
 */

import { uid } from '../domain/logic';
import { daysInMonth } from '../domain/schedule';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type AppState,
  type CardInstance,
  type CardTileInstance,
  type Goal,
  type PlanStep,
  type Reward,
  type Schedule,
  type Settings,
  type TileCategory,
} from '../domain/types';

// --- legacy shapes --------------------------------------------------------------------

interface LegacyTileV5 {
  id: string;
  cell: number;
  label: string;
  emoji?: string;
  note?: string;
  category?: TileCategory;
  bankId?: string;
  doneAt?: number;
  plan?: PlanStep[];
}

interface LegacyCardV5 {
  id: string;
  title: string;
  emoji?: string;
  intent?: string;
  year: number;
  createdAt: number;
  tiles: LegacyTileV5[];
  rewards: Reward[];
  focusedTileId?: string;
}

interface LegacyStateV5 {
  schemaVersion: 5;
  cards: LegacyCardV5[];
  draftCards?: unknown[];
  settings: Settings;
  log: AppState['log'];
}

interface LegacyStateV4 {
  schemaVersion: 4;
  card: LegacyCardV5 | null;
  settings: Settings;
  log: AppState['log'];
}

// --- v4 -> v5 (the old single-card shape -> any number of permanent cards) -----------

function migrateV4ToV5(raw: LegacyStateV4): LegacyStateV5 {
  return {
    schemaVersion: 5,
    cards: raw.card ? [{ ...raw.card, id: raw.card.id || uid('card') }] : [],
    draftCards: [],
    settings: raw.settings,
    log: raw.log,
  };
}

// --- v5 -> v6 (permanent cards -> schedules + card instances + a goal library) -------
//
// Every v5 Card becomes a Schedule: a one-time (`repeat: false`), 'custom'-mode schedule
// whose range is `[card.createdAt, card.createdAt + 100 years)` — a concrete finite
// number (never `Infinity`, which `JSON.stringify`s to `null` and would silently corrupt
// on the very next save), computed via calendar arithmetic (`setFullYear`) for the same
// rigor schedule.ts's own boundary math uses elsewhere. This is "never expires" in every
// way that matters without needing a special-cased sentinel value anywhere downstream.
//
// Every v5 Tile becomes a Goal (difficulty 'medium', type 'oneOff' — the neutral choice
// that trivially satisfies the <=2-Hard-per-line placement constraint, so migration never
// needs to run placement/shuffle validation against data that predates the constraint)
// plus a CardTileInstance. The tile's `id` is preserved verbatim, not re-minted — it's
// what `Card.focusedTileId` points at, and losing that link would silently break a
// migrated card's focused-tile banner.

const HUNDRED_YEARS_MS = (() => {
  const d = new Date(0);
  d.setFullYear(d.getFullYear() + 100);
  return d.getTime();
})();

function migrateV5ToV6(raw: LegacyStateV5): AppState {
  const goals: Goal[] = [];
  const schedules: Schedule[] = raw.cards.map((card) => {
    const tiles: CardTileInstance[] = card.tiles.map((tile) => {
      const goal: Goal = {
        id: uid('goal'),
        title: tile.label,
        difficulty: 'medium',
        type: 'oneOff',
        createdAt: card.createdAt,
      };
      goals.push(goal);
      const instanceTile: CardTileInstance = {
        id: tile.id, // preserved verbatim — see module comment
        cell: tile.cell,
        goalId: goal.id,
        title: tile.label,
        emoji: tile.emoji,
        note: tile.note,
        category: tile.category,
        bankId: tile.bankId,
        difficulty: 'medium',
        type: 'oneOff',
        doneAt: tile.doneAt,
        plan: tile.plan,
      };
      return instanceTile;
    });

    const customStart = card.createdAt;
    const customEnd = customStart + HUNDRED_YEARS_MS;
    const instance: CardInstance = {
      id: uid('inst'),
      scheduleId: '', // filled in below once the schedule's own id is known
      periodIndex: 0,
      start: customStart,
      end: customEnd,
      createdAt: card.createdAt,
      placementSeed: 'legacy-migration',
      tiles,
      swapUsed: false,
      lifecycleState: 'active',
      rewards: card.rewards, // carried over verbatim — legacy/decorative until Stage 2
      focusedTileId: card.focusedTileId,
    };

    const scheduleId = uid('sched');
    instance.scheduleId = scheduleId;
    const anchor = new Date(customStart);
    const schedule: Schedule = {
      id: scheduleId,
      title: card.title,
      mode: 'custom',
      repeat: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      anchorYear: anchor.getFullYear(),
      anchorMonth: anchor.getMonth() + 1,
      anchorDay: Math.min(anchor.getDate(), daysInMonth(anchor.getFullYear(), anchor.getMonth() + 1)),
      customStart,
      customEnd,
      createdAt: card.createdAt,
      lifecycleState: 'active',
      instances: [instance],
    };
    return schedule;
  });

  return {
    schemaVersion: 6,
    goals,
    schedules,
    settings: raw.settings,
    log: raw.log,
    // `draftCards` is intentionally dropped here — an in-progress "building a card"
    // session has nothing committed to lose (see domain/types.ts's note on why there's no
    // paused-build-session concept in the new model at all).
  };
}

// --- entry point ------------------------------------------------------------------

/** Migrates whatever shape of persisted data is passed in up to the current schema,
 *  version-gated and chained (v4 -> v5 -> v6) the same way every prior migration in this
 *  project has worked — never discarding data when a real, lossless transform exists.
 *  Returns `null` only when `raw` is `null`/`undefined` (nothing was ever persisted). */
export function migrate(raw: unknown): AppState | null {
  if (raw == null) return null;
  let current = raw as { schemaVersion?: number };

  if (current.schemaVersion === 4) {
    current = migrateV4ToV5(current as unknown as LegacyStateV4);
  }
  if (current.schemaVersion === 5) {
    current = migrateV5ToV6(current as unknown as LegacyStateV5);
  }
  if (current.schemaVersion === SCHEMA_VERSION) {
    const loaded = current as AppState;
    // Merge onto DEFAULT_SETTINGS (not a bare pass-through) so a settings field added
    // after some data was already persisted backfills to its default instead of reading
    // as `undefined` at every call site.
    return { ...loaded, settings: { ...DEFAULT_SETTINGS, ...loaded.settings } };
  }
  // An unrecognized/future schema version — nothing we can transform; the caller falls
  // back to a fresh empty state rather than risk misreading an unknown shape.
  return null;
}
