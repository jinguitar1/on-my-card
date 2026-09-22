import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from './database.types';

/**
 * The one Supabase client for the app (project `on-my-card`,
 * `shcxirtjmkzffwghucls`). Session lives in AsyncStorage (same package Supabase's own
 * Expo quickstart uses) — good enough for a solo app; `detectSessionInUrl: false`
 * because we never redirect through a URL (email OTP, not magic links or OAuth).
 * Typed against `database.types.ts` (regenerate via the Supabase types tool whenever
 * the schema changes) so a typo in a column/table name is a compile error, not a
 * runtime one.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.'
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's refresh timer only runs while this fires; pause it in the background so
// a backgrounded app doesn't keep waking the network for no one.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
