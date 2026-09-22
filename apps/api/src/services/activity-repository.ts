import type { Env } from '../config/env.js';
import type { ActivityPointInput, ActivityType } from '../schemas/activity.js';
import { calculateActivity } from './activity-calculator.js';

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

export interface ActivityRepository {
  create(input: {
    userId: string;
    token: string;
    type: ActivityType;
  }): Promise<ActivityRecord>;
  current(input: {
    userId: string;
    token: string;
  }): Promise<ActivityRecord | null>;
  list(input: {
    userId: string;
    token: string;
    limit: number;
  }): Promise<ActivityRecord[]>;
  appendPoints(input: {
    userId: string;
    token: string;
    activityId: string;
    points: ActivityPointInput[];
  }): Promise<number>;
  setStatus(input: {
    userId: string;
    token: string;
    activityId: string;
    status: 'in_progress' | 'paused';
  }): Promise<ActivityRecord | null>;
  finish(input: {
    userId: string;
    token: string;
    activityId: string;
  }): Promise<ActivityRecord | null>;
}

export class ActivityRepositoryError extends Error {
  constructor(
    readonly status: number,
    readonly operation?: string,
  ) {
    super('Activity repository request failed');
  }
}

const numeric = (value: unknown) => Number(value ?? 0);
function mapActivity(row: Record<string, unknown>): ActivityRecord {
  return {
    id: String(row.id),
    activityType: row.activity_type as ActivityType,
    status: row.status as ActivityRecord['status'],
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at ?? row.started_at),
    endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
    elapsedSeconds: numeric(row.elapsed_seconds),
    movingSeconds: numeric(row.moving_seconds),
    distanceM: numeric(row.distance_m),
    elevationGainM: numeric(row.elevation_gain_m),
    averageSpeedMps:
      row.average_speed_mps == null ? null : numeric(row.average_speed_mps),
    averagePaceSecondsPerKm:
      row.average_pace_seconds_per_km == null
        ? null
        : numeric(row.average_pace_seconds_per_km),
    calories: numeric(row.calories),
    route: Array.isArray(row.route)
      ? [...row.route].sort((left, right) =>
          numeric((left as Record<string, unknown>).sequence) -
          numeric((right as Record<string, unknown>).sequence),
        ).map((point) => ({
          latitude: numeric((point as Record<string, unknown>).latitude),
          longitude: numeric((point as Record<string, unknown>).longitude),
        }))
      : undefined,
  };
}

