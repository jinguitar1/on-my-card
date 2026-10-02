import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * SecureStore-backed adapter for Supabase's auth `storage` option (iOS Keychain /
 * Android Keystore, instead of AsyncStorage's plaintext file) — see CLAUDE.md's
 * security-audit notes on why session/refresh tokens shouldn't sit unencrypted.
 * SecureStore caps each item around ~2KB on some platforms, and a full Supabase
 * session can exceed that, so a value is split across `${key}_0`, `${key}_1`, ...
 * and a `${key}_n` sentinel (chunk count) is written last so a reader never sees a
 * partial write as if it were complete.
 */
const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}_${index}`;
}

export const SecureChunkedStorage = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(`${key}_n`);
    if (countRaw === null) return null;
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count <= 0) return null;

    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      if (chunk === null) return null; // a chunk went missing — treat as no value rather than corrupt data
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i * CHUNK_SIZE < value.length; i++) {
      chunks.push(value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push('');

    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));

    // Remove any leftover chunks from a previous, longer value before advancing the count,
    // so a shrink never leaves stale trailing chunks a future read could pick up.
    const prevCountRaw = await SecureStore.getItemAsync(`${key}_n`);
    const prevCount = prevCountRaw ? Number(prevCountRaw) : 0;
    if (Number.isInteger(prevCount) && prevCount > chunks.length) {
      await Promise.all(
        Array.from({ length: prevCount - chunks.length }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, chunks.length + i)))
      );
    }

    await SecureStore.setItemAsync(`${key}_n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(`${key}_n`);
    const count = countRaw ? Number(countRaw) : 0;
    if (Number.isInteger(count) && count > 0) {
      await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))));
    }
    await SecureStore.deleteItemAsync(`${key}_n`);
  },
};

/**
 * `expo-secure-store` has no web implementation at all (`isAvailableAsync()` only ever
 * resolves `true` on iOS/Android; its `.web` module is an empty stub) — calling it on
 * `npm run web` would throw immediately rather than degrade. This project's `npm run
 * web` (react-native-web) is a real, currently-working dev target, so native gets the
 * Keychain/Keystore-backed storage above and web falls back to AsyncStorage, same as
 * before this change — a browser tab doesn't have an OS keychain to hand it anyway, so
 * this isn't a regression for web, just unchanged behavior there.
 */
export const AuthStorage = Platform.OS === 'web' ? AsyncStorage : SecureChunkedStorage;
