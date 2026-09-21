import type { Env } from '../config/env.js';
import {
  aiFoodAnalysisSchema,
  buildFoodAnalysisResult,
  type FoodAnalysisResult,
} from '../schemas/food-analysis.js';

export type FoodAnalysisErrorCode =
  | 'not_configured'
  | 'not_food'
  | 'timeout'
  | 'quota_exceeded'
  | 'invalid_ai_response'
  | 'provider_error';

export class FoodAnalysisError extends Error {
  constructor(
    readonly code: FoodAnalysisErrorCode,
    readonly upstreamStatus?: number,
  ) {
    super(code);
    this.name = 'FoodAnalysisError';
  }
}

export interface AnalyzeFoodImageInput {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  userId: string;
}

export interface FoodAnalysisService {
  analyze(input: AnalyzeFoodImageInput): Promise<FoodAnalysisResult>;
}

export function imageBytesMatchMimeType(
  bytes: Buffer,
  mimeType: AnalyzeFoodImageInput['mimeType'],
) {
  if (mimeType === 'image/jpeg')
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mimeType === 'image/png')
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
  }>;
}

const outputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_food: { type: 'boolean' },
    food_name: { type: 'string' },
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          estimated_quantity_g: { type: 'number' },
          calories: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
        required: [
          'name',
          'estimated_quantity_g',
          'calories',
          'protein_g',
          'carbs_g',
          'fat_g',
        ],
      },
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    warnings: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
  required: ['is_food', 'food_name', 'items', 'confidence', 'warnings'],
} as const;

const prompt = `วิเคราะห์เฉพาะอาหารที่มองเห็นได้จริงในภาพ ตอบภาษาไทย
- ถ้าไม่ใช่ภาพอาหาร ให้ is_food=false และ items=[]
- แยกอาหารแต่ละชนิดที่มองเห็นเป็นรายการ ห้ามแต่งส่วนประกอบที่มองไม่เห็น
- ปริมาณและโภชนาการทั้งหมดเป็นค่าประมาณจากภาพ
- calories, protein_g, carbs_g และ fat_g ต้องเป็นค่าของ estimated_quantity_g ในรายการนั้น
- ระบุความไม่แน่นอน เช่น น้ำมัน ซอส หรือส่วนที่ถูกบังใน warnings
- ไม่ต้องส่ง total เพราะระบบ backend จะคำนวณใหม่จาก items`;

export function createFoodAnalysisService(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): FoodAnalysisService {
  return {
    async analyze(input) {
      if (!env.GEMINI_API_KEY) throw new FoodAnalysisError('not_configured');

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        env.AI_REQUEST_TIMEOUT_MS,
      );
      try {
        const model = encodeURIComponent(env.GEMINI_MODEL);
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'x-goog-api-key': env.GEMINI_API_KEY,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: input.mimeType,
                        data: input.bytes.toString('base64'),
                      },
                    },
                    { text: prompt },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
                responseJsonSchema: outputJsonSchema,
                maxOutputTokens: 1600,
                temperature: 0.2,
              },
            }),
          },
        );
        if (!response.ok) {
          if (response.status === 429)
            throw new FoodAnalysisError('quota_exceeded', response.status);
          if (response.status === 401 || response.status === 403)
            throw new FoodAnalysisError('not_configured', response.status);
          throw new FoodAnalysisError('provider_error', response.status);
        }

        const envelope = (await response.json()) as GeminiResponse;
        const outputText = envelope.candidates?.[0]?.content?.parts
          ?.map((part) => part.text)
          .find((text): text is string => typeof text === 'string');
        if (typeof outputText !== 'string')
          throw new FoodAnalysisError('invalid_ai_response');
        let json: unknown;
        try {
          json = JSON.parse(outputText);
        } catch {
          throw new FoodAnalysisError('invalid_ai_response');
        }
        const parsed = aiFoodAnalysisSchema.safeParse(json);
        if (!parsed.success) throw new FoodAnalysisError('invalid_ai_response');
        if (!parsed.data.is_food) throw new FoodAnalysisError('not_food');
        return buildFoodAnalysisResult(parsed.data);
      } catch (error) {
        if (error instanceof FoodAnalysisError) throw error;
        if (error instanceof Error && error.name === 'AbortError')
          throw new FoodAnalysisError('timeout');
        throw new FoodAnalysisError('provider_error');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
