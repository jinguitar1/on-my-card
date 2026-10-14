import { SCHEMA_VERSION, type AppState } from '../domain/types';
import { LocalRepository } from './localRepository';
import { migrate } from './migrations';
import { deleteRow, fetchRow, upsertRow } from './remoteRepository';
import type { Repository } from './repository';

/**
 * Local-first sync: `load`/`save`/`clear` are the same `Repository` contract every
 * screen already calls, so nothing above this changes. Local is always the fast path —
 * every one of those three hits AsyncStorage only and returns before any network call
 * even starts. The Supabase side is a background fire-and-forget once a user is set;
 * a failed push is logged, retried on the next save, and never surfaces as an error to
 * the UI.
 *
 * `reconcile()` is the one extra method, called once per sign-in by AppStateContext:
 * last-write-wins by timestamp between the remote row's `updated_at` and the local
 * `getUpdatedAt()` marker. Known simplification for v1 — see DESIGN-FRAMEWORK.md.
 */
export class SyncRepository implements Repository {
  private local = new LocalRepository();
  private userId: string | null = null;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private listeners = new Set<() => void>();

  setUser(userId: string | null) {
    this.userId = userId;
  }

  getSyncStatus(): { lastSyncedAt: number | null; lastError: string | null } {
    return { lastSyncedAt: this.lastSyncedAt, lastError: this.lastError };
  }

  /** Reactive hook-up for the Settings status line — see AppStateContext. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async load(): Promise<AppState | null> {
    return this.local.load();
  }

  async save(state: AppState): Promise<void> {
    await this.local.save(state);
    void this.pushRemote(state);
  }

  async clear(): Promise<void> {
    await this.local.clear();
    if (this.userId) {
      try {
        await deleteRow(this.userId);
      } catch (err) {
        console.warn('[SyncRepository] remote clear failed', err);
      }
    }
  }

  /** Pull-or-push once per sign-in. Returns the state to adopt locally, or null if
   *  nothing changed (local was already current, or there was nothing to reconcile). */
  async reconcile(): Promise<AppState | null> {
    if (!this.userId) return null;
    try {
      const remote = await fetchRow(this.userId);
      if (!remote) {
        const local = await this.local.load();
        if (local) await upsertRow(this.userId, local);
        this.markSynced();
        return null;
      }
      let remoteState = remote.state;
      if (remote.schemaVersion !== SCHEMA_VERSION) {
        // A remote row from an older schema (a second device, or a reinstall syncing
        // before this device has ever written the current schema) used to be rejected
        // outright with a user-facing error here. It gets the same lossless migration
        // local hydrate always has instead — `migrate()` is the one shared entry point
        // both call, so the two paths can't drift apart.
        const migrated = migrate(remote.state);
        if (!migrated) {
          // Only a genuinely unrecognized/future shape falls through to this — nothing
          // to transform, so don't adopt it, but don't overwrite it blindly either; the
          // next local save upserts once local is current.
          this.setError('Remote data is from a different app version');
          return null;
        }
        remoteState = migrated;
      }
      const localUpdatedAt = await this.local.getUpdatedAt();
      if (remote.updatedAtMs > localUpdatedAt) {
        await this.local.save(remoteState);
        this.markSynced();
        return remoteState;
      }
      const local = await this.local.load();
      if (local) await upsertRow(this.userId, local);
      this.markSynced();
      return null;
    } catch (err) {
      this.setError(err instanceof Error ? err.message : 'Sync failed');
      console.warn('[SyncRepository] reconcile failed', err);
      return null;
    }
  }

  private async pushRemote(state: AppState): Promise<void> {
    if (!this.userId) return;
    try {
      await upsertRow(this.userId, state);
      this.markSynced();
    } catch (err) {
      this.setError(err instanceof Error ? err.message : 'Sync failed');
      console.warn('[SyncRepository] push failed, will retry on next save', err);
    }
  }

  private markSynced() {
    this.lastSyncedAt = Date.now();
    this.lastError = null;
    this.notify();
  }

  private setError(message: string) {
    this.lastError = message;
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}
