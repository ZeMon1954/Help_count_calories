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

export function registerSettingsRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

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

