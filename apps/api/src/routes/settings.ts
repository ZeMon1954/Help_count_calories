import {
  nutritionTargetsSchema,
  reminderParamsSchema,
  reminderSchema,
  unitsSchema,
} from '../schemas/settings.js';
import { SettingsRepositoryError } from '../services/settings-repository.js';

import type { RouteContext } from './types.js';

export function registerSettingsRoutes(context: RouteContext) {
  const { app, settingsRepository } = context;

  app.get(
    '/api/settings',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return await settingsRepository.get(
          request.authUser!.id,
          request.authToken!,
        );
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof SettingsRepositoryError },
          'Unable to load settings',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load settings',
        });
      }
    },
  );
  app.put(
    '/api/settings/units',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = unitsSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid units',
        });
      try {
        await settingsRepository.setUnits(
          request.authUser!.id,
          request.authToken!,
          parsed.data.units,
        );
        return { saved: true };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save units',
        });
      }
    },
  );
  app.put(
    '/api/settings/nutrition-targets',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = nutritionTargetsSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid nutrition targets',
        });
      try {
        await settingsRepository.setTargets(request.authToken!, parsed.data);
        return { saved: true };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save nutrition targets',
        });
      }
    },
  );
  app.post(
    '/api/reminders',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = reminderSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid reminder',
        });
      try {
        return reply
          .code(201)
          .send(
            await settingsRepository.createReminder(
              request.authUser!.id,
              request.authToken!,
              parsed.data,
            ),
          );
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save reminder',
        });
      }
    },
  );
  app.put(
    '/api/reminders/:id',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const p = reminderParamsSchema.safeParse(request.params),
        b = reminderSchema.safeParse(request.body);
      if (!p.success || !b.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid reminder',
        });
      try {
        const item = await settingsRepository.updateReminder(
          request.authUser!.id,
          request.authToken!,
          p.data.id,
          b.data,
        );
        return (
          item ??
          reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Reminder not found',
          })
        );
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save reminder',
        });
      }
    },
  );
  app.delete(
    '/api/reminders/:id',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const p = reminderParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid reminder',
        });
      try {
        return (await settingsRepository.deleteReminder(
          request.authUser!.id,
          request.authToken!,
          p.data.id,
        ))
          ? { deleted: true }
          : reply.code(404).send({
              statusCode: 404,
              error: 'Not Found',
              message: 'Reminder not found',
            });
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to delete reminder',
        });
      }
    },
  );
}
