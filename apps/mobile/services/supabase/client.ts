import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';

import { mobileEnv } from '@/constants/env';

const secureStorage: SupportedStorage = {
  async getItem(key) {
    if (Platform.OS === 'web') return null;
    const chunkCount = Number(
      (await SecureStore.getItemAsync(`${key}.__chunks`)) ?? 0,
    );
    if (!chunkCount) return SecureStore.getItemAsync(key);

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) =>
        SecureStore.getItemAsync(`${key}.__chunk_${index}`),
      ),
    );
    return chunks.every((chunk): chunk is string => chunk !== null)
      ? chunks.join('')
      : null;
  },
  async setItem(key, value) {
    if (Platform.OS === 'web') return;
    await secureStorage.removeItem?.(key);
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
    if (Platform.OS === 'web') return;
    const chunkCount = Number(
      (await SecureStore.getItemAsync(`${key}.__chunks`)) ?? 0,
    );
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(`${key}.__chunks`),
      ...Array.from({ length: chunkCount }, (_, index) =>
        SecureStore.deleteItemAsync(`${key}.__chunk_${index}`),
      ),
    ]);
  },
};

export const supabase =
  mobileEnv.supabaseUrl && mobileEnv.supabaseKey
    ? createClient(mobileEnv.supabaseUrl, mobileEnv.supabaseKey, {
        auth: {
          storage: secureStorage,
          autoRefreshToken: true,
          persistSession: Platform.OS !== 'web',
          detectSessionInUrl: false,
        },
      })
    : null;
