import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { WorkoutRepository } from '../src/services/workout-repository.js';

function fakeRepository(
  overrides: Partial<WorkoutRepository> = {},
): WorkoutRepository {
  return {
    async getActivePlan() {
      return null;
    },
    async getHistory() {
      return [];
    },
    async startSession() {
      return null;
    },
    async saveSet() {
      return null;
    },
    async finishSession() {
      return null;
    },
    async createDefaultPlan() {
      return '11111111-1111-4111-8111-111111111111';
    },
    async getInProgressSession() { return null; },
    ...overrides,
  };
}

const dependencies = (workoutRepository: WorkoutRepository) => ({
  verifyAccessToken: async () => ({
    id: 'verified-user',
    email: 'person@example.com',
  }),
  workoutRepository,
});

test('workout endpoints require authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/workouts/active' }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/workouts/history' }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/workouts/default-plan' }))
      .statusCode,
    401,
  );
  await app.close();
});

test('active workout returns a real empty state', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/workouts/active',
    headers: { authorization: 'Bearer token' },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { plan: null });
  await app.close();
});

test('workout reads derive user identity from the verified JWT', async () => {
  let receivedUserId = '';
  let receivedToken = '';
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async getHistory(input) {
          receivedUserId = input.userId;
          receivedToken = input.accessToken;
          return [];
        },
      }),
    ),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/workouts/history?limit=10&user_id=attacker',
    headers: { authorization: 'Bearer token' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(receivedUserId, 'verified-user');
  assert.equal(receivedToken, 'token');
  await app.close();
});

test('workout history validates its limit', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/workouts/history?limit=101',
    headers: { authorization: 'Bearer token' },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test('workout write endpoints require authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/workout-sessions',
        payload: { plan_day_id: null },
      })
    ).statusCode,
    401,
  );
  await app.close();
});

test('starting a workout derives ownership from JWT and validates the plan day', async () => {
  let receivedUserId = '';
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async startSession(input) {
          receivedUserId = input.userId;
          return {
            id: '22222222-2222-4222-8222-222222222222',
            planDayId: input.planDayId,
            startedAt: '2026-09-20T00:00:00.000Z',
            endedAt: null,
            status: 'in_progress',
            notes: null,
          };
        },
      }),
    ),
  });
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/workout-sessions',
    headers: { authorization: 'Bearer token' },
    payload: { plan_day_id: 'not-a-uuid', user_id: 'attacker' },
  });
  assert.equal(invalid.statusCode, 400);
  const response = await app.inject({
    method: 'POST',
    url: '/api/workout-sessions',
    headers: { authorization: 'Bearer token' },
    payload: { plan_day_id: null },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(receivedUserId, 'verified-user');
  await app.close();
});

test('default workout plan creation returns the RPC plan id', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/workouts/default-plan',
    headers: { authorization: 'Bearer token' },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().planId, '11111111-1111-4111-8111-111111111111');
  await app.close();
});

test('current workout returns saved sets for recovery', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository({
      async getInProgressSession({ userId }) {
        assert.equal(userId, 'verified-user');
        return { id: '11111111-1111-4111-8111-111111111111', planDayId: null,
          startedAt: '2026-09-20T00:00:00Z', endedAt: null, status: 'in_progress', notes: null,
          sets: [{ id: '22222222-2222-4222-8222-222222222222', sessionId: '11111111-1111-4111-8111-111111111111', exerciseId: '33333333-3333-4333-8333-333333333333', setNumber: 1, reps: 10, weightKg: 20, durationSeconds: null, completed: true }],
        };
      },
    })),
  });
  const response = await app.inject({ method: 'GET', url: '/api/workout-sessions/current', headers: { authorization: 'Bearer token' } });
  assert.equal(response.statusCode, 200); assert.equal(response.json().session.sets[0].reps, 10);
  await app.close();
});
