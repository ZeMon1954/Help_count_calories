import { Redirect, Tabs } from 'expo-router';
import { Text, View } from 'react-native';

import { ProfileStateScreen } from '@/components/profile/ProfileStateScreen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { resolveProfileRoute } from '@/utils/profile-routing';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      className={`text-lg font-bold ${focused ? 'text-emerald-600' : 'text-slate-400'}`}
    >
      {label}
    </Text>
  );
}

export default function ProtectedLayout() {
  const { session, loading: authLoading } = useAuth();
  const { profile, loading, error, retry } = useProfile();
  const state = resolveProfileRoute({
    authenticated: Boolean(session),
    loading: authLoading || loading,
    error: Boolean(error),
    onboardingCompleted: profile?.profile?.onboardingCompleted === true,
  });
  if (state === 'login') return <Redirect href="/(auth)/login" />;
  if (state === 'onboarding') return <Redirect href="/onboarding" />;

  return (
    <View className="flex-1">
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#059669',
            tabBarInactiveTintColor: '#94a3b8',
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            tabBarStyle: {
              height: 78,
              paddingBottom: 18,
              paddingTop: 8,
              borderTopColor: '#e2e8f0',
              backgroundColor: '#ffffff',
            },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: 'วันนี้',
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} label="H" />
              ),
            }}
          />
          <Tabs.Screen
            name="food"
            options={{
              title: 'อาหาร',
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} label="F" />
              ),
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: 'ความคืบหน้า',
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} label="P" />
              ),
            }}
          />
          <Tabs.Screen
            name="activity"
            options={{
              title: 'กิจกรรม',
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} label="G" />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'โปรไฟล์',
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} label="U" />
              ),
            }}
          />
          <Tabs.Screen name="add-food" options={{ href: null }} />
          <Tabs.Screen name="food-scanner" options={{ href: null }} />
          <Tabs.Screen name="settings/[section]" options={{ href: null }} />
          <Tabs.Screen name="nutrition-analysis" options={{ href: null }} />
        </Tabs>
      {state === 'loading' || state === 'error' ? (
        <View className="absolute inset-0 z-50 bg-white">
          <ProfileStateScreen
            error={state === 'error' ? error : undefined}
            onRetry={state === 'error' ? retry : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}
