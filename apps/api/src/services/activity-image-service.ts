import type { Env } from '../config/env.js';
import { aiRunSummarySchema } from '../schemas/activity.js';
import type { RecordAiUsage } from './ai-usage-repository.js';

export type ActivityImageErrorCode =
  | 'not_configured'
  | 'not_activity'
  | 'timeout'
  | 'quota_exceeded'
  | 'invalid_ai_response'
  | 'provider_error';

export class ActivityImageError extends Error {
  constructor(
    readonly code: ActivityImageErrorCode,
    readonly upstreamStatus?: number,
  ) {
    super(code);
    this.name = 'ActivityImageError';
  }
}

export interface RunScreenshotResult {
  distance_m: number;
  duration_seconds: number;
  confidence: 'low' | 'medium' | 'high';
  warnings: string[];
}

export interface ActivityImageService {
  analyze(input: {
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    recordUsage?: RecordAiUsage;
  }): Promise<RunScreenshotResult>;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

const outputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_run_summary: { type: 'boolean' },
    distance_km: { type: 'number' },
    duration_seconds: { type: 'number' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    warnings: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
  required: [
    'is_run_summary',
    'distance_km',
    'duration_seconds',
    'confidence',
    'warnings',
  ],
} as const;

const prompt = `อ่านค่าจากภาพสรุปการวิ่งของแอปติดตามการออกกำลังกาย (เช่น Strava) ตอบภาษาไทย
- ถ้าไม่ใช่ภาพสรุปการวิ่งหรือออกกำลังกายที่เห็นระยะทางและเวลาชัดเจน ให้ is_run_summary=false และ distance_km=0, duration_seconds=0
- distance_km คือระยะทางเป็นกิโลเมตร ถ้าภาพแสดงเป็นไมล์ (mi) ให้แปลงเป็นกิโลเมตร
- duration_seconds คือเวลาเป็นวินาที ใช้ Moving Time (เวลาเคลื่อนที่) ถ้ามี ถ้าไม่มีให้ใช้ Time หรือ Elapsed Time
- อ่านเฉพาะค่าที่มองเห็นจริง ห้ามเดาหรือคำนวณค่าที่ไม่เห็น
- ห้ามคำนวณแคลอรี่ ระบบ backend จะคำนวณเอง
- ถ้าตัวเลขเบลอหรืออ่านไม่แน่ใจ ให้ลด confidence และอธิบายใน warnings`;

export function createActivityImageService(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): ActivityImageService {
  return {
    async analyze(input) {
      if (!env.GEMINI_API_KEY) throw new ActivityImageError('not_configured');
      const startedAt = performance.now();
      let requestCount = 0;
      let requestedModel = env.GEMINI_MODEL;
      let upstreamStatus: number | undefined;
      let usage: GeminiResponse['usageMetadata'];
      let usageRecorded = false;
      const recordUsage = async (
        outcome:
          | 'success'
          | 'quota_exceeded'
          | 'provider_error'
          | 'timeout'
          | 'invalid_response',
      ) => {
        if (!input.recordUsage || usageRecorded) return;
        usageRecorded = true;
        try {
          await input.recordUsage({
            feature: 'activity_analysis',
            model: requestedModel,
            requestCount: Math.max(1, requestCount),
            outcome,
            upstreamStatus,
            promptTokens: usage?.promptTokenCount,
            outputTokens: usage?.candidatesTokenCount,
            thinkingTokens: usage?.thoughtsTokenCount,
            totalTokens: usage?.totalTokenCount,
            latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          });
        } catch {
          // Usage telemetry must never fail a successful analysis.
        }
      };
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        env.AI_REQUEST_TIMEOUT_MS,
      );
      try {
        const requestInit: RequestInit = {
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
              maxOutputTokens: 600,
              temperature: 0,
            },
          }),
        };
        let response: Response | undefined;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          requestedModel =
            attempt === 0 ? env.GEMINI_MODEL : env.GEMINI_FALLBACK_MODEL;
          requestCount += 1;
          response = await fetchImpl(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(requestedModel)}:generateContent`,
            requestInit,
          );
          upstreamStatus = response.status;
          if (response.status < 500) break;
        }
        if (!response) throw new ActivityImageError('provider_error');
        if (!response.ok) {
          if (response.status === 429)
            throw new ActivityImageError('quota_exceeded', response.status);
          if ([400, 401, 403, 404].includes(response.status))
            throw new ActivityImageError('not_configured', response.status);
          throw new ActivityImageError('provider_error', response.status);
        }
        const envelope = (await response.json()) as GeminiResponse;
        usage = envelope.usageMetadata;
        const outputText = envelope.candidates?.[0]?.content?.parts
          ?.map((part) => part.text)
          .find((text): text is string => typeof text === 'string');
        if (typeof outputText !== 'string')
          throw new ActivityImageError('invalid_ai_response');
        let json: unknown;
        try {
          json = JSON.parse(outputText);
        } catch {
          throw new ActivityImageError('invalid_ai_response');
        }
        const parsed = aiRunSummarySchema.safeParse(json);
        if (!parsed.success) throw new ActivityImageError('invalid_ai_response');
        await recordUsage('success');
        if (
          !parsed.data.is_run_summary ||
          parsed.data.distance_km <= 0 ||
          parsed.data.duration_seconds <= 0
        )
          throw new ActivityImageError('not_activity');
        return {
          distance_m: Math.round(parsed.data.distance_km * 1000),
          duration_seconds: Math.round(parsed.data.duration_seconds),
          confidence: parsed.data.confidence,
          warnings: parsed.data.warnings,
        };
      } catch (error) {
        const outcome =
          error instanceof ActivityImageError && error.code === 'quota_exceeded'
            ? 'quota_exceeded'
            : error instanceof Error && error.name === 'AbortError'
              ? 'timeout'
              : error instanceof ActivityImageError &&
                  error.code === 'invalid_ai_response'
                ? 'invalid_response'
                : 'provider_error';
        await recordUsage(outcome);
        if (error instanceof ActivityImageError) throw error;
        if (error instanceof Error && error.name === 'AbortError')
          throw new ActivityImageError('timeout');
        throw new ActivityImageError('provider_error');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
