import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { withTokenCache } from '../src/plugins/auth.js';
import type { ProfileRepository } from '../src/services/profile-repository.js';
import type { WeeklyReportRepository } from '../src/services/weekly-report-repository.js';
import type { WeightPlanRepository } from '../src/services/weight-plan-repository.js';

const identity = { id: 'user-1', email: null };

test('token cache verifies once per token within the ttl', async () => {
  let calls = 0;
  let clock = 1_000;
  const verify = withTokenCache(
    async (token) => {
      calls += 1;
      return token === 'good' ? identity : null;
    },
    { ttlMs: 30_000, now: () => clock },
  );
  assert.deepEqual(await verify('good'), identity);
  assert.deepEqual(await verify('good'), identity);
  assert.equal(calls, 1);
  clock += 30_001;
  assert.deepEqual(await verify('good'), identity);
  assert.equal(calls, 2);
});

test('token cache never caches failures and shares in-flight lookups', async () => {
  let calls = 0;
  const verify = withTokenCache(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return null;
  });
  assert.equal(await verify('bad'), null);
  assert.equal(await verify('bad'), null);
  assert.equal(calls, 2);

  calls = 0;
  const slow = withTokenCache(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return identity;
  });
  await Promise.all([slow('t'), slow('t'), slow('t')]);
  assert.equal(calls, 1);
});

test('token cache stays within its size limit', async () => {
  let calls = 0;
  const verify = withTokenCache(
    async () => {
      calls += 1;
      return identity;
    },
    { maxEntries: 2 },
  );
  await verify('a');
  await verify('b');
  await verify('c');
  await verify('a');
  assert.equal(calls, 4);
});

const plan = {
  sex: 'male' as const,
  targetWeightKg: 75,
  startWeightKg: 80,
  pace: 'normal' as const,
};

function profile(weight: number | null = 80): ProfileRepository {
  const snapshot = async () => ({
    profile: {
      displayName: 'Test',
      birthDate: '1996-01-01',
      heightCm: 170,
      activityLevel: 'lightly_active' as const,
      onboardingCompleted: true,
    },
    currentGoal: null,
    latestMeasurement: weight
      ? { weightKg: weight, recordedAt: '2026-09-30T00:00:00.000Z' }
      : null,
    workoutPreferences: null,
  });
  return { getProfile: snapshot, completeOnboarding: snapshot, updateProfile: snapshot };
}

const planRepository = (value: typeof plan | null): WeightPlanRepository => ({
  async get() {
    return value;
  },
  async save() {
    throw new Error('unused');
  },
});

function reports(counter: { raw: number }): WeeklyReportRepository {
  return {
    async getRaw() {
      counter.raw += 1;
      return {
        foodLogs: [
          {
            eatenAt: '2026-09-29T12:00:00.000Z',
            mealType: 'lunch' as const,
            items: [{ name: 'ข้าวมันไก่', calories: 1900 }],
          },
          {
            eatenAt: '2026-09-30T05:00:00.000Z',
            mealType: 'breakfast' as const,
            items: [{ name: 'ไข่ต้ม', calories: 300 }],
          },
        ],
        activities: [],
        measurements: [
          { id: 'm1', weightKg: 80, recordedAt: '2026-09-28T01:00:00.000Z' },
          { id: 'm2', weightKg: 79.6, recordedAt: '2026-09-30T01:00:00.000Z' },
        ],
      };
    },
  };
}

const headers = { authorization: 'Bearer token' };
const deps = (
  planValue: typeof plan | null,
  counter = { raw: 0 },
  weight: number | null = 80,
) => ({
  verifyAccessToken: async () => identity,
  profileRepository: profile(weight),
  weightPlanRepository: planRepository(planValue),
  weeklyReportRepository: reports(counter),
});

test('stats endpoint requires auth and validates the query', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(plan));
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/stats?date=2026-09-30' })).statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/stats?date=nope', headers })).statusCode,
    400,
  );
  await app.close();
});

test('stats returns plan, weekly table and weights from a single data read', async () => {
  const counter = { raw: 0 };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(plan, counter));
  const response = await app.inject({
    method: 'GET',
    url: '/api/stats?date=2026-09-30&weeks=2',
    headers,
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(counter.raw, 1);
  assert.equal(body.summary.targetDeficit, 550);
  assert.equal(body.summary.today.consumed, 300);
  assert.equal(body.weekly.hasPlan, true);
  assert.equal(body.weekly.weeks.length, 2);
  assert.equal(body.weekly.weeks[0].days[1].meals[0].name, 'ข้าวมันไก่');
  assert.deepEqual(
    body.weightHistory.map((row: { id: string }) => row.id),
    ['m1', 'm2'],
  );
  assert.equal(body.currentWeightKg, 80);
  await app.close();
});

test('stats without a plan still returns the weekly table', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(null));
  const response = await app.inject({
    method: 'GET',
    url: '/api/stats?date=2026-09-30',
    headers,
  });
  const body = response.json();
  assert.equal(body.plan, null);
  assert.equal(body.summary, null);
  assert.equal(body.weekly.hasPlan, false);
  assert.equal(body.weekly.weeks[0].days[1].status, 'no_plan');
  await app.close();
});

test('large JSON responses are gzip compressed when the client accepts it', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(plan));
  const response = await app.inject({
    method: 'GET',
    url: '/api/stats?date=2026-09-30&weeks=8',
    headers: { ...headers, 'accept-encoding': 'gzip' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-encoding'], 'gzip');
  const body = JSON.parse(gunzipSync(response.rawPayload).toString('utf8'));
  assert.equal(body.weekly.weeks.length, 8);
  const plain = await app.inject({
    method: 'GET',
    url: '/api/stats?date=2026-09-30&weeks=8',
    headers,
  });
  assert.equal(plain.headers['content-encoding'], undefined);
  await app.close();
});
