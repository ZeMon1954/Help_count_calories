import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@/providers/AuthProvider';
import {
  fetchProfile,
  type OnboardingInput,
  type ProfileSnapshot,
  saveOnboarding,
} from '@/services/api/profile';

interface ProfileContextValue {
  profile: ProfileSnapshot | null;
  loading: boolean;
  error: string;
  retry: () => Promise<void>;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setProfile(null);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setProfile(await fetchProfile(session.access_token));
    } catch {
      setError('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้ กรุณาตรวจสอบเครือข่าย');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      loading,
      error,
      retry: load,
      async completeOnboarding(input) {
        if (!session?.access_token) throw new Error('Authentication required');
        const saved = await saveOnboarding(session.access_token, input);
        setProfile(saved);
        setError('');
      },
    }),
    [error, load, loading, profile, session?.access_token],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context)
    throw new Error('useProfile must be used within ProfileProvider');
  return context;
}
