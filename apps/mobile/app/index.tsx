import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { ProfileStateScreen } from '@/components/profile/ProfileStateScreen';
import { useProfile } from '@/providers/ProfileProvider';
import { resolveProfileRoute } from '@/utils/profile-routing';

export default function IndexScreen() {
  const { session } = useAuth();
  const { profile, loading, error, retry } = useProfile();
  const state = resolveProfileRoute({
    authenticated: Boolean(session),
    loading,
    error: Boolean(error),
    onboardingCompleted: profile?.profile?.onboardingCompleted === true,
  });
  if (state === 'login') return <Redirect href="/login" />;
  if (state === 'loading') return <ProfileStateScreen />;
  if (state === 'error')
    return <ProfileStateScreen error={error} onRetry={retry} />;
  return <Redirect href={state === 'home' ? '/home' : '/onboarding'} />;
}
