import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';

import { loadEnv, type Env } from '../config/env.js';
import { authPlugin, type VerifyAccessToken } from '../plugins/auth.js';
import { onboardingSchema, profileUpdateSchema } from '../schemas/profile.js';
import { nutritionAnalysisSchema } from '../schemas/nutrition-analysis.js';
import { physiqueAnalysisQuerySchema } from '../schemas/physique-analysis.js';
import {
  calculateNutritionTargets,
  createNutritionAnalysisService,
  type NutritionAnalysisService,
} from '../services/nutrition-analysis-service.js';
import {
  createPhysiqueAnalysisService,
  PhysiqueAnalysisError,
  type PhysiqueAnalysisService,
} from '../services/physique-analysis-service.js';
import {
  createFoodAnalysisService,
  FoodAnalysisError,
  imageBytesMatchMimeType,
  type FoodAnalysisService,
} from '../services/food-analysis-service.js';
import {
  createFoodSchema,
  diaryDateSchema,
  foodItemParamsSchema,
  foodSearchSchema,
  logCatalogFoodSchema,
  updateFoodLogItemSchema,
} from '../schemas/food.js';
import {
  createFoodRepository,
  dateRangeFromLocalDate,
  FoodRepositoryError,
  type FoodRepository,
} from '../services/food-repository.js';
import {
  createProfileRepository,
  isProfileRepositoryError,
  type ProfileRepository,
} from '../services/profile-repository.js';
import {
  checkDatabaseConnectivity,
  type DatabaseHealthResult,
} from '../services/database-health.js';
import {
  createMeasurementSchema,
  progressQuerySchema,
} from '../schemas/progress.js';
import {
  createProgressRepository,
  type ProgressRepository,
  ProgressRepositoryError,
} from '../services/progress-repository.js';
import {
  nutritionTargetsSchema,
  reminderParamsSchema,
  reminderSchema,
  unitsSchema,
} from '../schemas/settings.js';
import {
  createSettingsRepository,
  type SettingsRepository,
  SettingsRepositoryError,
} from '../services/settings-repository.js';
import {
  activityListQuerySchema,
  activityParamsSchema,
  appendActivityPointsSchema,
  createActivitySchema,
  updateActivityStatusSchema,
} from '../schemas/activity.js';
import {
  ActivityRepositoryError,
  createActivityRepository,
  type ActivityRepository,
} from '../services/activity-repository.js';
import {
  createAiUsageRepository,
  type AiUsageRepository,
  type RecordAiUsage,
} from '../services/ai-usage-repository.js';

import type { RouteContext } from './types.js';

const analysisRateWindowMs = 15 * 60 * 1000;
const analysisRateLimit = 10;

export function registerActivityRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

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
              error instanceof ActivityRepositoryError ? error.status : undefined,
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

