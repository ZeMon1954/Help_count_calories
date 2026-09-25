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

export function registerHealthRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

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

