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

export function registerFoodDiaryRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

  app.post(
    '/api/foods',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = createFoodSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food data',
        });
      try {
        const food = await foodRepository.createFood({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          food: parsed.data,
        });
        return reply.code(201).send(food);
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to create food',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to create food',
        });
      }
    },
  );

  app.get(
    '/api/food-logs',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = diaryDateSchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid diary date or timezone offset',
        });
      const range = dateRangeFromLocalDate(
        parsed.data.date,
        parsed.data.timezone_offset_minutes,
      );
      try {
        const logs = await foodRepository.getFoodLogs({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          ...range,
        });
        return {
          date: parsed.data.date,
          timezone_offset_minutes: parsed.data.timezone_offset_minutes,
          logs,
        };
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to load food diary',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load food diary',
        });
      }
    },
  );

  app.get(
    '/api/nutrition/summary',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = diaryDateSchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid summary date or timezone offset',
        });
      const range = dateRangeFromLocalDate(
        parsed.data.date,
        parsed.data.timezone_offset_minutes,
      );
      try {
        const [logs, settings, exercise] = await Promise.all([
          foodRepository.getFoodLogs({
            userId: request.authUser!.id,
            accessToken: request.authToken!,
            ...range,
          }),
          settingsRepository.get(request.authUser!.id, request.authToken!),
          activityRepository.totals({
            userId: request.authUser!.id,
            token: request.authToken!,
            ...range,
          }),
        ]);
        const totals = logs
          .flatMap((log) => log.items)
          .reduce(
            (sum, item) => ({
              calories: sum.calories + item.calories,
              protein_g: sum.protein_g + item.protein_g,
              carbs_g: sum.carbs_g + item.carbs_g,
              fat_g: sum.fat_g + item.fat_g,
            }),
            { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
          );
        return {
          date: parsed.data.date,
          timezone_offset_minutes: parsed.data.timezone_offset_minutes,
          consumed: totals,
          targets: settings.targets,
          exercise,
        };
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to load nutrition summary',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load nutrition summary',
        });
      }
    },
  );

  app.delete(
    '/api/food-logs/items/:id',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = foodItemParamsSchema.safeParse(request.params);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food log item ID',
        });
      try {
        const deleted = await foodRepository.deleteFoodLogItem({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          itemId: parsed.data.id,
        });
        if (!deleted)
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Food log item not found',
          });
        return { deleted: true };
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to delete food log item',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to delete food log item',
        });
      }
    },
  );

  app.post(
    '/api/food-logs/items',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = logCatalogFoodSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food log data',
        });
      try {
        const item = await foodRepository.logCatalogFood({
          accessToken: request.authToken!,
          food: parsed.data,
        });
        return reply.code(item.was_created ? 201 : 200).send(item);
      } catch (error) {
        const code =
          error instanceof FoodRepositoryError ? error.databaseCode : undefined;
        if (code === 'PT409')
          return reply.code(409).send({
            statusCode: 409,
            error: 'Conflict',
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Request ID was already used with different data',
          });
        if (code === 'PT410')
          return reply.code(410).send({
            statusCode: 410,
            error: 'Gone',
            code: 'IDEMPOTENT_ITEM_DELETED',
            message: 'The original diary item was deleted',
          });
        if (code === 'P0002')
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Food not found',
          });
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to add food log item',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to add food log item',
        });
      }
    },
  );

  app.patch(
    '/api/food-logs/items/:id',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const params = foodItemParamsSchema.safeParse(request.params);
      const body = updateFoodLogItemSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food log item or quantity',
        });
      try {
        return await foodRepository.updateFoodLogItemQuantity({
          accessToken: request.authToken!,
          itemId: params.data.id,
          quantityG: body.data.quantity_g,
        });
      } catch (error) {
        if (
          error instanceof FoodRepositoryError &&
          error.databaseCode === 'P0002'
        )
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Food log item not found',
          });
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to update food log item',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to update food log item',
        });
      }
    },
  );

}

