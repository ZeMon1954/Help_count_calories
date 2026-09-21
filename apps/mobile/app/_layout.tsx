import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/providers/AuthProvider';
import { ProfileProvider } from '@/providers/ProfileProvider';
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
  return (
    <AuthProvider>
      <ProfileProvider>
        <Stack
          screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <StatusBar style="dark" />
      </ProfileProvider>
    </AuthProvider>
  );
}
