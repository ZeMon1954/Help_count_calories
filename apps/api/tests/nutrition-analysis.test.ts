import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { calculateNutritionTargets } from '../src/services/nutrition-analysis-service.js';

test('calculates deterministic muscle-gain targets with Mifflin-St Jeor', () => {
  const result = calculateNutritionTargets({
    sex: 'male', age: 30, weight_kg: 70, height_cm: 175,
    activity_level: 'moderately_active', goal: 'build_muscle',
  });
  assert.equal(result.bmr, 1649);
  assert.equal(result.tdee, 2556);
  assert.equal(result.calories, 2760);
  assert.equal(result.protein_g, 140);
  assert.equal(result.fat_g, 56);
  assert.equal(result.carbs_g, 424);
  assert.equal(result.ai_generated, false);
});

test('nutrition analysis endpoint requires auth and validates body', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
  });
  assert.equal((await app.inject({ method: 'POST', url: '/api/nutrition/analyze' })).statusCode, 401);
  assert.equal((await app.inject({
    method: 'POST', url: '/api/nutrition/analyze',
    headers: { authorization: 'Bearer token' }, payload: { age: 5 },
  })).statusCode, 400);
  await app.close();
});

test('nutrition analysis endpoint returns calculated targets', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
    nutritionAnalysisService: { async analyze(input) { return calculateNutritionTargets(input); } },
  });
  const response = await app.inject({
    method: 'POST', url: '/api/nutrition/analyze',
    headers: { authorization: 'Bearer token' },
    payload: { sex: 'male', age: 30, weight_kg: 70, height_cm: 175, activity_level: 'moderately_active', goal: 'build_muscle' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().calories, 2760);
  await app.close();
});

test('respects the calorie safety floor during fat loss', () => {
  const result = calculateNutritionTargets({
    sex: 'female', age: 80, weight_kg: 30, height_cm: 140,
    activity_level: 'sedentary', goal: 'lose_fat',
  });
  assert.equal(result.calories, 1200);
  assert.ok(result.protein_g > 0);
  assert.ok(result.carbs_g >= 0);
});
