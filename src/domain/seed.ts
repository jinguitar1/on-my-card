/**
 * The starting state for a fresh install (and for "reset"). `card: null` means "no card
 * yet" — RootNavigator reads that as the onboarding gate. There's no seed content: the
 * card is always built by swiping through the curated bank, never pre-filled.
 */

import { DEFAULT_SETTINGS, SCHEMA_VERSION, type AppState } from './types';

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    card: null,
    settings: { ...DEFAULT_SETTINGS },
    log: [],
  };
}
