import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { ProfileRepository } from '../src/services/profile-repository.js';
import type { ProgressRepository } from '../src/services/progress-repository.js';
import {
  ageFromBirthDate,
  calculateBmr,
  calculateWeightPlan,
  type WeightPlan,
} from '../src/services/weight-plan-calculator.js';
import type { WeightPlanRepository } from '../src/services/weight-plan-repository.js';

const plan: WeightPlan = {
  sex: 'male',
  targetWeightKg: 75,
  startWeightKg: 80,
  pace: 'normal',
};

const base = {
  plan,
  birthDate: '1996-01-01',
  heightCm: 170,
  activityLevel: 'lightly_active' as const,
  currentWeightKg: 80,
  today: '2026-09-30',
  daily: [],
  weightHistory: [],
};

test('age and BMR use the Mifflin-St Jeor formula', () => {
  assert.equal(ageFromBirthDate('1996-10-01', '2026-09-30'), 29);
  assert.equal(ageFromBirthDate('1996-09-30', '2026-09-30'), 30);
  assert.equal(
    calculateBmr({ sex: 'male', weightKg: 80, heightCm: 170, age: 30 }),
    1718,
  );
  assert.equal(
    calculateBmr({ sex: 'female', weightKg: 60, heightCm: 160, age: 30 }),
    1289,
  );
});

test('plan is not produced for missing data or minors', () => {
  assert.equal(calculateWeightPlan({ ...base, birthDate: null }), null);
  assert.equal(calculateWeightPlan({ ...base, heightCm: null }), null);
  assert.equal(calculateWeightPlan({ ...base, currentWeightKg: null }), null);
  assert.equal(calculateWeightPlan({ ...base, birthDate: '2015-01-01' }), null);
});

test('daily budget is burn minus the chosen deficit, with exercise added', () => {
  const summary = calculateWeightPlan({
    ...base,
    daily: [{ date: '2026-09-30', consumed: 1500, exerciseCalories: 200 }],
  })!;
  assert.equal(summary.bmr, 1718);
  assert.equal(summary.dailyBurn, 2362);
  assert.equal(summary.targetDeficit, 550);
  assert.deepEqual(summary.zone, { minDeficit: 400, maxDeficit: 644 });
  assert.equal(summary.safetyAdjusted, false);
  assert.equal(summary.today.burn, 2562);
  assert.equal(summary.today.budget, 2012);
  assert.equal(summary.today.remaining, 512);
  assert.equal(summary.today.status, 'within');
});

test('status reflects how far consumption is over budget', () => {
  const at = (consumed: number) =>
    calculateWeightPlan({
      ...base,
      daily: [{ date: '2026-09-30', consumed, exerciseCalories: 0 }],
    })!.today.status;
  assert.equal(at(1812), 'within');
  assert.equal(at(1900), 'slightly_over');
  assert.equal(at(2100), 'over');
});

test('deficit is capped so intake never drops below BMR', () => {
  const summary = calculateWeightPlan({
    ...base,
    plan: { ...plan, pace: 'fast' },
  })!;
  assert.equal(summary.targetDeficit, 644);
  assert.equal(summary.safetyAdjusted, true);
  assert.ok(summary.today.budget >= summary.bmr);
});

test('projection accumulates deficit only over days with a food log', () => {
  const summary = calculateWeightPlan({
    ...base,
    daily: [
      { date: '2026-09-28', consumed: 1812, exerciseCalories: 0 },
      { date: '2026-09-29', consumed: 0, exerciseCalories: 500 },
      { date: '2026-09-30', consumed: 1812, exerciseCalories: 0 },
    ],
    weightHistory: [
      { weightKg: 80, recordedAt: '2026-09-27T03:00:00.000Z' },
    ],
  })!;
  assert.equal(summary.projection.daysTracked, 2);
  assert.equal(summary.projection.estimatedLossKg, 0.14);
  assert.equal(summary.projection.series[1]!.estimatedKg, 79.86);
  assert.equal(summary.projection.series[1]!.actualKg, 80);
});

