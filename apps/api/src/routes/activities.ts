import type { FastifyReply } from 'fastify';

import {
  activityListQuerySchema,
  activityParamsSchema,
  appendActivityPointsSchema,
  createActivitySchema,
  importRunSchema,
  updateActivityStatusSchema,
} from '../schemas/activity.js';
import { ActivityImageError } from '../services/activity-image-service.js';
import { ActivityRepositoryError } from '../services/activity-repository.js';
import { imageBytesMatchMimeType } from '../services/food-analysis-service.js';

import type { RouteContext } from './types.js';

const analysisRateWindowMs = 15 * 60 * 1000;
const analysisRateLimit = 10;

const imageErrors = {
  not_configured: [503, 'Service Unavailable', 'AI_NOT_CONFIGURED', 'Run screenshot analysis is not configured'],
  not_activity: [422, 'Unprocessable Entity', 'NOT_RUN_SUMMARY', 'No run distance and time were detected in the image'],
  timeout: [504, 'Gateway Timeout', 'AI_TIMEOUT', 'Run screenshot analysis timed out'],
  quota_exceeded: [503, 'Service Unavailable', 'AI_QUOTA_EXCEEDED', 'Gemini quota is unavailable or exhausted'],
  invalid_ai_response: [502, 'Bad Gateway', 'INVALID_AI_RESPONSE', 'The AI returned an invalid analysis'],
  provider_error: [502, 'Bad Gateway', 'AI_PROVIDER_ERROR', 'Run screenshot analysis is temporarily unavailable'],
} as const;

export function registerActivityRoutes(context: RouteContext) {
  const {
    app,
    activityRepository,
    activityImageService,
    usageRecorder,
    analysisRequests,
  } = context;

  const badImage = (
    reply: FastifyReply,
    statusCode: number,
    error: string,
    code: string,
    message: string,
  ) => reply.code(statusCode).send({ statusCode, error, code, message });

  // Reads a run summary (distance + time) from a screenshot. Nothing is saved:
  // the user reviews the numbers and then confirms via POST /activities/import.
  app.post(
    '/api/activities/screenshot-analysis',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const userId = request.authUser!.id;
      const rateKey = `activity-image:${userId}`;
      const now = Date.now();
      const recent = (analysisRequests.get(rateKey) ?? []).filter(
        (timestamp) => now - timestamp < analysisRateWindowMs,
      );
      if (recent.length >= analysisRateLimit) {
        reply.header(
          'Retry-After',
          String(
            Math.max(1, Math.ceil((recent[0]! + analysisRateWindowMs - now) / 1000)),
          ),
        );
        return badImage(
          reply,
          429,
          'Too Many Requests',
          'ANALYSIS_RATE_LIMITED',
          'Too many run screenshot analysis requests',
        );
      }
      analysisRequests.set(rateKey, [...recent, now]);

      if (!request.isMultipart())
        return badImage(reply, 415, 'Unsupported Media Type', 'IMAGE_REQUIRED', 'A multipart run screenshot is required');
      try {
        const file = await request.file();
        if (!file)
          return badImage(reply, 400, 'Bad Request', 'IMAGE_REQUIRED', 'A run screenshot is required');
        if (file.fieldname !== 'image')
          return badImage(reply, 400, 'Bad Request', 'INVALID_IMAGE_FIELD', 'The image field must be named image');
        if (
          file.mimetype !== 'image/jpeg' &&
          file.mimetype !== 'image/png' &&
          file.mimetype !== 'image/webp'
        )
          return badImage(reply, 415, 'Unsupported Media Type', 'UNSUPPORTED_IMAGE_TYPE', 'Only JPEG, PNG, and WebP images are supported');
        const bytes = await file.toBuffer();
        if (bytes.length === 0)
          return badImage(reply, 400, 'Bad Request', 'EMPTY_IMAGE', 'The uploaded image is empty');
        if (!imageBytesMatchMimeType(bytes, file.mimetype))
          return badImage(reply, 415, 'Unsupported Media Type', 'IMAGE_CONTENT_MISMATCH', 'Image content does not match its declared type');
        return await activityImageService.analyze({
          bytes,
          mimeType: file.mimetype,
          recordUsage: usageRecorder(userId, request.authToken!),
        });
      } catch (error) {
        if (
          error instanceof app.multipartErrors.RequestFileTooLargeError ||
          (error instanceof Error && error.message === 'request file too large')
        )
          return badImage(reply, 413, 'Payload Too Large', 'IMAGE_TOO_LARGE', 'Image size must not exceed 8 MB');
        if (error instanceof ActivityImageError) {
          const [statusCode, name, code, message] = imageErrors[error.code];
          request.log.warn(
            { code, upstreamStatus: error.upstreamStatus },
            'Run screenshot analysis failed',
          );
          return badImage(reply, statusCode, name, code, message);
        }
        request.log.warn('Unable to process run screenshot');
        return badImage(reply, 400, 'Bad Request', 'INVALID_MULTIPART_REQUEST', 'Unable to process the uploaded image');
      }
    },
  );
  app.post(
    '/api/activities/import',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = importRunSchema.safeParse(request.body);
      if (!parsed.success) return reply.badRequest('Invalid run data');
      const endedAt = parsed.data.ended_at
        ? new Date(parsed.data.ended_at)
        : new Date();
      const now = Date.now();
      if (
        endedAt.getTime() > now + 5 * 60_000 ||
        endedAt.getTime() < now - 366 * 24 * 3_600_000
      )
        return reply.badRequest('Invalid run date');
      try {
        return reply.code(201).send(
          await activityRepository.importRun({
            userId: request.authUser!.id,
            token: request.authToken!,
            distanceM: parsed.data.distance_m,
            durationSeconds: parsed.data.duration_seconds,
            endedAt,
          }),
        );
      } catch {
        return reply.badGateway('Unable to save run');
      }
    },
  );

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
