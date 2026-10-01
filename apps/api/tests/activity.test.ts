import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import {
  createActivityRepository,
  type ActivityRepository,
} from '../src/services/activity-repository.js';
import {
  calculateActivity,
  calculateImportedRun,
  runMetForSpeed,
} from '../src/services/activity-calculator.js';
import {
  ActivityImageError,
  createActivityImageService,
  type ActivityImageService,
} from '../src/services/activity-image-service.js';

const record = {
  id: '11111111-1111-4111-8111-111111111111',
  activityType: 'run' as const,
  status: 'in_progress' as const,
  startedAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
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
    route: async () => [{ latitude: 13.7, longitude: 100.5 }],
    totals: async () => ({ calories: 0, distanceM: 0, movingSeconds: 0 }),
    appendPoints: async ({ points }) => points.length,
    importRun: async ({ distanceM, durationSeconds, endedAt }) => ({
      ...record,
      status: 'completed',
      endedAt: endedAt.toISOString(),
      distanceM,
      elapsedSeconds: durationSeconds,
      movingSeconds: durationSeconds,
      calories: 123,
    }),
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

test('activity repository retries a transient Supabase point insert failure', async () => {
  let insertAttempts = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('activities?select=id'))
      return new Response(JSON.stringify([{ id: record.id }]), { status: 200 });
    if (url.includes('activity_points')) {
      insertAttempts += 1;
      if (insertAttempts === 1)
        return new Response(JSON.stringify({ message: 'temporary' }), { status: 503 });
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request ${url} ${init?.method ?? 'GET'}`);
  };
  const repo = createActivityRepository(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    }),
    fetchImpl,
  );
  const accepted = await repo.appendPoints({
    userId: 'verified-user', token: 'token', activityId: record.id,
    points: [{ sequence: 0, recorded_at: '2026-09-21T00:00:00.000Z', latitude: 13.7563, longitude: 100.5018, accuracy_m: 5, altitude_m: null, speed_mps: null }],
  });
  assert.equal(accepted, 1);
  assert.equal(insertAttempts, 2);
});

test('finishing keeps active elapsed time when GPS points are unusable', async () => {
  const startedAt = new Date(Date.now() - 90_000).toISOString();
  let savedBody: Record<string, unknown> | undefined;
  const databaseRow = {
    id: record.id,
    activity_type: 'run',
    status: 'in_progress',
    started_at: startedAt,
    updated_at: startedAt,
    ended_at: null,
    elapsed_seconds: 0,
    moving_seconds: 0,
    distance_m: 0,
    elevation_gain_m: 0,
    average_speed_mps: null,
    average_pace_seconds_per_km: null,
    calories: 0,
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('activity_points?select='))
      return new Response(
        JSON.stringify([
          {
            sequence: 0,
            recorded_at: startedAt,
            latitude: 13.7563,
            longitude: 100.5018,
            accuracy_m: 150,
            altitude_m: null,
            speed_mps: null,
          },
        ]),
        { status: 200 },
      );
    if (url.includes('body_measurements?select='))
      return new Response(JSON.stringify([]), { status: 200 });
    if (init?.method === 'PATCH') {
      savedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify([{ ...databaseRow, ...savedBody }]), {
        status: 200,
      });
    }
    if (url.includes('activities?select='))
      return new Response(JSON.stringify([databaseRow]), { status: 200 });
    throw new Error(`Unexpected request ${url}`);
  };
  const repo = createActivityRepository(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    }),
    fetchImpl,
  );

  const finished = await repo.finish({
    userId: 'verified-user',
    token: 'token',
    activityId: record.id,
  });

  assert.ok(finished);
  assert.ok(finished.elapsedSeconds >= 89);
  assert.equal(finished.distanceM, 0);
  assert.ok(Number(savedBody?.elapsed_seconds) >= 89);
});

test('history list omits routes and a route is loaded on demand', async () => {
  const urls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    return new Response(JSON.stringify(url.includes('/activities?') ? [] : []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const repo = createActivityRepository(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    }),
    fakeFetch,
  );
  await repo.list({ userId: 'u', token: 't', limit: 20 });
  assert.match(urls[0]!, /^https:\/\/example\.supabase\.co\/rest\/v1\/activities\?/);
  assert.doesNotMatch(urls[0]!, /activity_points/);
  assert.match(urls[0]!, /limit=20/);
});

test('route and finish page through every GPS point instead of stopping at 1000', async () => {
  const totalPoints = 2_500;
  const pointUrls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));
    let body: unknown[] = [];
    if (url.pathname.endsWith('/activities')) {
      body = [{ id: 'a', activity_type: 'walk', status: 'in_progress', started_at: '2026-09-21T00:00:00.000Z', updated_at: '2026-09-21T00:00:00.000Z', elapsed_seconds: 0 }];
    } else if (url.pathname.endsWith('/activity_points')) {
      pointUrls.push(url.search);
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      body = Array.from(
        { length: Math.max(0, Math.min(limit, totalPoints - offset)) },
        (_, index) => ({
          sequence: offset + index,
          latitude: 13 + (offset + index) * 0.00001,
          longitude: 100,
          recorded_at: new Date(Date.UTC(2026, 8, 21, 0, 0, offset + index)).toISOString(),
        }),
      );
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const repo = createActivityRepository(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    }),
    fakeFetch,
  );
  const route = await repo.route({ userId: 'u', token: 't', activityId: 'a' });
  assert.equal(pointUrls.length, 3);
  assert.equal(route!.length, 300);
  assert.equal(route![0]!.latitude, 13);
  assert.ok(Math.abs(route![299]!.latitude - (13 + 2_499 * 0.00001)) < 1e-9);
});

test('downsampleRoute keeps both ends and never exceeds the cap', async () => {
  const { downsampleRoute } = await import('../src/services/activity-repository.js');
  const points = Array.from({ length: 1_000 }, (_, index) => index);
  const thinned = downsampleRoute(points, 100);
  assert.equal(thinned.length, 100);
  assert.equal(thinned[0], 0);
  assert.equal(thinned[99], 999);
  assert.deepEqual(downsampleRoute([1, 2, 3], 100), [1, 2, 3]);
});

test('route endpoint validates the id and returns 404 for unknown activities', async () => {
  const headers = { authorization: 'Bearer token' };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies());
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/activities/x/route', headers })).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ method: 'GET', url: `/api/activities/${record.id}/route`, headers })).statusCode,
    200,
  );
  const missing = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies({ ...repository(), route: async () => null }),
  );
  assert.equal(
    (await missing.inject({ method: 'GET', url: `/api/activities/${record.id}/route`, headers })).statusCode,
    404,
  );
  await app.close();
  await missing.close();
});

test('imported run calories scale with speed and body weight', () => {
  // 5 km in 30 min = 10 km/h, 70 kg: MET interpolates between 9.8 and 11.0.
  const run = calculateImportedRun(5_000, 30 * 60, 70);
  assert.equal(run.averagePaceSecondsPerKm, 360);
  assert.ok(run.met > 9.8 && run.met < 11);
  assert.ok(Math.abs(run.calories - run.met * 70 * 0.5) < 0.5);
  assert.ok(calculateImportedRun(5_000, 30 * 60, 90).calories > run.calories);
  // Same time, longer distance (faster) burns more.
  assert.ok(calculateImportedRun(6_000, 30 * 60, 70).calories > run.calories);
  assert.equal(runMetForSpeed(1), 3.5);
  assert.equal(runMetForSpeed(99), 23);
  assert.equal(runMetForSpeed(8.0), 8.3);
});

test('importing a run saves server-computed values and validates input', async () => {
  const headers = { authorization: 'Bearer token' };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies());
  const ok = await app.inject({
    method: 'POST',
    url: '/api/activities/import',
    headers,
    payload: { distance_m: 5_000, duration_seconds: 1_800 },
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.json().distanceM, 5_000);
  for (const payload of [
    { distance_m: 5_000, duration_seconds: 10 },
    { distance_m: 50_000, duration_seconds: 600 },
    { distance_m: 5_000, duration_seconds: 1_800, calories: 9_999 },
    {
      distance_m: 5_000,
      duration_seconds: 1_800,
      ended_at: '2999-01-01T00:00:00.000Z',
    },
  ])
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/activities/import', headers, payload })).statusCode,
      400,
    );
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/activities/import', payload: {} })).statusCode,
    401,
  );
  await app.close();
});

test('importRun stores a completed run with calories from the latest weight', async () => {
  let saved: Record<string, unknown> | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('body_measurements?select='))
      return new Response(JSON.stringify([{ weight_kg: 80 }]), { status: 200 });
    if (init?.method === 'POST') {
      saved = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify([{ id: record.id, ...saved }]), { status: 201 });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const repo = createActivityRepository(
    loadEnv({ NODE_ENV: 'test', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' }),
    fetchImpl,
  );
  const endedAt = new Date('2026-09-30T10:00:00.000Z');
  const result = await repo.importRun({
    userId: 'u', token: 't', distanceM: 5_000, durationSeconds: 1_800, endedAt,
  });
  assert.equal(saved?.status, 'completed');
  assert.equal(saved?.started_at, '2026-09-30T09:30:00.000Z');
  assert.equal(saved?.ended_at, endedAt.toISOString());
  assert.equal(result.calories, calculateImportedRun(5_000, 1_800, 80).calories);
});

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
function multipart(bytes: Buffer, field = 'image', type = 'image/png') {
  const boundary = 'xBOUNDARYx';
  return {
    headers: { authorization: 'Bearer token', 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="run.png"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

test('screenshot analysis returns extracted values and maps AI errors', async () => {
  const service: ActivityImageService = {
    analyze: async () => ({ distance_m: 5_120, duration_seconds: 1_805, confidence: 'high', warnings: [] }),
  };
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), { ...dependencies(), activityImageService: service });
  const ok = await app.inject({ method: 'POST', url: '/api/activities/screenshot-analysis', ...multipart(png) });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().distance_m, 5_120);
  const wrongType = await app.inject({ method: 'POST', url: '/api/activities/screenshot-analysis', ...multipart(Buffer.from('not an image'), 'image', 'image/png') });
  assert.equal(wrongType.statusCode, 415);
  const wrongField = await app.inject({ method: 'POST', url: '/api/activities/screenshot-analysis', ...multipart(png, 'file') });
  assert.equal(wrongField.statusCode, 400);
  await app.close();

  const notRun = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies(),
    activityImageService: { analyze: async () => { throw new ActivityImageError('not_activity'); } },
  });
  const rejected = await notRun.inject({ method: 'POST', url: '/api/activities/screenshot-analysis', ...multipart(png) });
  assert.equal(rejected.statusCode, 422);
  assert.equal(rejected.json().code, 'NOT_RUN_SUMMARY');
  await notRun.close();
});

test('Gemini run summary is converted to metres and rejects non-run images', async () => {
  const env = loadEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'key' });
  const reply = (payload: unknown): typeof fetch => async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      { status: 200 },
    );
  const input = { bytes: png, mimeType: 'image/png' as const };
  const parsed = await createActivityImageService(
    env,
    reply({ is_run_summary: true, distance_km: 5.12, duration_seconds: 1805.4, confidence: 'medium', warnings: [] }),
  ).analyze(input);
  assert.equal(parsed.distance_m, 5_120);
  assert.equal(parsed.duration_seconds, 1_805);
  await assert.rejects(
    createActivityImageService(
      env,
      reply({ is_run_summary: false, distance_km: 0, duration_seconds: 0, confidence: 'low', warnings: [] }),
    ).analyze(input),
    { code: 'not_activity' },
  );
});
