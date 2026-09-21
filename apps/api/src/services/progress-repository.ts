import type { Env } from '../config/env.js';

export interface ProgressSnapshot {
  weightHistory: { id: string; weightKg: number; recordedAt: string }[];
  calorieAdherence: {
    target: number | null;
    daysLogged: number;
    daysWithinTarget: number;
    percentage: number | null;
  };
}

export interface ProgressRepository {
  getProgress(input: {
    userId: string;
    accessToken: string;
    startUtc: string;
  }): Promise<ProgressSnapshot>;
  createMeasurement(input: {
    userId: string;
    accessToken: string;
    weightKg: number;
    waistCm: number | null;
    recordedAt: string;
  }): Promise<{ id: string; weightKg: number; recordedAt: string }>;
}

export class ProgressRepositoryError extends Error {
  constructor(readonly status: number) {
    super('Progress repository request failed');
  }
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createProgressRepository(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): ProgressRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    const unavailable = async () => {
      throw new ProgressRepositoryError(503);
    };
    return { getProgress: unavailable, createMeasurement: unavailable };
  }
  const baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const request = async <T>(
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImplementation(`${baseUrl}/${path}`, {
        ...init,
        headers: {
          apikey: env.SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...init?.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ProgressRepositoryError(502);
    }
    if (!response.ok) throw new ProgressRepositoryError(response.status);
    return (await response.json()) as T;
  };

  return {
    async getProgress({ userId, accessToken, startUtc }) {
      const user = encodeURIComponent(userId);
      const start = encodeURIComponent(startUtc);
      const [measurements, goals, logs] = await Promise.all([
        request<Record<string, unknown>[]>(
          `body_measurements?select=id,weight_kg,recorded_at&user_id=eq.${user}&recorded_at=gte.${start}&order=recorded_at.asc`,
          accessToken,
        ),
        request<Record<string, unknown>[]>(
          `user_goals?select=calorie_target&user_id=eq.${user}&ended_at=is.null&order=started_at.desc&limit=1`,
          accessToken,
        ),
        request<Record<string, unknown>[]>(
          `food_logs?select=eaten_at,items:food_log_items(calories)&user_id=eq.${user}&eaten_at=gte.${start}&order=eaten_at.asc`,
          accessToken,
        ),
      ]);
      const target = goals[0]?.calorie_target
        ? numeric(goals[0].calorie_target)
        : null;
      const daily = new Map<string, number>();
      for (const log of logs) {
        const date = String(log.eaten_at).slice(0, 10);
        const calories = Array.isArray(log.items)
          ? log.items.reduce(
              (sum, item) =>
                sum + numeric((item as Record<string, unknown>).calories),
              0,
            )
          : 0;
        daily.set(date, (daily.get(date) ?? 0) + calories);
      }
      const within = target
        ? [...daily.values()].filter(
            (calories) => calories >= target * 0.9 && calories <= target * 1.1,
          ).length
        : 0;
      return {
        weightHistory: measurements.map((row) => ({
          id: String(row.id),
          weightKg: numeric(row.weight_kg),
          recordedAt: String(row.recorded_at),
        })),
        calorieAdherence: {
          target,
          daysLogged: daily.size,
          daysWithinTarget: within,
          percentage:
            target && daily.size ? Math.round((within / daily.size) * 100) : null,
        },
      };
    },

    async createMeasurement(input) {
      const rows = await request<Record<string, unknown>[]>(
        'body_measurements',
        input.accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            user_id: input.userId,
            weight_kg: input.weightKg,
            waist_cm: input.waistCm,
            recorded_at: input.recordedAt,
          }),
        },
      );
      const row = rows[0];
      if (!row) throw new ProgressRepositoryError(502);
      return {
        id: String(row.id),
        weightKg: numeric(row.weight_kg),
        recordedAt: String(row.recorded_at),
      };
    },
  };
}
