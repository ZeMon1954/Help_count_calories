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

      verifyToken = async (token) => {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return null;
        return { id: data.user.id, email: data.user.email ?? null };
      };
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
