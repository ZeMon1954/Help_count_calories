import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { SettingsRepository } from '../src/services/settings-repository.js';

const snapshot = {
  units: 'metric' as const,
  targets: { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 60 },
  reminders: [],
};

function repository(overrides: Partial<SettingsRepository> = {}): SettingsRepository {
  return {
    async get() { return snapshot; }, async setUnits() {}, async setTargets() {},
    async createReminder(_userId, _token, input) { return { id: '11111111-1111-4111-8111-111111111111', ...input }; },
    async updateReminder() { return null; }, async deleteReminder() { return false; }, ...overrides,
  };
}

const deps = (settingsRepository: SettingsRepository) => ({
  settingsRepository,
  verifyAccessToken: async () => ({ id: 'verified-user', email: 'person@example.com' }),
});

test('settings endpoints require authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(repository()));
  assert.equal((await app.inject({ method: 'GET', url: '/api/settings' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/settings/units' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/reminders' })).statusCode, 401);
  await app.close();
});

test('settings reads and nutrition target writes use verified identity', async () => {
  let userId = ''; let receivedTargets = snapshot.targets;
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(repository({
    async get(id) { userId = id; return snapshot; },
    async setTargets(_token, targets) { receivedTargets = targets; },
  })));
  const read = await app.inject({ method: 'GET', url: '/api/settings', headers: { authorization: 'Bearer valid' } });
  assert.equal(read.statusCode, 200); assert.equal(userId, 'verified-user');
  const write = await app.inject({ method: 'PUT', url: '/api/settings/nutrition-targets', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, payload: { calories: 2100, protein_g: 150, carbs_g: 230, fat_g: 65 } });
  assert.equal(write.statusCode, 200); assert.equal(receivedTargets.calories, 2100);
  await app.close();
});

test('invalid targets and reminders return 400', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), deps(repository()));
  const headers = { authorization: 'Bearer valid', 'content-type': 'application/json' };
  assert.equal((await app.inject({ method: 'PUT', url: '/api/settings/nutrition-targets', headers, payload: { calories: 100, protein_g: -1, carbs_g: 0, fat_g: 0 } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/reminders', headers, payload: { type: 'meal', title: '', time: '25:00', days_of_week: [], enabled: true } })).statusCode, 400);
  await app.close();
});
