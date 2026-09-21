import * as SecureStore from 'expo-secure-store';
import type { SupportedStorage } from '@supabase/supabase-js';

export const authStorage: SupportedStorage = {
  async getItem(key) {
    const count = Number(
      (await SecureStore.getItemAsync(`${key}.__chunks`)) ?? 0,
    );
    if (!count) return SecureStore.getItemAsync(key);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(`${key}.__chunk_${index}`),
      ),
    );
    return chunks.every((chunk): chunk is string => chunk !== null)
      ? chunks.join('')
      : null;
  },
  async setItem(key, value) {
    await authStorage.removeItem?.(key);
    const chunks = value.match(/.{1,1800}/gs) ?? [];
    if (chunks.length <= 1) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(`${key}.__chunk_${index}`, chunk),
      ),
    );
    await SecureStore.setItemAsync(`${key}.__chunks`, String(chunks.length));
  },
  async removeItem(key) {
    const count = Number(
      (await SecureStore.getItemAsync(`${key}.__chunks`)) ?? 0,
    );
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(`${key}.__chunks`),
      ...Array.from({ length: count }, (_, index) =>
        SecureStore.deleteItemAsync(`${key}.__chunk_${index}`),
      ),
    ]);
  },
};
export const detectSessionInUrl = false;
