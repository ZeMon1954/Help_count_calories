import {
  createMeasurementSchema,
  progressQuerySchema,
} from '../schemas/progress.js';
import { ProgressRepositoryError } from '../services/progress-repository.js';

import type { RouteContext } from './types.js';

export function registerProgressRoutes(context: RouteContext) {
  const { app, progressRepository } = context;

  app.get(
    '/api/progress',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = progressQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid progress range',
        });
      const offsetMs = parsed.data.timezone_offset_minutes * 60_000;
      const localNow = new Date(Date.now() + offsetMs);
      const todayLocal = Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        localNow.getUTCDate(),
      );
      const start = new Date(
        todayLocal - (parsed.data.days - 1) * 86_400_000 - offsetMs,
      );
      const end = new Date(todayLocal + 86_400_000 - offsetMs);
      try {
        return await progressRepository.getProgress({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          startUtc: start.toISOString(),
          endUtc: end.toISOString(),
          timezoneOffsetMinutes: parsed.data.timezone_offset_minutes,
        });
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof ProgressRepositoryError },
          'Unable to load progress',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load progress',
        });
      }
    },
  );

  app.post(
    '/api/measurements',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = createMeasurementSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid measurement data',
        });
      try {
        const result = await progressRepository.createMeasurement({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          weightKg: parsed.data.weight_kg,
          waistCm: parsed.data.waist_cm,
          recordedAt: parsed.data.recorded_at ?? new Date().toISOString(),
        });
        return reply.code(201).send(result);
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof ProgressRepositoryError },
          'Unable to save measurement',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save measurement',
        });
      }
    },
  );
}
