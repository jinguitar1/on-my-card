/**
 * The starting state for a fresh install (and for "reset"). `schedules: []` means "no
 * schedules yet" — RootNavigator reads that as the onboarding gate. There's no seed
 * content: every goal is always added by the user, never pre-filled.
 */

import { DEFAULT_SETTINGS, SCHEMA_VERSION, type AppState } from './types';

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    goals: [],
    schedules: [],
    settings: { ...DEFAULT_SETTINGS },
    log: [],
  };
}
