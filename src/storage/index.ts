import { SyncRepository } from './syncRepository';

export type { Repository } from './repository';

/**
 * The single app-wide repository instance. `load`/`save`/`clear` are always
 * local-first and instant (the `Repository` contract every screen already uses);
 * `setUser`/`reconcile`/`getSyncStatus` are the sync-only extensions AppStateContext
 * calls once auth is wired in. See DESIGN-FRAMEWORK.md and CLAUDE.md.
 */
export const repository = new SyncRepository();
