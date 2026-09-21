import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as Location from 'expo-location';

import { appendActivityPoints, type ActivityPoint } from './api/activity';

export const ACTIVITY_LOCATION_TASK = 'fitness-foreground-location-web';
const queueKey = (id: string) => `gps-queue:${id}`;
const sequenceKey = (id: string) => `gps-sequence:${id}`;

function pointFromLocation(
  location: Location.LocationObject,
  sequence: number,
): ActivityPoint {
  return {
    sequence,
    recorded_at: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy_m: location.coords.accuracy,
    altitude_m: location.coords.altitude,
    speed_mps:
      location.coords.speed !== null && location.coords.speed >= 0
        ? location.coords.speed
        : null,
  };
}

export async function flushQueuedActivityPoints(
  token: string,
  activityId: string,
  incoming: ActivityPoint[] = [],
) {
  const stored = await AsyncStorage.getItem(queueKey(activityId));
  let points = [
    ...(stored ? (JSON.parse(stored) as ActivityPoint[]) : []),
    ...incoming,
  ].slice(-10_000);
  await AsyncStorage.setItem(queueKey(activityId), JSON.stringify(points));
  try {
    while (points.length) {
      await appendActivityPoints(token, activityId, points.slice(0, 100));
      points = points.slice(100);
      await AsyncStorage.setItem(queueKey(activityId), JSON.stringify(points));
    }
    await AsyncStorage.removeItem(queueKey(activityId));
    return true;
  } catch {
    return false;
  }
}

export async function requestActivityLocationPermissions() {
  if (!globalThis.isSecureContext)
    return {
      foreground: false,
      background: false,
      reason: 'insecure_context' as const,
    };
  if (!('geolocation' in navigator))
    return {
      foreground: false,
      background: false,
      reason: 'location_services_disabled' as const,
    };
  try {
    await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15_000,
      }),
    );
    return {
      foreground: true,
      background: false,
      reason: 'background_unavailable_web' as const,
    };
  } catch {
    return {
      foreground: false,
      background: false,
      reason: 'foreground_denied' as const,
    };
  }
}

export async function captureForegroundLocation(
  token: string,
  activityId: string,
  location: Location.LocationObject,
) {
  const sequence =
    Number(await AsyncStorage.getItem(sequenceKey(activityId))) || 0;
  await AsyncStorage.setItem(sequenceKey(activityId), String(sequence + 1));
  return flushQueuedActivityPoints(token, activityId, [
    pointFromLocation(location, sequence),
  ]);
}

export async function beginBackgroundTracking(activityId: string) {
  void activityId;
}
export async function pauseBackgroundTracking() {}
export async function clearBackgroundTracking() {}
export async function clearActivityPointQueue(activityId: string) {
  await Promise.all([
    AsyncStorage.removeItem(queueKey(activityId)),
    AsyncStorage.removeItem(sequenceKey(activityId)),
  ]);
}
