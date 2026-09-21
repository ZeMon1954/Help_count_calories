import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { ProgressRepository } from '../src/services/progress-repository.js';

function fakeRepository(overrides: Partial<ProgressRepository> = {}): ProgressRepository {
  return {
    async getProgress() {
      return {
        weightHistory: [],
        calorieAdherence: { target: null, daysLogged: 0, daysWithinTarget: 0, percentage: null },
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
