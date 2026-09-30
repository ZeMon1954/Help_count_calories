import type { Env } from '../config/env.js';

import type {
  MealType,
  RawActivity,
  RawFoodLog,
  RawMeasurement,
} from './weekly-report.js';

export interface WeeklyReportRepository {
  getRaw(input: {
    userId: string;
    accessToken: string;
    startUtc: string;
    endUtc: string;
  }): Promise<{
    foodLogs: RawFoodLog[];
    activities: RawActivity[];
    measurements: RawMeasurement[];
  }>;
}

export class WeeklyReportRepositoryError extends Error {
  constructor(readonly status: number) {
    super('Weekly report repository request failed');
  }
}

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function createWeeklyReportRepository(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): WeeklyReportRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return {
      async getRaw() {
        throw new WeeklyReportRepositoryError(503);
      },
    };
  }
  const baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const request = async (path: string, accessToken: string) => {
    let response: Response;
    try {
      response = await fetchImplementation(`${baseUrl}/${path}`, {
        headers: {
          apikey: env.SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WeeklyReportRepositoryError(502);
    }
    if (!response.ok) throw new WeeklyReportRepositoryError(response.status);
    return (await response.json()) as Record<string, unknown>[];
  };

  return {
    async getRaw({ userId, accessToken, startUtc, endUtc }) {
      const user = encodeURIComponent(userId);
      const start = encodeURIComponent(startUtc);
      const end = encodeURIComponent(endUtc);
      const [logs, activities, measurements] = await Promise.all([
        request(
          `food_logs?select=eaten_at,meal_type,items:food_log_items(food_name,calories)&user_id=eq.${user}&eaten_at=gte.${start}&eaten_at=lt.${end}&order=eaten_at.asc&limit=2000`,
          accessToken,
        ),
        request(
          `activities?select=ended_at,calories&user_id=eq.${user}&status=eq.completed&ended_at=gte.${start}&ended_at=lt.${end}&order=ended_at.asc&limit=2000`,
          accessToken,
        ),
        request(
          `body_measurements?select=weight_kg,recorded_at&user_id=eq.${user}&recorded_at=gte.${start}&recorded_at=lt.${end}&order=recorded_at.asc&limit=2000`,
          accessToken,
        ),
      ]);
      return {
        foodLogs: logs.map((row) => ({
          eatenAt: String(row.eaten_at),
          mealType: row.meal_type as MealType,
          items: Array.isArray(row.items)
            ? row.items.map((item) => ({
                name: String((item as Record<string, unknown>).food_name),
                calories: numeric((item as Record<string, unknown>).calories),
              }))
            : [],
        })),
        activities: activities.map((row) => ({
          endedAt: String(row.ended_at),
          calories: numeric(row.calories),
        })),
        measurements: measurements.map((row) => ({
          weightKg: numeric(row.weight_kg),
          recordedAt: String(row.recorded_at),
        })),
      };
    },
  };
}
