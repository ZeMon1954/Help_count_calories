import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { ActivityRepository } from '../src/services/activity-repository.js';
import { calculateActivity } from '../src/services/activity-calculator.js';

const record = {
  id: '11111111-1111-4111-8111-111111111111',
  activityType: 'run' as const,
  status: 'in_progress' as const,
  startedAt: '2026-09-21T00:00:00.000Z',
  endedAt: null,
  elapsedSeconds: 0,
  movingSeconds: 0,
  distanceM: 0,
  elevationGainM: 0,
  averageSpeedMps: null,
  averagePaceSecondsPerKm: null,
  calories: 0,
};
function repository(): ActivityRepository {
  return {
    create: async () => record,
    current: async () => null,
    list: async () => [],
    appendPoints: async ({ points }) => points.length,
    setStatus: async ({ status }) => ({ ...record, status }),
    finish: async () => ({
      ...record,
      status: 'completed',
      endedAt: '2026-09-21T00:10:00.000Z',
    }),
  };
}
const dependencies = (activityRepository = repository()) => ({
  verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
  activityRepository,
});

test('activity endpoints require authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies());
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/activities' })).statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/activities' })).statusCode,
    401,
  );
  await app.close();
});

test('production CORS preflight allows activity status PATCH', async () => {
  const app = await buildApp(
    loadEnv({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://help-count-calories-api.vercel.app',
    }),
    dependencies(),
  );
  const response = await app.inject({
    method: 'OPTIONS',
    url: `/api/activities/${record.id}/status`,
    headers: {
      origin: 'https://help-count-calories-api.vercel.app',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  assert.equal(response.statusCode, 204);
  assert.match(response.headers['access-control-allow-methods'] ?? '', /PATCH/);
  assert.equal(
    response.headers['access-control-allow-origin'],
    'https://help-count-calories-api.vercel.app',
  );
  await app.close();
});

test('activity identity comes from the verified token', async () => {
  let userId = '';
  const fake = repository();
  fake.create = async (input) => {
    userId = input.userId;
    return record;
  };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies(fake));
  const response = await app.inject({
    method: 'POST',
    url: '/api/activities',
    headers: { authorization: 'Bearer token' },
    payload: { activity_type: 'run' },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(userId, 'verified-user');
  await app.close();
});

test('activity points are validated in bounded batches', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies());
  const response = await app.inject({
    method: 'POST',
    url: `/api/activities/${record.id}/points`,
    headers: { authorization: 'Bearer token' },
    payload: {
      points: [
        {
          sequence: 0,
          recorded_at: 'bad',
          latitude: 100,
          longitude: 0,
          accuracy_m: 5,
          altitude_m: null,
          speed_mps: null,
        },
      ],
    },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test('calculator measures distance and rejects impossible GPS jumps', () => {
  const summary = calculateActivity(
    'run',
    [
      {
        sequence: 0,
        recorded_at: '2026-09-21T00:00:00.000Z',
        latitude: 13.7563,
        longitude: 100.5018,
        accuracy_m: 5,
        altitude_m: 10,
        speed_mps: null,
      },
      {
        sequence: 1,
        recorded_at: '2026-09-21T00:01:00.000Z',
        latitude: 13.7613,
        longitude: 100.5018,
        accuracy_m: 5,
        altitude_m: 12,
        speed_mps: null,
      },
      {
        sequence: 2,
        recorded_at: '2026-09-21T00:01:01.000Z',
        latitude: 14.5,
        longitude: 101.5,
        accuracy_m: 5,
        altitude_m: 500,
        speed_mps: null,
      },
    ],
    70,
  );
  assert.ok(summary.distanceM > 500 && summary.distanceM < 600);
  assert.equal(summary.movingSeconds, 60);
  assert.equal(summary.accepted.length, 2);
  assert.ok(summary.calories > 0);
});

test('calculator resumes after a long paused gap without adding a jump', () => {
  const summary = calculateActivity('run', [
    { sequence: 0, recorded_at: '2026-09-21T00:00:00.000Z', latitude: 13.7563, longitude: 100.5018, accuracy_m: 5, altitude_m: 10, speed_mps: null },
    { sequence: 1, recorded_at: '2026-09-21T00:00:30.000Z', latitude: 13.7573, longitude: 100.5018, accuracy_m: 5, altitude_m: 10, speed_mps: null },
    { sequence: 2, recorded_at: '2026-09-21T00:10:00.000Z', latitude: 13.7583, longitude: 100.5018, accuracy_m: 5, altitude_m: 10, speed_mps: null },
    { sequence: 3, recorded_at: '2026-09-21T00:10:30.000Z', latitude: 13.7593, longitude: 100.5018, accuracy_m: 5, altitude_m: 10, speed_mps: null },
  ], 70);
  assert.equal(summary.accepted.length, 4);
  assert.equal(summary.movingSeconds, 60);
  assert.ok(summary.distanceM > 200 && summary.distanceM < 230);
});
