import type { SupportedStorage } from '@supabase/supabase-js';

export const authStorage: SupportedStorage = {
  getItem(key) {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  setItem(key, value) {
    globalThis.localStorage?.setItem(key, value);
  },
  removeItem(key) {
    globalThis.localStorage?.removeItem(key);
  },
};
export const detectSessionInUrl = true;
