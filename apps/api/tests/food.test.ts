import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import {
  dateRangeFromLocalDate,
  FoodRepositoryError,
  type FoodLogRecord,
  type FoodRecord,
  type FoodRepository,
} from '../src/services/food-repository.js';

const food: FoodRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  created_by: 'verified-user',
  name: 'ข้าวอกไก่',
  serving_size_g: 300,
  calories: 450,
  protein_g: 40,
  carbs_g: 50,
  fat_g: 8,
  source: 'manual',
};

const log: FoodLogRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  meal_type: 'lunch',
  eaten_at: '2026-09-20T05:00:00.000Z',
  note: null,
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      food_id: food.id,
      food_name: food.name,
      quantity_g: 150,
      calories: 225,
      protein_g: 20,
      carbs_g: 25,
      fat_g: 4,
      input_method: 'manual',
    },
  ],
};

function fakeRepository(
  overrides: Partial<FoodRepository> = {},
): FoodRepository {
  return {
    async searchFoods({ limit, offset }) {
      return { items: [food], limit, offset };
    },
    async createFood() {
      return food;
    },
    async getFoodLogs() {
      return [log];
    },
    async deleteFoodLogItem() {
      return true;
    },
    async logCatalogFood() {
      return {
        ...log.items[0]!,
        log_id: log.id,
        meal_type: log.meal_type,
        eaten_at: log.eaten_at,
        log_created_at: log.eaten_at,
        was_created: true,
      };
    },
    async updateFoodLogItemQuantity() {
      return { ...log.items[0]!, food_log_id: log.id };
    },
    async getFavoriteFoods() { return []; },
    async getRecentFoods() { return []; },
    async setFavorite() { return true; },
    ...overrides,
  };
}


const dependencies = (foodRepository: FoodRepository) => ({
  verifyAccessToken: async () => ({
    id: 'verified-user',
    email: 'person@example.com',
  }),
  foodRepository,
  settingsRepository: {
    async get() { return { units: 'metric' as const, targets: { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 60 }, reminders: [] }; },
    async setUnits() {}, async setTargets() {},
    async createReminder() { throw new Error('not used'); },
    async updateReminder() { return null; }, async deleteReminder() { return false; },
  },
  activityRepository: {
    async create() { throw new Error('not used'); },
    async current() { return null; },
    async list() { return []; },
    async totals() { return { calories: 320, distanceM: 5000, movingSeconds: 1800 }; },
    async appendPoints() { return 0; },
    async setStatus() { return null; },
    async finish() { return null; },
  },
});

test('food endpoints require authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });

  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/foods' })).statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/food-logs/items' }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: '/api/food-logs/items/33333333-3333-4333-8333-333333333333',
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/api/food-logs?date=2026-09-20&timezone_offset_minutes=420',
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/api/nutrition/summary?date=2026-09-20&timezone_offset_minutes=420',
      })
    ).statusCode,
    401,
  );
  await app.close();
});

test('POST /api/foods validates input and rejects ownership fields', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/foods',
    headers: { authorization: 'Bearer valid' },
    payload: { name: '', serving_size_g: 0, calories: -1 },
  });
  assert.equal(invalid.statusCode, 400);

  const forgedOwner = await app.inject({
    method: 'POST',
    url: '/api/foods',
    headers: { authorization: 'Bearer valid' },
    payload: {
      name: 'อาหาร',
      serving_size_g: 100,
      calories: 100,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
      created_by: 'another-user',
    },
  });
  assert.equal(forgedOwner.statusCode, 400);
  await app.close();
});

test('POST /api/foods derives created_by from the verified JWT', async () => {
  let receivedUserId = '';
  const repository = fakeRepository({
    async createFood(input) {
      receivedUserId = input.userId;
      return food;
    },
  });
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(repository),
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/foods',
    headers: { authorization: 'Bearer valid' },
    payload: {
      name: 'ข้าวอกไก่',
      serving_size_g: 300,
      calories: 450,
      protein_g: 40,
      carbs_g: 50,
      fat_g: 8,
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(receivedUserId, 'verified-user');
  await app.close();
});

test('local diary date is converted to an explicit UTC range', () => {
  assert.deepEqual(dateRangeFromLocalDate('2026-09-20', 420), {
    startUtc: '2026-09-19T17:00:00.000Z',
    endUtc: '2026-09-20T17:00:00.000Z',
  });
  assert.deepEqual(dateRangeFromLocalDate('2026-09-20', -240), {
    startUtc: '2026-09-20T04:00:00.000Z',
    endUtc: '2026-09-21T04:00:00.000Z',
  });
});

test('GET /api/food-logs handles an empty date', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async getFoodLogs() {
          return [];
        },
      }),
    ),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/food-logs?date=2026-09-20&timezone_offset_minutes=420',
    headers: { authorization: 'Bearer valid' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().logs, []);
  await app.close();
});

test('nutrition summary totals immutable item snapshots and returns saved targets', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/nutrition/summary?date=2026-09-20&timezone_offset_minutes=420',
    headers: { authorization: 'Bearer valid' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().consumed, {
    calories: 225,
    protein_g: 20,
    carbs_g: 25,
    fat_g: 4,
  });
  assert.deepEqual(response.json().targets, {
    calories: 2000,
    protein_g: 140,
    carbs_g: 220,
    fat_g: 60,
  });
  assert.deepEqual(response.json().exercise, {
    calories: 320,
    distanceM: 5000,
    movingSeconds: 1800,
  });
  await app.close();
});

