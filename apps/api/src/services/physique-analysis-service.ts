import type { Env } from '../config/env.js';
import type { RecordAiUsage } from './ai-usage-repository.js';
import {
  aiPhysiqueAnalysisSchema,
  type AiPhysiqueAnalysis,
} from '../schemas/physique-analysis.js';

export type PhysiqueAnalysisErrorCode =
  | 'not_configured'
  | 'unsuitable_photo'
  | 'timeout'
  | 'quota_exceeded'
  | 'invalid_ai_response'
  | 'provider_error';

export class PhysiqueAnalysisError extends Error {
  constructor(
    readonly code: PhysiqueAnalysisErrorCode,
    readonly upstreamStatus?: number,
  ) {
    super(code);
    this.name = 'PhysiqueAnalysisError';
  }
}

interface GeminiEnvelope {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    photo_suitable: { type: 'boolean' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    observations: { type: 'array', maxItems: 5, items: { type: 'string' } },
    recommendations: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string' },
    },
    warnings: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
  required: [
    'photo_suitable',
    'confidence',
    'observations',
    'recommendations',
    'warnings',
  ],
} as const;

const prompt = `วิเคราะห์ภาพความคืบหน้ารูปร่างเป็นภาษาไทยอย่างสุภาพและเป็นกลาง
- photo_suitable=true เฉพาะเมื่อเห็นลำตัวของผู้ใหญ่ชัดพอสำหรับติดตามความเปลี่ยนแปลง
- บอกเฉพาะลักษณะที่มองเห็น เช่น ความชัดของกล้าม สัดส่วนโดยรวม และคุณภาพ/มุมของภาพ
- ห้ามระบุตัวตน อายุ เชื้อชาติ ภาวะสุขภาพ โรค หรือเปอร์เซ็นต์ไขมันจากภาพ
- ห้ามใช้คำดูถูก ตัดสินความน่าดึงดูด หรือรับรองผลทางการแพทย์
- recommendations ให้เป็นคำแนะนำทั่วไปเรื่องความสม่ำเสมอ เวท คาร์ดิโอ การพัก และการถ่ายภาพเปรียบเทียบ
- ห้ามกำหนดตัวเลขแคลอรีหรือสารอาหาร เพราะ backend จะคำนวณด้วยสูตร
- ถ้าภาพไม่เหมาะสม มืด เบลอ ไม่เห็นลำตัว หรือไม่แน่ใจว่าเป็นผู้ใหญ่ ให้ photo_suitable=false`;

export interface PhysiqueAnalysisService {
  analyze(input: {
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    recordUsage?: RecordAiUsage;
  }): Promise<AiPhysiqueAnalysis>;
}

export function createPhysiqueAnalysisService(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): PhysiqueAnalysisService {
  return {
    async analyze(input) {
      if (!env.GEMINI_API_KEY)
        throw new PhysiqueAnalysisError('not_configured');
      const startedAt = performance.now();
      let requestCount = 0;
      let upstreamStatus: number | undefined;
      let usage: GeminiEnvelope['usageMetadata'];
      let usageRecorded = false;
      const recordUsage = async (
        outcome: 'success' | 'quota_exceeded' | 'provider_error' | 'timeout' | 'invalid_response',
      ) => {
        if (!input.recordUsage || usageRecorded) return;
        usageRecorded = true;
        await input.recordUsage({
          feature: 'physique_analysis',
          model: env.GEMINI_MODEL,
          requestCount: Math.max(1, requestCount),
          outcome,
          upstreamStatus,
          promptTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
          thinkingTokens: usage?.thoughtsTokenCount,
          totalTokens: usage?.totalTokenCount,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        });
      };
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        env.AI_REQUEST_TIMEOUT_MS,
      );
      try {
        const model = encodeURIComponent(env.GEMINI_MODEL);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const init: RequestInit = {
          method: 'POST',
          headers: {
            'x-goog-api-key': env.GEMINI_API_KEY,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
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
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: responseSchema,
              maxOutputTokens: 1200,
              temperature: 0.2,
            },
          }),
        };
        let response: Response | undefined;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          requestCount += 1;
          response = await fetchImpl(url, init);
          upstreamStatus = response.status;
          if (response.status !== 429 && response.status < 500) break;
          if (attempt < 2) await sleep(250 * 2 ** attempt);
        }
        if (!response) throw new PhysiqueAnalysisError('provider_error');
        if (!response.ok) {
          if (response.status === 429)
            throw new PhysiqueAnalysisError('quota_exceeded', response.status);
          if (response.status === 401 || response.status === 403)
            throw new PhysiqueAnalysisError('not_configured', response.status);
          throw new PhysiqueAnalysisError('provider_error', response.status);
        }
        const envelope = (await response.json()) as GeminiEnvelope;
        usage = envelope.usageMetadata;
        const text = envelope.candidates?.[0]?.content?.parts
          ?.map((part) => part.text)
          .find((value): value is string => typeof value === 'string');
        if (!text) throw new PhysiqueAnalysisError('invalid_ai_response');
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new PhysiqueAnalysisError('invalid_ai_response');
        }
        const parsed = aiPhysiqueAnalysisSchema.safeParse(json);
        if (!parsed.success)
          throw new PhysiqueAnalysisError('invalid_ai_response');
        await recordUsage('success');
        if (!parsed.data.photo_suitable)
          throw new PhysiqueAnalysisError('unsuitable_photo');
        return parsed.data;
      } catch (error) {
        const outcome =
          error instanceof PhysiqueAnalysisError && error.code === 'quota_exceeded'
            ? 'quota_exceeded'
            : (error instanceof PhysiqueAnalysisError && error.code === 'timeout') ||
                (error instanceof Error && error.name === 'AbortError')
              ? 'timeout'
              : error instanceof PhysiqueAnalysisError && error.code === 'invalid_ai_response'
                ? 'invalid_response'
                : 'provider_error';
        await recordUsage(outcome);
        if (error instanceof PhysiqueAnalysisError) throw error;
        if (error instanceof Error && error.name === 'AbortError')
          throw new PhysiqueAnalysisError('timeout');
        throw new PhysiqueAnalysisError('provider_error');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
