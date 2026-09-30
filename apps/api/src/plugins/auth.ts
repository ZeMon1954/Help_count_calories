import fp from 'fastify-plugin';
import { createClient } from '@supabase/supabase-js';

import type { Env } from '../config/env.js';

export interface AuthIdentity {
  id: string;
  email: string | null;
}

export type VerifyAccessToken = (token: string) => Promise<AuthIdentity | null>;

interface AuthPluginOptions {
  env: Env;
  verifyAccessToken?: VerifyAccessToken;
}

const TOKEN_CACHE_TTL_MS = 30_000;
const TOKEN_CACHE_MAX_ENTRIES = 500;

/**
 * Wraps a token verifier with a short in-memory cache so one screen that fires
 * several API calls does not make several round trips to Supabase Auth.
 * Only successful verifications are cached, and a revoked token can stay
 * valid for at most `ttlMs`.
 */
export function withTokenCache(
  verify: VerifyAccessToken,
  {
    ttlMs = TOKEN_CACHE_TTL_MS,
    maxEntries = TOKEN_CACHE_MAX_ENTRIES,
    now = Date.now,
  }: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
): VerifyAccessToken {
  const cache = new Map<string, { identity: AuthIdentity; expiresAt: number }>();
  const pending = new Map<string, Promise<AuthIdentity | null>>();
  return async (token) => {
    const hit = cache.get(token);
    if (hit && hit.expiresAt > now()) return hit.identity;
    if (hit) cache.delete(token);
    const inFlight = pending.get(token);
    if (inFlight) return inFlight;
    const request = verify(token)
      .then((identity) => {
        if (identity) {
          if (cache.size >= maxEntries) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(token, { identity, expiresAt: now() + ttlMs });
        }
        return identity;
      })
      .finally(() => pending.delete(token));
    pending.set(token, request);
    return request;
  };
}

export const authPlugin = fp<AuthPluginOptions>(
  async (app, { env, verifyAccessToken }) => {
    let verifyToken = verifyAccessToken;

    if (!verifyToken && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });

      verifyToken = withTokenCache(async (token) => {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return null;
        return { id: data.user.id, email: data.user.email ?? null };
      });
    }

    app.decorate(
      'verifySupabaseJwt',
      async function verifySupabaseJwt(request) {
        const authorization = request.headers.authorization;
        const match = authorization?.match(/^Bearer\s+(.+)$/i);
        if (!match?.[1])
          throw app.httpErrors.unauthorized('Missing bearer token');
        if (!verifyToken)
          throw app.httpErrors.serviceUnavailable(
            'Authentication is not configured',
          );

        const identity = await verifyToken(match[1]);
        if (!identity)
          throw app.httpErrors.unauthorized('Invalid bearer token');
        request.authUser = identity;
        request.authToken = match[1];
      },
    );
  },
);

declare module 'fastify' {
  interface FastifyInstance {
    verifySupabaseJwt: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthIdentity;
    authToken?: string;
  }
}
