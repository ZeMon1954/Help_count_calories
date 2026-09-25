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

export function registerProgressRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

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

