import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnectivity } from '../src/services/database-health.js';

test('optional empty environment variables are accepted', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DATABASE_URL: '',
    AI_API_KEY: '',
  });

  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.AI_API_KEY, undefined);
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
