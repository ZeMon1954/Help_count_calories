import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppErrorBoundary } from '@/components/system/AppErrorBoundary';
import { AuthProvider } from '@/providers/AuthProvider';
import { ProfileProvider } from '@/providers/ProfileProvider';
import { PwaStatus } from '@/components/web/PwaStatus';
import { configureNotifications } from '@/services/reminders';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

configureNotifications();

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) console.info('[Diagnostics] Root layout mounted');
  }, []);

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ProfileProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <PwaStatus />
          <StatusBar style="dark" />
        </ProfileProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
