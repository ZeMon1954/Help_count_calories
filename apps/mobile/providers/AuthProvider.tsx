import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/services/supabase/client';

interface SignUpResult {
  requiresEmailVerification: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function requireSupabase() {
  if (!supabase)
    throw new Error('Supabase is not configured in the mobile environment');
  return supabase;
}

function getRecoveryParams(url: string) {
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const fragment = url.split('#')[1] ?? '';
  const params = new URLSearchParams(query);
  new URLSearchParams(fragment).forEach((value, key) => params.set(key, value));
  return params;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (__DEV__) console.info('[Diagnostics] AuthProvider initialized');
  }, []);

  const handleAuthLink = useCallback(async (url: string) => {
    const client = requireSupabase();
    const params = getRecoveryParams(url);
    const type = params.get('type');
    const code = params.get('code');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (type === 'recovery' || url.includes('reset-password')) {
      setRecoveryMode(true);
    }

    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (accessToken && refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    }
  }, []);

  useEffect(() => {
    const client = requireSupabase();
    let active = true;

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn('[Auth] Unable to restore session');
        setSession(data.session ?? null);
        setLoading(false);
        if (__DEV__)
          console.info(
            `[Diagnostics] Supabase session restored: ${data.session ? 'authenticated' : 'anonymous'}`,
          );
      })
      .catch(() => {
        if (!active) return;
        console.warn('[Auth] Unable to restore session');
        setSession(null);
        setLoading(false);
      });

    const { data: subscription } = client.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      },
    );

    const appStateSubscription =
      Platform.OS === 'web'
        ? undefined
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') client.auth.startAutoRefresh();
            else client.auth.stopAutoRefresh();
          });
    if (Platform.OS !== 'web') client.auth.startAutoRefresh();

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthLink(url).catch(() => {
        console.warn('[Auth] Unable to process recovery link');
      });
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void handleAuthLink(url).catch(() => undefined);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      appStateSubscription?.remove();
      linkSubscription.remove();
    };
  }, [handleAuthLink]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recoveryMode,
      async signIn(email, password) {
        const { error } = await requireSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      async signUp(email, password) {
        const { data, error } = await requireSupabase().auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        return { requiresEmailVerification: data.session === null };
      },
      async signOut() {
        const { error } = await requireSupabase().auth.signOut();
        if (error) throw error;
      },
      async requestPasswordReset(email) {
        const redirectTo = Linking.createURL('reset-password');
        const { error } = await requireSupabase().auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo },
        );
        if (error) throw error;
        return redirectTo;
      },
      async updatePassword(password) {
        const { error } = await requireSupabase().auth.updateUser({ password });
        if (error) throw error;
        setRecoveryMode(false);
      },
    }),
    [loading, recoveryMode, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