test('delete returns 404 when RLS hides an item not owned by the caller', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async deleteFoodLogItem() {
          return false;
        },
      }),
    ),
  });
  const response = await app.inject({
    method: 'DELETE',
    url: '/api/food-logs/items/33333333-3333-4333-8333-333333333333',
    headers: { authorization: 'Bearer valid' },
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

test('food repository failures return sanitized errors', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async searchFoods() {
          throw new Error('sensitive database information');
        },
      }),
    ),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/foods',
    headers: { authorization: 'Bearer valid' },
  });

  assert.equal(response.statusCode, 502);
  assert.doesNotMatch(response.body, /sensitive|database information/i);
  await app.close();
});

test('POST diary item validates input and derives identity from JWT token', async () => {
  let receivedToken = '';
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async logCatalogFood(input) {
          receivedToken = input.accessToken;
          return {
            ...log.items[0]!,
            log_id: log.id,
            meal_type: log.meal_type,
            eaten_at: log.eaten_at,
            log_created_at: log.eaten_at,
            was_created: true,
          };
        },
      }),
    ),
  });
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/food-logs/items',
    headers: { authorization: 'Bearer valid' },
    payload: { food_id: food.id, quantity_g: -1, user_id: 'forged' },
  });
  assert.equal(invalid.statusCode, 400);

  const response = await app.inject({
    method: 'POST',
    url: '/api/food-logs/items',
    headers: { authorization: 'Bearer valid' },
    payload: {
      food_id: food.id,
      meal_type: 'lunch',
      quantity_g: 150,
      eaten_at: log.eaten_at,
      client_request_id: '44444444-4444-4444-8444-444444444444',
    },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(receivedToken, 'valid');
  await app.close();
});

test('identical diary retry is 200 and terminal idempotency errors are sanitized', async () => {
  const payload = {
    food_id: food.id,
    meal_type: 'lunch',
    quantity_g: 150,
    eaten_at: log.eaten_at,
    client_request_id: '44444444-4444-4444-8444-444444444444',
  };
  const retried = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async logCatalogFood() {
          return {
            ...log.items[0]!,
            log_id: log.id,
            meal_type: log.meal_type,
            eaten_at: log.eaten_at,
            log_created_at: log.eaten_at,
            was_created: false,
          };
        },
      }),
    ),
  });
  assert.equal(
    (
      await retried.inject({
        method: 'POST',
        url: '/api/food-logs/items',
        headers: { authorization: 'Bearer valid' },
        payload,
      })
    ).statusCode,
    200,
  );
  await retried.close();

  for (const [databaseCode, statusCode, apiCode] of [
    ['PT409', 409, 'IDEMPOTENCY_KEY_REUSED'],
    ['PT410', 410, 'IDEMPOTENT_ITEM_DELETED'],
  ] as const) {
    const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
      ...dependencies(
        fakeRepository({
          async logCatalogFood() {
            throw new FoodRepositoryError(400, databaseCode);
          },
        }),
      ),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/food-logs/items',
      headers: { authorization: 'Bearer valid' },
      payload,
    });
    assert.equal(response.statusCode, statusCode);
    assert.equal(response.json().code, apiCode);
    await app.close();
  }
});

test('PATCH diary item validates quantity and returns owner-hidden item as 404', async () => {
  const itemUrl =
    '/api/food-logs/items/33333333-3333-4333-8333-333333333333';
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository()),
  });
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: itemUrl,
        headers: { authorization: 'Bearer valid' },
        payload: { quantity_g: 0 },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: itemUrl,
        headers: { authorization: 'Bearer valid' },
        payload: { quantity_g: 175 },
      })
    ).statusCode,
    200,
  );
  await app.close();

  const hidden = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(
      fakeRepository({
        async updateFoodLogItemQuantity() {
          throw new FoodRepositoryError(404, 'P0002');
        },
      }),
    ),
  });
  assert.equal(
    (
      await hidden.inject({
        method: 'PATCH',
        url: itemUrl,
        headers: { authorization: 'Bearer valid' },
        payload: { quantity_g: 175 },
      })
    ).statusCode,
    404,
  );
  await hidden.close();
});

test('favorite and recent food routes return repository records', async () => {
  let favorite = false;
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(fakeRepository({
      async getFavoriteFoods() { return [food]; },
      async getRecentFoods() { return [food]; },
      async setFavorite({ userId, foodId, favorite: next }) {
        assert.equal(userId, 'verified-user'); assert.equal(foodId, food.id);
        favorite = next; return true;
      },
    })),
  });
  const headers = { authorization: 'Bearer valid' };
  assert.equal((await app.inject({ method: 'GET', url: '/api/foods/favorites', headers })).json().items[0].id, food.id);
  assert.equal((await app.inject({ method: 'GET', url: '/api/foods/recent', headers })).json().items[0].id, food.id);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/foods/${food.id}/favorite`, headers })).statusCode, 200);
  assert.equal(favorite, true);
  await app.close();
});
