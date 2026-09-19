import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';

import { loadEnv, type Env } from './config/env.js';
import { authPlugin, type VerifyAccessToken } from './plugins/auth.js';
import {
  checkDatabaseConnectivity,
  type DatabaseHealthResult,
} from './services/database-health.js';

interface AppDependencies {
  checkDatabase?: (env: Env) => Promise<DatabaseHealthResult>;
  verifyAccessToken?: VerifyAccessToken;
}

export async function buildApp(
  env: Env = loadEnv(),
  dependencies: AppDependencies = {},
) {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });
  const checkDatabase = dependencies.checkDatabase ?? checkDatabaseConnectivity;

  await app.register(sensible);
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
  });
  await app.register(authPlugin, {
    env,
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.get('/api/health', async () => ({ status: 'ok' as const }));
  app.get(
    '/api/me',
    { preHandler: app.verifySupabaseJwt },
    async (request) => ({
      id: request.authUser!.id,
      email: request.authUser!.email,
    }),
  );

  if (env.NODE_ENV !== 'production') {
    app.get('/api/health/database', async (_request, reply) => {
      const startedAt = performance.now();
      app.log.info('Starting Supabase database connectivity check');
      const result = await checkDatabase(env);

      if (!result.connected) {
        app.log.warn(
          {
            diagnostic: result.diagnostic,
            upstreamStatusCode: result.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
          },
          'Supabase database connectivity check failed',
        );
        return reply.code(503).send({
          status: 'error',
          database: 'unavailable',
        });
      }

      app.log.info(
        { durationMs: Math.round(performance.now() - startedAt) },
        'Supabase database connectivity check succeeded',
      );
      return { status: 'ok' as const, database: 'connected' as const };
    });
  }

  return app;
}
