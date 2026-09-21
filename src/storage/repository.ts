import type { AppState } from '../domain/types';

/**
 * The one seam between the app and where data lives.
 *
 * Today: LocalRepository (AsyncStorage, on device). Tomorrow: a SupabaseRepository
 * with the same signature — screens and state never import a storage implementation
 * directly, only this interface via ../storage.
 */
export interface Repository {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}