test('goal progress and estimated date follow remaining weight', () => {
  const summary = calculateWeightPlan({ ...base, currentWeightKg: 78 })!;
  assert.equal(summary.goal.progressPercent, 40);
  assert.equal(summary.goal.remainingKg, 3);
  assert.ok(summary.goal.estimatedDate! > '2026-09-30');
  const reached = calculateWeightPlan({ ...base, currentWeightKg: 74.5 })!;
  assert.equal(reached.goal.progressPercent, 100);
  assert.equal(reached.goal.estimatedDate, null);
});

const emptyProgress: ProgressRepository = {
  async getProgress() {
    return {
      weightHistory: [],
      calorieAdherence: {
        target: null,
        daysLogged: 0,
        daysWithinTarget: 0,
        percentage: null,
      },
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
  async createMeasurement() {
    throw new Error('unused');
  },
};

const profileWith = (weight: number | null): ProfileRepository => {
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
  return {
    getProfile: snapshot,
    completeOnboarding: snapshot,
    updateProfile: snapshot,
  };
};

function fakePlanRepository(
  initial: WeightPlan | null,
  onSave?: (start: number) => void,
): WeightPlanRepository {
  let stored = initial;
  return {
    async get() {
      return stored;
    },
    async save(input) {
      onSave?.(input.startWeightKg);
      stored = {
        sex: input.sex,
        targetWeightKg: input.targetWeightKg,
        startWeightKg: input.startWeightKg,
        pace: input.pace,
      };
      return stored;
    },
  };
}

const dependencies = (
  weightPlanRepository: WeightPlanRepository,
  weight: number | null = 80,
) => ({
  verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
  progressRepository: emptyProgress,
  profileRepository: profileWith(weight),
  weightPlanRepository,
});

const headers = { authorization: 'Bearer token' };

test('weight plan endpoints require authentication and valid input', async () => {
  const app = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(fakePlanRepository(null)),
  );
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/weight-plan?date=2026-09-30' }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/weight-plan?date=bad', headers }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/weight-plan',
        headers,
        payload: { sex: 'male', target_weight_kg: 10, pace: 'normal' },
      })
    ).statusCode,
    400,
  );
  await app.close();
});

test('GET without a plan returns no summary', async () => {
  const app = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(fakePlanRepository(null)),
  );
  const response = await app.inject({
    method: 'GET',
    url: '/api/weight-plan?date=2026-09-30&timezone_offset_minutes=420',
    headers,
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.plan, null);
  assert.equal(body.summary, null);
  assert.equal(body.currentWeightKg, 80);
  await app.close();
});

test('GET with a plan returns the computed summary', async () => {
  const app = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(fakePlanRepository(plan)),
  );
  const response = await app.inject({
    method: 'GET',
    url: '/api/weight-plan?date=2026-09-30',
    headers,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().summary.targetDeficit, 550);
  await app.close();
});

test('PUT requires a logged weight and restarts progress on a new target', async () => {
  const noWeight = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(fakePlanRepository(null), null),
  );
  assert.equal(
    (
      await noWeight.inject({
        method: 'PUT',
        url: '/api/weight-plan',
        headers,
        payload: { sex: 'male', target_weight_kg: 75, pace: 'normal' },
      })
    ).statusCode,
    400,
  );
  await noWeight.close();

  const starts: number[] = [];
  const app = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(fakePlanRepository(plan, (start) => starts.push(start)), 78),
  );
  const put = (target: number) =>
    app.inject({
      method: 'PUT',
      url: '/api/weight-plan',
      headers,
      payload: { sex: 'male', target_weight_kg: target, pace: 'easy' },
    });
  assert.equal((await put(75)).statusCode, 200);
  assert.equal((await put(72)).statusCode, 200);
  assert.deepEqual(starts, [80, 78]);
  await app.close();
});
