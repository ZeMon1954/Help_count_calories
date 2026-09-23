import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import {
  createProgressRepository,
  type ProgressRepository,
} from '../src/services/progress-repository.js';

function fakeRepository(overrides: Partial<ProgressRepository> = {}): ProgressRepository {
  return {
    async getProgress() {
      return {
        weightHistory: [],
        calorieAdherence: { target: null, daysLogged: 0, daysWithinTarget: 0, percentage: null },
        calorieBalance: {
          totalConsumed: 0,
          totalTarget: null,
          difference: null,
          averageConsumed: null,
          exerciseCalories: 0,
          daysTracked: 0,
          daily: [],
        },
      };
    },
    async createMeasurement({ weightKg, recordedAt }) {
      return { id: '11111111-1111-4111-8111-111111111111', weightKg, recordedAt };
    },
    ...overrides,
  };
}

const dependencies = (progressRepository: ProgressRepository) => ({
  verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
  progressRepository,
});

test('progress endpoints require authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies(fakeRepository()));
  assert.equal((await app.inject({ method: 'GET', url: '/api/progress?days=30' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/measurements' })).statusCode, 401);
  await app.close();
});

test('progress range and measurement values are validated', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies(fakeRepository()));
  const headers = { authorization: 'Bearer token' };
  assert.equal((await app.inject({ method: 'GET', url: '/api/progress?days=8', headers })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/measurements', headers, payload: { weight_kg: -1 } })).statusCode, 400);
  await app.close();
});

test('measurement ownership is derived from the verified JWT', async () => {
  let receivedUserId = '';
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies(fakeRepository({
    async createMeasurement(input) {
      receivedUserId = input.userId;
      return { id: '11111111-1111-4111-8111-111111111111', weightKg: input.weightKg, recordedAt: input.recordedAt };
    },
  })));
  const response = await app.inject({
    method: 'POST',
    url: '/api/measurements',
    headers: { authorization: 'Bearer token' },
    payload: { weight_kg: 70.5, waist_cm: null },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(receivedUserId, 'verified-user');
  await app.close();
});

test('progress aggregates stored food and exercise by the user local date', async () => {
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    let body: unknown[] = [];
    if (url.includes('/user_goals?')) {
      body = [{ calorie_target: 2000 }];
    } else if (url.includes('/food_logs?')) {
      body = [
        { eaten_at: '2026-09-21T20:00:00.000Z', items: [{ calories: 1800 }, { calories: 100 }] },
        { eaten_at: '2026-09-22T17:30:00.000Z', items: [{ calories: 2200 }] },
      ];
    } else if (url.includes('/activities?')) {
      body = [{ ended_at: '2026-09-22T01:00:00.000Z', calories: 300 }];
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const repository = createProgressRepository(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
    }),
    fakeFetch,
  );

  const result = await repository.getProgress({
    userId: 'verified-user',
    accessToken: 'token',
    startUtc: '2026-09-21T17:00:00.000Z',
    endUtc: '2026-09-24T17:00:00.000Z',
    timezoneOffsetMinutes: 420,
  });

  assert.equal(result.calorieBalance.totalConsumed, 4100);
  assert.equal(result.calorieBalance.totalTarget, 4000);
  assert.equal(result.calorieBalance.difference, 100);
  assert.equal(result.calorieBalance.averageConsumed, 2050);
  assert.equal(result.calorieBalance.exerciseCalories, 300);
  assert.deepEqual(
    result.calorieBalance.daily.map((day) => [day.date, day.difference]),
    [
      ['2026-09-22', -100],
      ['2026-09-23', 200],
    ],
  );
});
