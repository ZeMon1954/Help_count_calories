import assert from 'node:assert/strict';
import test from 'node:test';

test('GET retries temporary gateway errors while the API wakes up', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
  const { apiRequest, clearApiCache } = await import(
    '../services/api/client.js'
  );
  clearApiCache();

  let calls = 0;
  const delays: number[] = [];
  const response = await apiRequest<{ ready: boolean }>(
    'profile',
    undefined,
    async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'starting' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ready: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    async (milliseconds) => {
      delays.push(milliseconds);
    },
  );

  assert.equal(calls, 2);
  assert.deepEqual(delays, [1_500]);
  assert.deepEqual(response.data, { ready: true });
});

test('non-GET requests are not automatically repeated', async () => {
  const { apiRequest } = await import('../services/api/client.js');
  let calls = 0;

  await assert.rejects(
    apiRequest(
      'profile',
      { method: 'PUT' },
      async () => {
        calls += 1;
        return new Response(JSON.stringify({ message: 'unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      async () => undefined,
    ),
  );
  assert.equal(calls, 1);
});
