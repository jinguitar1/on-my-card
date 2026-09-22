import { supabase } from '../lib/supabaseClient';
import { SCHEMA_VERSION, type AppState } from '../domain/types';
import type { Json } from '../lib/database.types';

/**
 * Thin, user-scoped queries against the `app_state` table (one JSONB row per user —
 * see DESIGN-FRAMEWORK.md / CLAUDE.md for why: it mirrors the local blob exactly, so
 * nothing above this layer has to change shape). RLS on the table already restricts
 * every one of these to `auth.uid()`; `userId` here is just which row to address, not
 * a security boundary by itself.
 */

export interface RemoteRow {
  state: AppState;
  schemaVersion: number;
  updatedAtMs: number;
}

export async function fetchRow(userId: string): Promise<RemoteRow | null> {
  const { data, error } = await supabase
    .from('app_state')
    .select('state, schema_version, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    // AppState is our own shape, not a generic index-signature bag — round-trips
    // through JSONB fine at runtime, just needs the two-step assertion TS wants for
    // types that don't structurally overlap.
    state: data.state as unknown as AppState,
    schemaVersion: data.schema_version,
    updatedAtMs: new Date(data.updated_at).getTime(),
  };
}

export async function upsertRow(userId: string, state: AppState): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert(
      { user_id: userId, schema_version: SCHEMA_VERSION, state: state as unknown as Json },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
}

export async function deleteRow(userId: string): Promise<void> {
  const { error } = await supabase.from('app_state').delete().eq('user_id', userId);
  if (error) throw error;
}
