import {
  activityListQuerySchema,
  activityParamsSchema,
  appendActivityPointsSchema,
  createActivitySchema,
  updateActivityStatusSchema,
} from '../schemas/activity.js';
import { ActivityRepositoryError } from '../services/activity-repository.js';

import type { RouteContext } from './types.js';

export function registerActivityRoutes(context: RouteContext) {
  const { app, activityRepository } = context;

  app.get(
    '/api/activities',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = activityListQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.badRequest('Invalid activity history parameters');
      try {
        return {
          items: await activityRepository.list({
            userId: request.authUser!.id,
            token: request.authToken!,
            limit: parsed.data.limit,
          }),
        };
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof ActivityRepositoryError },
          'Unable to load activities',
        );
        return reply.badGateway('Unable to load activities');
      }
    },
  );
  app.get(
    '/api/activities/:activityId/route',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const params = activityParamsSchema.safeParse(request.params);
      if (!params.success) return reply.badRequest('Invalid activity ID');
      try {
        const route = await activityRepository.route({
          userId: request.authUser!.id,
          token: request.authToken!,
          activityId: params.data.activityId,
        });
        return route ? { route } : reply.notFound('Activity not found');
      } catch {
        return reply.badGateway('Unable to load activity route');
      }
    },
  );
  app.get(
    '/api/activities/current',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return {
          activity: await activityRepository.current({
            userId: request.authUser!.id,
            token: request.authToken!,
          }),
        };
      } catch {
        return reply.badGateway('Unable to load current activity');
      }
    },
  );
  app.post(
    '/api/activities',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = createActivitySchema.safeParse(request.body);
      if (!parsed.success) return reply.badRequest('Invalid activity data');
      try {
        return reply.code(201).send(
          await activityRepository.create({
            userId: request.authUser!.id,
            token: request.authToken!,
            type: parsed.data.activity_type,
          }),
        );
      } catch {
        return reply.badGateway('Unable to start activity');
      }
    },
  );
  app.post(
    '/api/activities/:activityId/points',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const params = activityParamsSchema.safeParse(request.params);
      const body = appendActivityPointsSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.badRequest('Invalid activity points');
      try {
        const accepted = await activityRepository.appendPoints({
          userId: request.authUser!.id,
          token: request.authToken!,
          activityId: params.data.activityId,
          points: body.data.points,
        });
        return accepted
          ? { accepted }
          : reply.notFound('Active activity not found');
      } catch (error) {
        request.log.warn(
          {
            upstreamStatus:
              error instanceof ActivityRepositoryError
                ? error.status
                : undefined,
            operation:
              error instanceof ActivityRepositoryError
                ? error.operation
                : undefined,
          },
          'Unable to save activity points',
        );
        return reply.badGateway('Unable to save activity points');
      }
    },
  );
  app.patch(
    '/api/activities/:activityId/status',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const params = activityParamsSchema.safeParse(request.params);
      const body = updateActivityStatusSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.badRequest('Invalid activity status');
      try {
        const activity = await activityRepository.setStatus({
          userId: request.authUser!.id,
          token: request.authToken!,
          activityId: params.data.activityId,
          status: body.data.status,
        });
        return activity ?? reply.notFound('Active activity not found');
      } catch {
        return reply.badGateway('Unable to update activity');
      }
    },
  );
  app.post(
    '/api/activities/:activityId/finish',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const params = activityParamsSchema.safeParse(request.params);
      if (!params.success) return reply.badRequest('Invalid activity ID');
      try {
        const activity = await activityRepository.finish({
          userId: request.authUser!.id,
          token: request.authToken!,
          activityId: params.data.activityId,
        });
        return activity ?? reply.notFound('Active activity not found');
      } catch {
        return reply.badGateway('Unable to finish activity');
      }
    },
  );
}
