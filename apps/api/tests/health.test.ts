import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnectivity } from '../src/services/database-health.js';
import type {
  ProfileRepository,
  ProfileSnapshot,
} from '../src/services/profile-repository.js';

const incompleteProfile: ProfileSnapshot = {
  profile: {
    displayName: null,
    birthDate: null,
    heightCm: null,
    activityLevel: null,
    onboardingCompleted: false,
  },
  currentGoal: null,
  latestMeasurement: null,
  workoutPreferences: null,
};

const completedProfile: ProfileSnapshot = {
  profile: {
    displayName: 'Tester',
    birthDate: null,
    heightCm: 170,
    activityLevel: 'lightly_active',
    onboardingCompleted: true,
  },
  currentGoal: {
    goalType: 'maintain',
    workoutDays: 3,
    startedAt: '2026-09-20T00:00:00Z',
  },
  latestMeasurement: {
    weightKg: 70,
    recordedAt: '2026-09-20T00:00:00Z',
  },
  workoutPreferences: {
    trainingLocation: 'home',
    experienceLevel: 'beginner',
    availableEquipment: ['bodyweight'],
  },
};

function createFakeProfileRepository(): ProfileRepository & {
  submissions: number;
  measurementRows: number;
} {
  let completed = false;
  return {
    submissions: 0,
    measurementRows: 0,
    async getProfile() {
      return completed ? completedProfile : incompleteProfile;
    },
    async completeOnboarding(_userId, _accessToken, input) {
      this.submissions += 1;
      if (!completed && input.startingWeightKg !== null) {
        this.measurementRows += 1;
      }
      completed = true;
      return completedProfile;
    },
    async updateProfile() {
      return completedProfile;
    },
  };
}

const validOnboarding = {
  displayName: 'Tester',
  birthDate: null,
  heightCm: 170,
  startingWeightKg: 70,
  goalType: 'maintain',
  activityLevel: 'lightly_active',
  workoutDays: 3,
  trainingLocation: 'home',
  experienceLevel: 'beginner',
  availableEquipment: ['bodyweight'],
};

test('optional empty environment variables are accepted', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DATABASE_URL: '',
    GEMINI_API_KEY: '',
  });

  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
});

test('legacy AI_API_KEY is used as the Gemini API key', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    AI_API_KEY: 'legacy-test-key',
  });

  assert.equal(env.GEMINI_API_KEY, 'legacy-test-key');
});

test('database connectivity check calls the read-only health RPC', async () => {
  let requestedUrl = '';
  let requestedMethod = '';
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requestedUrl = input.toString();
    requestedMethod = init?.method ?? '';
    return new Response('true', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const result = await checkDatabaseConnectivity(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
    }),
    fetchStub,
  );

  assert.equal(
    requestedUrl,
    'https://example.supabase.co/rest/v1/rpc/database_health_check',
  );
  assert.equal(requestedMethod, 'POST');
  assert.deepEqual(result, { connected: true, diagnostic: 'connected' });
});

test('database connectivity check rejects an unexpected RPC response', async () => {
  const fetchStub = (async () =>
    new Response('false', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  const result = await checkDatabaseConnectivity(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test',
    }),
    fetchStub,
  );

  assert.deepEqual(result, {
    connected: false,
    diagnostic: 'unexpected_response',
  });
});

test('GET /api/health returns ok', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }));
  const response = await app.inject({ method: 'GET', url: '/api/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  await app.close();
});

test('GET /api/me returns 401 without a bearer token', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'not-used', email: null }),
  });
  const response = await app.inject({ method: 'GET', url: '/api/me' });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('GET /api/me returns 401 for an invalid token', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => null,
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { authorization: 'Bearer invalid-token' },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('GET /api/me returns only verified safe identity fields', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({
      id: 'user-123',
      email: 'person@example.com',
    }),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { authorization: 'Bearer valid-token' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    id: 'user-123',
    email: 'person@example.com',
  });
  await app.close();
});

test('GET /api/profile returns 401 without a bearer token', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'user-123', email: null }),
    profileRepository: createFakeProfileRepository(),
  });
  const response = await app.inject({ method: 'GET', url: '/api/profile' });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('PUT /api/onboarding returns 401 without a bearer token', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'user-123', email: null }),
    profileRepository: createFakeProfileRepository(),
  });
  const response = await app.inject({
    method: 'PUT',
    url: '/api/onboarding',
    payload: validOnboarding,
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('PUT /api/onboarding returns 400 for invalid input', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'user-123', email: null }),
    profileRepository: createFakeProfileRepository(),
  });
  const response = await app.inject({
    method: 'PUT',
    url: '/api/onboarding',
    headers: { authorization: 'Bearer valid-token' },
    payload: { ...validOnboarding, workoutDays: 8 },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Invalid onboarding data',
  });
  await app.close();
});

