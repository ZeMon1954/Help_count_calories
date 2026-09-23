import type { Env } from '../config/env.js';

export interface AiUsageEvent {
  feature: 'food_analysis' | 'physique_analysis' | 'nutrition_analysis';
  model: string;
  requestCount: number;
  outcome: 'success' | 'quota_exceeded' | 'provider_error' | 'timeout' | 'invalid_response';
  upstreamStatus?: number;
  promptTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}

export type RecordAiUsage = (event: AiUsageEvent) => Promise<void>;

export interface AiUsageRepository {
  record(input: AiUsageEvent & { userId: string; accessToken: string }): Promise<void>;
}

export function createAiUsageRepository(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): AiUsageRepository {
  return {
    async record(input) {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
      const response = await fetchImpl(
        `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/ai_usage_logs`,
        {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            user_id: input.userId,
            feature: input.feature,
            model: input.model,
            request_count: input.requestCount,
            outcome: input.outcome,
            upstream_status: input.upstreamStatus,
            prompt_tokens: input.promptTokens,
            output_tokens: input.outputTokens,
            thinking_tokens: input.thinkingTokens,
            total_tokens: input.totalTokens,
            latency_ms: input.latencyMs,
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) throw new Error(`AI usage log failed (${response.status})`);
    },
  };
}
