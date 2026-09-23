import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import {
  buildFoodAnalysisResult,
  type FoodAnalysisResult,
} from '../src/schemas/food-analysis.js';
import {
  createFoodAnalysisService,
  FoodAnalysisError,
  type FoodAnalysisService,
} from '../src/services/food-analysis-service.js';

const result: FoodAnalysisResult = {
  food_name: 'ข้าวกะเพราไข่ดาว',
  items: [
    {
      name: 'ข้าวสวย',
      estimated_quantity_g: 200,
      calories: 260,
      protein_g: 5,
      carbs_g: 57,
      fat_g: 1,
      nutrition_source: 'ai_estimate',
    },
  ],
  total: { calories: 260, protein_g: 5, carbs_g: 57, fat_g: 1 },
  confidence: 'medium',
  warnings: ['ปริมาณเป็นค่าประมาณจากภาพ'],
  nutrition_source: 'ai_estimate',
};

const validService: FoodAnalysisService = {
  async analyze() {
    return result;
  },
};

function multipartPayload(
  content: Buffer,
  mimeType = 'image/jpeg',
  fieldName = 'image',
) {
  const boundary = 'phase4-boundary';
  return {
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="meal.jpg"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);

function dependencies(foodAnalysisService = validService) {
  return {
    verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
    foodAnalysisService,
  };
}

test('POST /api/food-analyses requires authentication', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies());
  const response = await app.inject({
    method: 'POST',
    url: '/api/food-analyses',
  });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test('POST /api/food-analyses accepts an authenticated JPEG', async () => {
  let receivedUserId = '';
  const service: FoodAnalysisService = {
    async analyze(input) {
      receivedUserId = input.userId;
      assert.equal(input.mimeType, 'image/jpeg');
      assert.deepEqual(input.bytes, jpegBytes);
      return result;
    },
  };
  const app = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(service),
  );
  const response = await app.inject({
    method: 'POST',
    url: '/api/food-analyses',
    ...multipartPayload(jpegBytes),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().food_name, 'ข้าวกะเพราไข่ดาว');
  assert.equal(receivedUserId, 'verified-user');
  await app.close();
});

test('POST /api/food-analyses rejects unsupported and oversized files', async () => {
  const unsupportedApp = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(),
  );
  const unsupported = await unsupportedApp.inject({
    method: 'POST',
    url: '/api/food-analyses',
    ...multipartPayload(Buffer.from('text'), 'text/plain'),
  });
  assert.equal(unsupported.statusCode, 415);
  assert.equal(unsupported.json().code, 'UNSUPPORTED_IMAGE_TYPE');
  await unsupportedApp.close();

  const oversizedApp = await buildApp(
    loadEnv({ NODE_ENV: 'test' }),
    dependencies(),
  );
  const oversized = await oversizedApp.inject({
    method: 'POST',
    url: '/api/food-analyses',
    ...multipartPayload(
      Buffer.concat([jpegBytes, Buffer.alloc(8 * 1024 * 1024)]),
    ),
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.json().code, 'IMAGE_TOO_LARGE');
  await oversizedApp.close();
});

test('POST /api/food-analyses maps non-food, timeout and invalid AI responses', async () => {
  const cases = [
    ['not_food', 422, 'NOT_FOOD'],
    ['timeout', 504, 'AI_TIMEOUT'],
    ['invalid_ai_response', 502, 'INVALID_AI_RESPONSE'],
  ] as const;
  for (const [errorCode, expectedStatus, expectedCode] of cases) {
    const app = await buildApp(
      loadEnv({ NODE_ENV: 'test' }),
      dependencies({
        async analyze() {
          throw new FoodAnalysisError(errorCode);
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/food-analyses',
      ...multipartPayload(jpegBytes),
    });
    assert.equal(response.statusCode, expectedStatus);
    assert.equal(response.json().code, expectedCode);
    await app.close();
  }
});

test('backend recomputes totals from one or multiple AI food items', () => {
  const analysis = buildFoodAnalysisResult({
    is_food: true,
    food_name: 'อาหารสองรายการ',
    confidence: 'high',
    warnings: [],
    items: [
      {
        name: 'รายการหนึ่ง',
        estimated_quantity_g: 100,
        calories: 100.04,
        protein_g: 5.02,
        carbs_g: 10,
        fat_g: 2,
      },
      {
        name: 'รายการสอง',
        estimated_quantity_g: 50,
        calories: 50.04,
        protein_g: 2.02,
        carbs_g: 5,
        fat_g: 1,
      },
    ],
  });
  assert.deepEqual(analysis.total, {
    calories: 150.1,
    protein_g: 7,
    carbs_g: 15,
    fat_g: 3,
  });
});

test('Gemini service sends inline image data and validates structured output', async () => {
  let requestedUrl = '';
  let requestedHeaders: Headers | undefined;
  let requestedBody: Record<string, unknown> | undefined;
  let recordedUsage: { requestCount: number; totalTokens?: number } | undefined;
  const service = createFoodAnalysisService(
    loadEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'test-key' }),
    async (input, init) => {
      requestedUrl = input.toString();
      requestedHeaders = new Headers(init?.headers);
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      is_food: true,
                      food_name: 'ข้าวกะเพราไข่ดาว',
                      confidence: 'medium',
                      warnings: ['เป็นค่าประมาณจากภาพ'],
                      items: [
                        {
                          name: 'ข้าวกะเพราไข่ดาว',
                          estimated_quantity_g: 350,
                          calories: 620,
                          protein_g: 28,
                          carbs_g: 72,
                          fat_g: 24,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 420,
            candidatesTokenCount: 80,
            totalTokenCount: 500,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  );

  const analyzed = await service.analyze({
    bytes: jpegBytes,
    mimeType: 'image/jpeg',
    userId: 'verified-user',
    recordUsage: async (event) => {
      recordedUsage = event;
    },
  });
  assert.match(
    requestedUrl,
    /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/,
  );
  assert.equal(requestedHeaders?.get('x-goog-api-key'), 'test-key');
  assert.equal(
    (
      requestedBody?.generationConfig as {
        responseMimeType?: string;
      }
    ).responseMimeType,
    'application/json',
  );
  assert.equal(analyzed.food_name, 'ข้าวกะเพราไข่ดาว');
  assert.deepEqual(analyzed.total, {
    calories: 620,
    protein_g: 28,
    carbs_g: 72,
    fat_g: 24,
  });
  assert.equal(recordedUsage?.requestCount, 1);
  assert.equal(recordedUsage?.totalTokens, 500);
});

test('Gemini service rejects malformed structured output', async () => {
  const service = createFoodAnalysisService(
    loadEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'test-key' }),
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"wrong":true}' }] } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  );
  await assert.rejects(
    service.analyze({
      bytes: Buffer.from('image'),
      mimeType: 'image/png',
      userId: 'user-1',
    }),
    (error: unknown) =>
      error instanceof FoodAnalysisError &&
      error.code === 'invalid_ai_response',
  );
});

test('Gemini service maps a non-food response with an empty name correctly', async () => {
  const service = createFoodAnalysisService(
    loadEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'test-key' }),
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      is_food: false,
                      food_name: '',
                      items: [],
                      confidence: 'high',
                      warnings: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

  await assert.rejects(
    service.analyze({
      bytes: jpegBytes,
      mimeType: 'image/jpeg',
      userId: 'verified-user',
    }),
    (error: unknown) =>
      error instanceof FoodAnalysisError && error.code === 'not_food',
  );
});

test('Gemini service retries a temporary provider failure', async () => {
  let calls = 0;
  const delays: number[] = [];
  const service = createFoodAnalysisService(
    loadEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'test-key' }),
    async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 503 });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      is_food: true,
                      food_name: 'กล้วย',
                      items: [
                        {
                          name: 'กล้วย',
                          estimated_quantity_g: 100,
                          calories: 89,
                          protein_g: 1.1,
                          carbs_g: 22.8,
                          fat_g: 0.3,
                        },
                      ],
                      confidence: 'high',
                      warnings: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
    async (milliseconds) => {
      delays.push(milliseconds);
    },
  );

  const result = await service.analyze({
    bytes: jpegBytes,
    mimeType: 'image/jpeg',
    userId: 'verified-user',
  });

  assert.equal(result.food_name, 'กล้วย');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [250]);
});

test('Gemini service does not retry a quota response', async () => {
  let calls = 0;
  const service = createFoodAnalysisService(
    loadEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'test-key' }),
    async () => {
      calls += 1;
      return new Response(null, { status: 429 });
    },
  );

  await assert.rejects(
    service.analyze({
      bytes: jpegBytes,
      mimeType: 'image/jpeg',
      userId: 'verified-user',
    }),
    (error: unknown) =>
      error instanceof FoodAnalysisError && error.code === 'quota_exceeded',
  );
  assert.equal(calls, 1);
});
