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

export function registerFoodAnalysisRoutes(context: RouteContext) {
  const { app, env, checkDatabase, profileRepository, foodRepository, foodAnalysisService, progressRepository, settingsRepository, activityRepository, nutritionAnalysisService, physiqueAnalysisService, usageRecorder, analysisRequests } = context;

  app.post(
    '/api/food-analyses',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const userId = request.authUser!.id;
      const now = Date.now();
      const recent = (analysisRequests.get(userId) ?? []).filter(
        (timestamp) => now - timestamp < analysisRateWindowMs,
      );
      if (recent.length >= analysisRateLimit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recent[0]! + analysisRateWindowMs - now) / 1000),
        );
        reply.header('Retry-After', String(retryAfterSeconds));
        return reply.code(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          code: 'ANALYSIS_RATE_LIMITED',
          message: 'Too many food analysis requests',
        });
      }
      analysisRequests.set(userId, [...recent, now]);

      if (!request.isMultipart())
        return reply.code(415).send({
          statusCode: 415,
          error: 'Unsupported Media Type',
          code: 'IMAGE_REQUIRED',
          message: 'A multipart food image is required',
        });

      try {
        const file = await request.file();
        if (!file)
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            code: 'IMAGE_REQUIRED',
            message: 'A food image is required',
          });
        if (file.fieldname !== 'image')
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            code: 'INVALID_IMAGE_FIELD',
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
        if (bytes.length === 0)
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            code: 'EMPTY_IMAGE',
            message: 'The uploaded image is empty',
          });
        if (!imageBytesMatchMimeType(bytes, file.mimetype))
          return reply.code(415).send({
            statusCode: 415,
            error: 'Unsupported Media Type',
            code: 'IMAGE_CONTENT_MISMATCH',
            message: 'Image content does not match its declared type',
          });

        const result = await foodAnalysisService.analyze({
          bytes,
          mimeType: file.mimetype,
          userId,
          recordUsage: usageRecorder(userId, request.authToken!),
        });
        return reply.code(200).send(result);
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

        if (error instanceof FoodAnalysisError) {
          const responses = {
            not_configured: {
              statusCode: 503,
              error: 'Service Unavailable',
              code: 'AI_NOT_CONFIGURED',
              message: 'Food analysis is not configured',
            },
            not_food: {
              statusCode: 422,
              error: 'Unprocessable Entity',
              code: 'NOT_FOOD',
              message: 'No food was detected in the image',
            },
            timeout: {
              statusCode: 504,
              error: 'Gateway Timeout',
              code: 'AI_TIMEOUT',
              message: 'Food analysis timed out',
            },
            quota_exceeded: {
              statusCode: 503,
              error: 'Service Unavailable',
              code: 'AI_QUOTA_EXCEEDED',
              message: 'Gemini quota is unavailable or exhausted',
            },
            invalid_ai_response: {
              statusCode: 502,
              error: 'Bad Gateway',
              code: 'INVALID_AI_RESPONSE',
              message: 'The AI returned an invalid analysis',
            },
            provider_error: {
              statusCode: 502,
              error: 'Bad Gateway',
              code: 'AI_PROVIDER_ERROR',
              message: 'Food analysis is temporarily unavailable',
            },
          } as const;
          const {
            statusCode,
            code,
            message,
            error: errorName,
          } = responses[error.code];
          request.log.warn(
            { code, upstreamStatus: error.upstreamStatus },
            'Food analysis failed',
          );
          return reply.code(statusCode).send({
            statusCode,
            error: errorName,
            code,
            message,
          });
        }

        request.log.warn('Unable to process food image');
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          code: 'INVALID_MULTIPART_REQUEST',
          message: 'Unable to process the uploaded image',
        });
      }
    },
  );

}

