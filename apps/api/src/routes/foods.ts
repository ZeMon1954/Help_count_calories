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

export function registerFoodRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

  app.get(
    '/api/foods',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = foodSearchSchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food search parameters',
        });
      try {
        return await foodRepository.searchFoods({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          ...parsed.data,
        });
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to search foods',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to search foods',
        });
      }
    },
  );
  app.get(
    '/api/foods/favorites',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return {
          items: await foodRepository.getFavoriteFoods({
            accessToken: request.authToken!,
          }),
        };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load favorite foods',
        });
      }
    },
  );
  app.get(
    '/api/foods/recent',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return {
          items: await foodRepository.getRecentFoods({
            accessToken: request.authToken!,
          }),
        };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load recent foods',
        });
      }
    },
  );
  app.put(
    '/api/foods/:id/favorite',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const p = foodItemParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food ID',
        });
      try {
        await foodRepository.setFavorite({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          foodId: p.data.id,
          favorite: true,
        });
        return { favorite: true };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save favorite',
        });
      }
    },
  );
  app.delete(
    '/api/foods/:id/favorite',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const p = foodItemParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food ID',
        });
      try {
        await foodRepository.setFavorite({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          foodId: p.data.id,
          favorite: false,
        });
        return { favorite: false };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to remove favorite',
        });
      }
    },
  );

}

