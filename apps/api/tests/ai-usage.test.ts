import assert from 'node:assert/strict';
import test from 'node:test';

import { loadEnv } from '../src/config/env.js';
import { createAiUsageRepository } from '../src/services/ai-usage-repository.js';

test('AI usage repository stores owned usage metadata without prompt content', async () => {
  let body: Record<string, unknown> | undefined;
  const repository = createAiUsageRepository(
    loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    }),
    async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 201 });
    },
  );

  await repository.record({
    userId: '11111111-1111-4111-8111-111111111111',
    accessToken: 'user-token',
    feature: 'food_analysis',
    model: 'gemini-3.8-flash',
    requestCount: 3,
    outcome: 'quota_exceeded',
    upstreamStatus: 429,
    promptTokens: 400,
    outputTokens: 50,
    totalTokens: 450,
    latencyMs: 780,
  });

  assert.equal(body?.request_count, 3);
  assert.equal(body?.upstream_status, 429);
  assert.equal(body?.total_tokens, 450);
  assert.equal(body?.user_id, '11111111-1111-4111-8111-111111111111');
  assert.equal('prompt' in (body ?? {}), false);
  assert.equal('image' in (body ?? {}), false);
});
