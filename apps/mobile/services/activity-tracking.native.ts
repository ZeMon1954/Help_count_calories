import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { appendActivityPoints, type ActivityPoint } from './api/activity';
import { supabase } from './supabase/client';

export const ACTIVITY_LOCATION_TASK = 'fitness-background-location';
const ACTIVITY_ID_KEY = 'active-gps-activity-id';
const SEQUENCE_KEY = 'active-gps-sequence';
const queueKey = (activityId: string) => `gps-queue:${activityId}`;

function nonnegativeOrNull(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteOrNull(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null;
}

function sanitizePoint(point: ActivityPoint): ActivityPoint | null {
  if (
    !Number.isInteger(point.sequence) ||
    point.sequence < 0 ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180 ||
    !Number.isFinite(Date.parse(point.recorded_at))
  )
    return null;
  return {
    ...point,
    accuracy_m:
      point.accuracy_m !== null && point.accuracy_m <= 10_000
        ? nonnegativeOrNull(point.accuracy_m)
        : null,
    altitude_m:
      point.altitude_m !== null &&
      point.altitude_m >= -1_000 &&
      point.altitude_m <= 20_000
        ? finiteOrNull(point.altitude_m)
        : null,
    speed_mps:
      point.speed_mps !== null && point.speed_mps <= 150
        ? nonnegativeOrNull(point.speed_mps)
        : null,
  };
}

async function nextPoints(locations: Location.LocationObject[]) {
  let sequence = Number(await SecureStore.getItemAsync(SEQUENCE_KEY)) || 0;
  const points: ActivityPoint[] = locations.map((location) => ({
    sequence: sequence++,
    recorded_at: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy_m: nonnegativeOrNull(location.coords.accuracy),
    altitude_m: finiteOrNull(location.coords.altitude),
    speed_mps: nonnegativeOrNull(location.coords.speed),
  }));
  await SecureStore.setItemAsync(SEQUENCE_KEY, String(sequence));
  return points;
}

TaskManager.defineTask(ACTIVITY_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const activityId = await SecureStore.getItemAsync(ACTIVITY_ID_KEY);
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!activityId || !sessionData.session?.access_token) return;
  const locations =
    (data as { locations?: Location.LocationObject[] }).locations ?? [];
  if (!locations.length) return;
  await flushQueuedActivityPoints(
    sessionData.session.access_token,
    activityId,
    await nextPoints(locations),
  );
});

export async function flushQueuedActivityPoints(
  token: string,
  activityId: string,
  incoming: ActivityPoint[] = [],
) {
  const stored = await AsyncStorage.getItem(queueKey(activityId));
  const queued = stored ? (JSON.parse(stored) as ActivityPoint[]) : [];
  let remaining = [...queued, ...incoming]
    .map(sanitizePoint)
    .filter((point): point is ActivityPoint => point !== null)
    .slice(-10_000);
  await AsyncStorage.setItem(queueKey(activityId), JSON.stringify(remaining));
  try {
    while (remaining.length) {
      await appendActivityPoints(token, activityId, remaining.slice(0, 100));
      remaining = remaining.slice(100);
      await AsyncStorage.setItem(
        queueKey(activityId),
        JSON.stringify(remaining),
      );
    }
    await AsyncStorage.removeItem(queueKey(activityId));
    return true;
  } catch {
    // Keep unsent points locally. A later update or Finish will retry.
    return false;
  }
}

export async function requestActivityLocationPermissions() {
  if (!(await Location.hasServicesEnabledAsync()))
    return {
      foreground: false,
      background: false,
      reason: 'location_services_disabled' as const,
    };
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted)
    return {
      foreground: false,
      background: false,
      reason: 'foreground_denied' as const,
    };
  let backgroundGranted = false;
  try {
    backgroundGranted = (await Location.requestBackgroundPermissionsAsync())
      .granted;
  } catch {
    // Expo Go and some device policies do not expose background permission.
  }
  return {
    foreground: true,
    background: backgroundGranted,
    reason: backgroundGranted ? null : ('background_denied' as const),
  };
}

async function prepareTracking(activityId: string) {
  const previousActivityId = await SecureStore.getItemAsync(ACTIVITY_ID_KEY);
  await SecureStore.setItemAsync(ACTIVITY_ID_KEY, activityId);
  if (previousActivityId !== activityId)
    await SecureStore.setItemAsync(SEQUENCE_KEY, '0');
}

export async function captureForegroundLocation(
  token: string,
  activityId: string,
  location: Location.LocationObject,
) {
  await prepareTracking(activityId);
  return flushQueuedActivityPoints(
    token,
    activityId,
    await nextPoints([location]),
  );
}

export async function beginBackgroundTracking(activityId: string) {
  await prepareTracking(activityId);
  if (
    !(await Location.hasStartedLocationUpdatesAsync(ACTIVITY_LOCATION_TASK))
  ) {
    await Location.startLocationUpdatesAsync(ACTIVITY_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 5_000,
      distanceInterval: 5,
      deferredUpdatesDistance: 20,
      deferredUpdatesInterval: 15_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'กำลังบันทึกกิจกรรม',
        notificationBody: 'นับแคลกำลังติดตามระยะทางของคุณ',
      },
    });
  }
}

export async function pauseBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(ACTIVITY_LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(ACTIVITY_LOCATION_TASK);
}

export async function clearBackgroundTracking() {
  await pauseBackgroundTracking();
  await SecureStore.deleteItemAsync(ACTIVITY_ID_KEY);
  await SecureStore.deleteItemAsync(SEQUENCE_KEY);
}

export async function clearActivityPointQueue(activityId: string) {
  await AsyncStorage.removeItem(queueKey(activityId));
}
