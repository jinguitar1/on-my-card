import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppState } from '../domain/types';
import type { Repository } from './repository';

// Bumped whenever the persisted shape changes incompatibly *and there's no real
// migration path* — old-shaped blobs then never get mistaken for the current one (see
// AppStateContext's schemaVersion check, which discards anything unrecognized). The v4
// (single `card`) → v5 (`cards[]`) change deliberately did NOT bump this key: it has a
// real, lossless transform written into AppStateContext's hydrate effect, and bumping
// the key would have orphaned every existing user's data under a key nothing reads
// anymore instead of letting it be migrated.
const KEY = 'onmycard:appstate:v4';
// Written alongside every save so SyncRepository can compare "last modified locally"
// against a remote row's `updated_at` without touching the AppState shape itself.
const UPDATED_AT_KEY = `${KEY}:updatedAt`;

/**
 * On-device persistence. Stores the whole AppState as one JSON blob — the state is
 * small (a handful of cards, a bounded history) and always read/written whole.
 *
 * Returns the blob exactly as stored — including whatever `schemaVersion` it actually
 * carries. It's the caller's job (AppStateContext) to compare that against the current
 * SCHEMA_VERSION and discard a mismatch; this layer must never silently rewrite the
 * version field on data it hasn't actually transformed.
 */
export class LocalRepository implements Repository {
  async load(): Promise<AppState | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AppState;
    } catch (err) {
      console.warn('[LocalRepository] load failed, starting fresh', err);
      return null;
    }
  }

  async save(state: AppState): Promise<void> {
    try {
      await AsyncStorage.multiSet([
        [KEY, JSON.stringify(state)],
        [UPDATED_AT_KEY, String(Date.now())],
      ]);
    } catch (err) {
      console.warn('[LocalRepository] save failed', err);
    }
  }

  async clear(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([KEY, UPDATED_AT_KEY]);
    } catch (err) {
      console.warn('[LocalRepository] clear failed', err);
    }
  }

  /** Epoch ms this device last saved locally, or 0 if never. Used for last-write-wins. */
  async getUpdatedAt(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(UPDATED_AT_KEY);
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  }
}
