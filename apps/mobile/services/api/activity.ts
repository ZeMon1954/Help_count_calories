import { apiRequest } from './client';

export type ActivityType = 'walk' | 'run' | 'cycle';
export interface ActivityRecord {
  id: string;
  activityType: ActivityType;
  status: 'in_progress' | 'paused' | 'completed' | 'discarded';
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceM: number;
  elevationGainM: number;
  averageSpeedMps: number | null;
  averagePaceSecondsPerKm: number | null;
  calories: number;
  route?: { latitude: number; longitude: number }[];
}
export interface ActivityPoint {
  sequence: number;
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  speed_mps: number | null;
}
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});
export async function startActivity(
  token: string,
  activity_type: ActivityType,
) {
  return (
    await apiRequest<ActivityRecord>('activities', {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ activity_type }),
    })
  ).data;
}
export async function fetchCurrentActivity(token: string) {
  return (
    await apiRequest<{ activity: ActivityRecord | null }>(
      'activities/current',
      { headers: headers(token) },
    )
  ).data.activity;
}
export async function fetchActivities(token: string, limit = 20) {
  return (
    await apiRequest<{ items: ActivityRecord[] }>(`activities?limit=${limit}`, {
      headers: headers(token),
    })
  ).data.items;
}
export async function appendActivityPoints(
  token: string,
  id: string,
  points: ActivityPoint[],
) {
  return (
    await apiRequest<{ accepted: number }>(`activities/${id}/points`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ points }),
    })
  ).data;
}
export async function setActivityStatus(
  token: string,
  id: string,
  status: 'in_progress' | 'paused',
) {
  return (
    await apiRequest<ActivityRecord>(`activities/${id}/status`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({ status }),
    })
  ).data;
}
export async function finishActivity(token: string, id: string) {
  return (
    await apiRequest<ActivityRecord>(`activities/${id}/finish`, {
      method: 'POST',
      headers: headers(token),
      body: '{}',
    })
  ).data;
}
