import { Redirect, Stack } from 'expo-router';

import { ProfileStateScreen } from '@/components/profile/ProfileStateScreen';
import { useAuth } from '@/providers/AuthProvider';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (loading) return <ProfileStateScreen />;
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
