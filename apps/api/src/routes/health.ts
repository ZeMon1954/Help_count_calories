import type { RouteContext } from './types.js';

export function registerHealthRoutes(context: RouteContext) {
  const { app, env, checkDatabase } = context;

  app.get('/api/health', async () => ({ status: 'ok' as const }));

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
}
