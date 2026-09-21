import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { mobileEnv } from '@/constants/env';
import { authStorage, detectSessionInUrl } from './storage';

export const supabase =
  mobileEnv.supabaseUrl && mobileEnv.supabaseKey
    ? createClient(mobileEnv.supabaseUrl, mobileEnv.supabaseKey, {
        auth: {
          storage: authStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl,
        },
      })
    : null;
