import type { Env } from '../config/env.js';

export interface DatabaseHealthResult {
  connected: boolean;
  diagnostic:
    | 'connected'
    | 'not_configured'
    | 'request_failed'
    | 'unexpected_status'
    | 'unexpected_response';
  statusCode?: number;
}

export async function checkDatabaseConnectivity(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): Promise<DatabaseHealthResult> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { connected: false, diagnostic: 'not_configured' };
  }

  try {
    const response = await fetchImplementation(
      `${env.SUPABASE_URL}/rest/v1/rpc/database_health_check`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      return {
        connected: false,
        diagnostic: 'unexpected_status',
        statusCode: response.status,
      };
    }

    const result: unknown = await response.json();
    if (result !== true) {
      return { connected: false, diagnostic: 'unexpected_response' };
    }

    return { connected: true, diagnostic: 'connected' };
  } catch {
    return { connected: false, diagnostic: 'request_failed' };
  }
}
