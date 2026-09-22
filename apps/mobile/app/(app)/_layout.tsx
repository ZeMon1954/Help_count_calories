import { Redirect, Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { ProfileStateScreen } from '@/components/profile/ProfileStateScreen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { resolveProfileRoute } from '@/utils/profile-routing';

function TabIcon({
  name,
  color,
}: {
  name: ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: ComponentProps<typeof MaterialCommunityIcons>['color'];
}) {
  return <MaterialCommunityIcons name={name} size={24} color={color} />;
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
            tabBarHideOnKeyboard: true,
            tabBarStyle: {
              minHeight: 68,
              paddingBottom: 8,
              paddingTop: 7,
              borderTopColor: '#e2e8f0',
              backgroundColor: '#ffffff',
            },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: 'วันนี้',
              tabBarIcon: ({ color }) => <TabIcon color={color} name="home-variant-outline" />,
            }}
          />
          <Tabs.Screen
            name="food"
            options={{
              title: 'อาหาร',
              tabBarIcon: ({ color }) => <TabIcon color={color} name="silverware-fork-knife" />,
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: 'สถิติ',
              tabBarIcon: ({ color }) => <TabIcon color={color} name="chart-line" />,
            }}
          />
          <Tabs.Screen
            name="activity"
            options={{
              title: 'กิจกรรม',
              tabBarIcon: ({ color }) => <TabIcon color={color} name="run" />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'โปรไฟล์',
              tabBarIcon: ({ color }) => <TabIcon color={color} name="account-outline" />,
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
