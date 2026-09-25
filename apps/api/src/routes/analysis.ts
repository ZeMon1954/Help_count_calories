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

export function registerAnalysisRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

  app.post(
    '/api/nutrition/analyze',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = nutritionAnalysisSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid nutrition analysis data',
        });
      }
      return nutritionAnalysisService.analyze(parsed.data, {
        recordUsage: usageRecorder(
          request.authUser!.id,
          request.authToken!,
        ),
      });
    },
  );

  app.post(
    '/api/progress/physique-analysis',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const userId = request.authUser!.id;
      const now = Date.now();
      const recent = (analysisRequests.get(userId) ?? []).filter(
        (timestamp) => now - timestamp < analysisRateWindowMs,
      );
      if (recent.length >= analysisRateLimit) {
        reply.header(
          'Retry-After',
          String(
            Math.max(
              1,
              Math.ceil((recent[0]! + analysisRateWindowMs - now) / 1000),
            ),
          ),
        );
        return reply.code(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          code: 'ANALYSIS_RATE_LIMITED',
          message: 'Too many image analysis requests',
        });
      }
      const query = physiqueAnalysisQuerySchema.safeParse(request.query);
      if (!query.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          code: 'INVALID_ANALYSIS_DATA',
          message: 'Weight and sex are required',
        });
      if (!request.isMultipart())
        return reply.code(415).send({
          statusCode: 415,
          error: 'Unsupported Media Type',
          code: 'IMAGE_REQUIRED',
          message: 'A multipart progress image is required',
        });
      analysisRequests.set(userId, [...recent, now]);
      try {
        const profile = await profileRepository.getProfile(
          request.authUser!.id,
          request.authToken!,
        );
        const birthDate = profile.profile?.birthDate;
        const heightCm = profile.profile?.heightCm;
        const goal = profile.currentGoal?.goalType;
        const activityLevel = profile.profile?.activityLevel ?? 'sedentary';
        const age = birthDate
          ? Math.floor(
              (Date.now() - Date.parse(`${birthDate}T00:00:00Z`)) /
                (365.2425 * 24 * 60 * 60 * 1000),
            )
          : null;
        if (!heightCm || !goal || age === null || age < 18)
          return reply.code(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            code: 'PROFILE_INCOMPLETE',
            message: 'Adult birth date, height, and goal are required',
          });

        const file = await request.file();
        if (!file || file.fieldname !== 'image')
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            code: 'IMAGE_REQUIRED',
            message: 'The image field must be named image',
          });
        if (
          file.mimetype !== 'image/jpeg' &&
          file.mimetype !== 'image/png' &&
          file.mimetype !== 'image/webp'
        )
          return reply.code(415).send({
            statusCode: 415,
            error: 'Unsupported Media Type',
            code: 'UNSUPPORTED_IMAGE_TYPE',
            message: 'Only JPEG, PNG, and WebP images are supported',
          });
        const bytes = await file.toBuffer();
        if (!bytes.length || !imageBytesMatchMimeType(bytes, file.mimetype))
          return reply.code(415).send({
            statusCode: 415,
            error: 'Unsupported Media Type',
            code: 'IMAGE_CONTENT_MISMATCH',
            message: 'Image content does not match its declared type',
          });

        const visual = await physiqueAnalysisService.analyze({
          bytes,
          mimeType: file.mimetype,
          recordUsage: usageRecorder(
            request.authUser!.id,
            request.authToken!,
          ),
        });
        const measurement = await progressRepository.createMeasurement({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          weightKg: query.data.weight_kg,
          waistCm: null,
          recordedAt: new Date().toISOString(),
        });
        const nutrition = calculateNutritionTargets({
          sex: query.data.sex,
          age,
          weight_kg: query.data.weight_kg,
          height_cm: heightCm,
          activity_level: activityLevel,
          goal,
        });
        return reply.send({
          measurement,
          nutrition: {
            bmr: nutrition.bmr,
            tdee: nutrition.tdee,
            calories: nutrition.calories,
            protein_g: nutrition.protein_g,
            carbs_g: nutrition.carbs_g,
            fat_g: nutrition.fat_g,
            weekly_weight_change_kg: nutrition.weekly_weight_change_kg,
          },
          visual,
          image_retained: false,
        });
      } catch (error) {
        if (
          error instanceof app.multipartErrors.RequestFileTooLargeError ||
          (error instanceof Error && error.message === 'request file too large')
        )
          return reply.code(413).send({
            statusCode: 413,
            error: 'Payload Too Large',
            code: 'IMAGE_TOO_LARGE',
            message: 'Image size must not exceed 8 MB',
          });
        if (error instanceof PhysiqueAnalysisError) {
          const status =
            error.code === 'unsuitable_photo'
              ? 422
              : error.code === 'timeout'
                ? 504
                : error.code === 'not_configured' ||
                    error.code === 'quota_exceeded'
                  ? 503
                  : 502;
          const code = {
            unsuitable_photo: 'UNSUITABLE_PHOTO',
            timeout: 'AI_TIMEOUT',
            not_configured: 'AI_NOT_CONFIGURED',
            quota_exceeded: 'AI_QUOTA_EXCEEDED',
            invalid_ai_response: 'INVALID_AI_RESPONSE',
            provider_error: 'AI_PROVIDER_ERROR',
          }[error.code];
          return reply.code(status).send({
            statusCode: status,
            error: 'Physique Analysis Error',
            code,
            message: 'Unable to analyze progress photo',
          });
        }
        request.log.warn('Unable to analyze physique progress');
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          code: 'ANALYSIS_FAILED',
          message: 'Unable to analyze physique progress',
        });
      }
    },
  );

}