export function createActivityRepository(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): ActivityRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    const unavailable = async () => {
      throw new ActivityRepositoryError(503);
    };
    return {
      create: unavailable,
      current: unavailable,
      list: unavailable,
      appendPoints: unavailable,
      setStatus: unavailable,
      finish: unavailable,
    };
  }
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const request = async <T>(
    path: string,
    token: string,
    init?: RequestInit,
  ): Promise<T> => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetchImpl(`${base}/${path}`, {
          ...init,
          headers: {
            apikey: env.SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...init?.headers,
          },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
          continue;
        }
        throw new ActivityRepositoryError(502, init?.method ?? 'GET');
      }
      if (response.status !== 429 && response.status < 500) break;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
    if (!response) throw new ActivityRepositoryError(502, init?.method ?? 'GET');
    if (!response.ok)
      throw new ActivityRepositoryError(response.status, init?.method ?? 'GET');
    if (response.status === 204) return undefined as T;
    const responseText = await response.text();
    if (!responseText) return undefined as T;
    return JSON.parse(responseText) as T;
  };
  const select =
    'id,activity_type,status,started_at,updated_at,ended_at,elapsed_seconds,moving_seconds,distance_m,elevation_gain_m,average_speed_mps,average_pace_seconds_per_km,calories,route:activity_points(sequence,latitude,longitude)';
  return {
    async create({ userId, token, type }) {
      const active = await this.current({ userId, token });
      if (active) return active;
      const rows = await request<Record<string, unknown>[]>(
        'activities',
        token,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ user_id: userId, activity_type: type }),
        },
      );
      if (!rows[0]) throw new ActivityRepositoryError(502);
      return mapActivity(rows[0]);
    },
    async current({ userId, token }) {
      const rows = await request<Record<string, unknown>[]>(
        `activities?select=${select}&user_id=eq.${encodeURIComponent(userId)}&status=in.(in_progress,paused)&order=started_at.desc&limit=1`,
        token,
      );
      return rows[0] ? mapActivity(rows[0]) : null;
    },
    async list({ userId, token, limit }) {
      const rows = await request<Record<string, unknown>[]>(
        `activities?select=${select}&user_id=eq.${encodeURIComponent(userId)}&status=eq.completed&order=started_at.desc&limit=${limit}`,
        token,
      );
      return rows.map(mapActivity);
    },
    async appendPoints({ userId, token, activityId, points }) {
      const active = await request<Record<string, unknown>[]>(
        `activities?select=id&id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}&status=in.(in_progress,paused)&limit=1`,
        token,
      );
      if (!active[0]) return 0;
      await request('activity_points?on_conflict=activity_id,sequence', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify(
          points.map((point) => ({
            ...point,
            activity_id: activityId,
            user_id: userId,
          })),
        ),
      });
      return points.length;
    },
    async setStatus({ userId, token, activityId, status }) {
      const current = await request<Record<string, unknown>[]>(
        `activities?select=status,elapsed_seconds,updated_at&id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}&status=in.(in_progress,paused)&limit=1`,
        token,
      );
      if (!current[0]) return null;
      const now = new Date();
      const elapsedSeconds =
        current[0].status === 'in_progress' && status === 'paused'
          ? numeric(current[0].elapsed_seconds) +
            Math.max(
              0,
              Math.round(
                (now.getTime() - Date.parse(String(current[0].updated_at))) /
                  1000,
              ),
            )
          : numeric(current[0].elapsed_seconds);
      const rows = await request<Record<string, unknown>[]>(
        `activities?id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}&status=in.(in_progress,paused)`,
        token,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            status,
            elapsed_seconds: elapsedSeconds,
            updated_at: now.toISOString(),
          }),
        },
      );
      return rows[0] ? mapActivity(rows[0]) : null;
    },
    async finish({ userId, token, activityId }) {
      const activities = await request<Record<string, unknown>[]>(
        `activities?select=${select}&id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}&status=in.(in_progress,paused)&limit=1`,
        token,
      );
      if (!activities[0]) return null;
      const finishedAt = new Date();
      const points = await request<Record<string, unknown>[]>(
        `activity_points?select=sequence,recorded_at,latitude,longitude,accuracy_m,altitude_m,speed_mps&activity_id=eq.${encodeURIComponent(activityId)}&order=sequence.asc`,
        token,
      );
      const weights = await request<Record<string, unknown>[]>(
        `body_measurements?select=weight_kg&user_id=eq.${encodeURIComponent(userId)}&order=recorded_at.desc&limit=1`,
        token,
      );
      const inputs: ActivityPointInput[] = points.map((point) => ({
        sequence: numeric(point.sequence),
        recorded_at: String(point.recorded_at),
        latitude: numeric(point.latitude),
        longitude: numeric(point.longitude),
        accuracy_m: point.accuracy_m == null ? null : numeric(point.accuracy_m),
        altitude_m: point.altitude_m == null ? null : numeric(point.altitude_m),
        speed_mps: point.speed_mps == null ? null : numeric(point.speed_mps),
      }));
      const summary = calculateActivity(
        activities[0]!.activity_type as ActivityType,
        inputs,
        weights[0] ? numeric(weights[0].weight_kg) : 70,
      );
      const trackedElapsedSeconds =
        numeric(activities[0].elapsed_seconds) +
        (activities[0].status === 'in_progress'
          ? Math.max(
              0,
              Math.round(
                (finishedAt.getTime() -
                  Date.parse(String(activities[0].updated_at))) /
                  1000,
              ),
            )
          : 0);
      const rows = await request<Record<string, unknown>[]>(
        `activities?id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}`,
        token,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            status: 'completed',
            ended_at: finishedAt.toISOString(),
            elapsed_seconds: Math.max(
              trackedElapsedSeconds,
              summary.elapsedSeconds,
            ),
            moving_seconds: summary.movingSeconds,
            distance_m: summary.distanceM,
            elevation_gain_m: summary.elevationGainM,
            average_speed_mps: summary.averageSpeedMps,
            average_pace_seconds_per_km: summary.averagePaceSecondsPerKm,
            calories: summary.calories,
            updated_at: finishedAt.toISOString(),
          }),
        },
      );
      return rows[0] ? mapActivity(rows[0]) : null;
    },
  };
}