test('profile endpoints derive identity from the verified token', async () => {
  let receivedUserId = '';
  let receivedToken = '';
  const repository = createFakeProfileRepository();
  repository.completeOnboarding = async (userId, accessToken) => {
    receivedUserId = userId;
    receivedToken = accessToken;
    return completedProfile;
  };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
    profileRepository: repository,
  });
  const response = await app.inject({
    method: 'PUT',
    url: '/api/onboarding',
    headers: { authorization: 'Bearer verified-token' },
    payload: { ...validOnboarding, userId: 'attacker-controlled' },
  });

  assert.equal(response.statusCode, 400);

  const validResponse = await app.inject({
    method: 'PUT',
    url: '/api/onboarding',
    headers: { authorization: 'Bearer verified-token' },
    payload: validOnboarding,
  });
  assert.equal(validResponse.statusCode, 200);
  assert.equal(receivedUserId, 'verified-user');
  assert.equal(receivedToken, 'verified-token');
  await app.close();
});

test('repeated onboarding submissions rely on the idempotent RPC contract', async () => {
  const repository = createFakeProfileRepository();
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'user-123', email: null }),
    profileRepository: repository,
  });
  const request = () =>
    app.inject({
      method: 'PUT',
      url: '/api/onboarding',
      headers: { authorization: 'Bearer valid-token' },
      payload: validOnboarding,
    });

  assert.equal((await request()).statusCode, 200);
  assert.equal((await request()).statusCode, 200);
  assert.equal(repository.submissions, 2);
  assert.equal(repository.measurementRows, 1);
  await app.close();
});

test('PUT /api/profile validates input and derives identity from the token', async () => {
  let receivedUserId = '';
  let receivedToken = '';
  const repository = createFakeProfileRepository();
  repository.updateProfile = async (userId, accessToken) => {
    receivedUserId = userId;
    receivedToken = accessToken;
    return completedProfile;
  };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
    profileRepository: repository,
  });
  const headers = { authorization: 'Bearer verified-token' };

  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/profile',
        headers,
        payload: {
          ...validOnboarding,
          startingWeightKg: undefined,
          userId: 'attacker',
        },
      })
    ).statusCode,
    400,
  );

  const validUpdate = {
    displayName: validOnboarding.displayName,
    birthDate: validOnboarding.birthDate,
    heightCm: validOnboarding.heightCm,
    goalType: validOnboarding.goalType,
    activityLevel: validOnboarding.activityLevel,
    workoutDays: validOnboarding.workoutDays,
    trainingLocation: validOnboarding.trainingLocation,
    experienceLevel: validOnboarding.experienceLevel,
    availableEquipment: validOnboarding.availableEquipment,
  };
  const response = await app.inject({
    method: 'PUT',
    url: '/api/profile',
    headers,
    payload: validUpdate,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(receivedUserId, 'verified-user');
  assert.equal(receivedToken, 'verified-token');
  await app.close();
});

test('onboarding database failure returns a sanitized error', async () => {
  const repository = createFakeProfileRepository();
  repository.completeOnboarding = async () => {
    throw new Error('sensitive database detail');
  };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'user-123', email: null }),
    profileRepository: repository,
  });
  const response = await app.inject({
    method: 'PUT',
    url: '/api/onboarding',
    headers: { authorization: 'Bearer valid-token' },
    payload: validOnboarding,
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    statusCode: 502,
    error: 'Bad Gateway',
    message: 'Unable to complete onboarding',
  });
  assert.doesNotMatch(response.body, /sensitive|database detail/i);
  await app.close();
});

test('GET /api/health/database returns connected when Supabase responds', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    checkDatabase: async () => ({ connected: true, diagnostic: 'connected' }),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/health/database',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: 'ok',
    database: 'connected',
  });
  await app.close();
});

test('GET /api/health/database hides upstream errors', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    checkDatabase: async () => ({
      connected: false,
      diagnostic: 'unexpected_status',
      statusCode: 401,
    }),
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/health/database',
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: 'error',
    database: 'unavailable',
  });
  assert.doesNotMatch(response.body, /401|credential|supabase/i);
  await app.close();
});

test('GET /api/health/database is unavailable in production', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'production' }));
  const response = await app.inject({
    method: 'GET',
    url: '/api/health/database',
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});
