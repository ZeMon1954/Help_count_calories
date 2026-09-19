import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/AuthProvider';
import { apiRequest } from '@/services/api/client';

interface MeResponse {
  id: string;
  email: string | null;
}

export default function HomeScreen() {
  const { session, user, signOut } = useAuth();
  const [me, setMe] = useState<MeResponse>();
  const [apiError, setApiError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    void apiRequest<MeResponse>('me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(({ data }) => setMe(data))
      .catch(() => setApiError('ไม่สามารถยืนยันตัวตนกับ API ได้'));
  }, [session?.access_token]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="gap-6">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500">
            <Text className="text-xl font-bold text-white">AI</Text>
          </View>
          <View className="gap-2">
            <Text className="text-3xl font-bold tracking-tight text-white">
              Welcome to AI Fitness Tracker
            </Text>
            <Text className="text-base text-slate-400">
              {user?.email ?? 'ไม่พบอีเมล'}
            </Text>
          </View>
          <View className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <Text className="font-semibold text-white">สถานะ Backend Auth</Text>
            {me ? (
              <Text className="mt-2 text-emerald-400">
                ยืนยันแล้ว: {me.email ?? me.id}
              </Text>
            ) : apiError ? (
              <Text className="mt-2 text-red-400">{apiError}</Text>
            ) : (
              <ActivityIndicator className="mt-3 self-start" color="#34d399" />
            )}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl border border-slate-700 px-5 py-3 active:bg-slate-900"
          disabled={loggingOut}
          onPress={logout}
        >
          {loggingOut ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="font-semibold text-white">ออกจากระบบ</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
