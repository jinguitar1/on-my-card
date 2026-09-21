import { LocalRepository } from './localRepository';
import type { Repository } from './repository';

export type { Repository } from './repository';

/**
 * The single app-wide repository instance. Swap this line for a SupabaseRepository
 * (or a composite that syncs local ↔ remote) when the sync milestone lands — nothing
 * else has to change. See DESIGN-FRAMEWORK.md §11.
 */
export const repository: Repository = new LocalRepository();
