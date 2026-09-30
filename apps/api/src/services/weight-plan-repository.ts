import type { Env } from '../config/env.js';

import type { Pace, Sex, WeightPlan } from './weight-plan-calculator.js';

export interface WeightPlanRepository {
  get(input: { userId: string; accessToken: string }): Promise<WeightPlan | null>;
  save(input: {
    userId: string;
    accessToken: string;
    sex: Sex;
    targetWeightKg: number;
    pace: Pace;
    startWeightKg: number;
  }): Promise<WeightPlan>;
}

export class WeightPlanRepositoryError extends Error {
  constructor(readonly status: number) {
    super('Weight plan repository request failed');
  }
}

function toPlan(row: Record<string, unknown>): WeightPlan {
  return {
    sex: row.sex as Sex,
    targetWeightKg: Number(row.target_weight_kg),
    startWeightKg: Number(row.start_weight_kg),
    pace: row.pace as Pace,
  };
}

export function createWeightPlanRepository(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): WeightPlanRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    const unavailable = async () => {
      throw new WeightPlanRepositoryError(503);
    };
    return { get: unavailable, save: unavailable };
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
      throw new WeightPlanRepositoryError(502);
    }
    if (!response.ok) throw new WeightPlanRepositoryError(response.status);
    return (await response.json()) as T;
  };

  return {
    async get({ userId, accessToken }) {
      const rows = await request<Record<string, unknown>[]>(
        `user_weight_plans?select=sex,target_weight_kg,start_weight_kg,pace&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        accessToken,
      );
      return rows[0] ? toPlan(rows[0]) : null;
    },
    async save(input) {
      const rows = await request<Record<string, unknown>[]>(
        'user_weight_plans?on_conflict=user_id',
        input.accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify({
            user_id: input.userId,
            sex: input.sex,
            target_weight_kg: input.targetWeightKg,
            start_weight_kg: input.startWeightKg,
            pace: input.pace,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (!rows[0]) throw new WeightPlanRepositoryError(502);
      return toPlan(rows[0]);
    },
  };
}
