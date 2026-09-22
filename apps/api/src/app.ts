import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';

import { loadEnv, type Env } from './config/env.js';
import { authPlugin, type VerifyAccessToken } from './plugins/auth.js';
import { onboardingSchema, profileUpdateSchema } from './schemas/profile.js';
import { nutritionAnalysisSchema } from './schemas/nutrition-analysis.js';
import {
  createNutritionAnalysisService,
  type NutritionAnalysisService,
} from './services/nutrition-analysis-service.js';
import {
  createFoodAnalysisService,
  FoodAnalysisError,
  imageBytesMatchMimeType,
  type FoodAnalysisService,
} from './services/food-analysis-service.js';
import {
  createFoodSchema,
  diaryDateSchema,
  foodItemParamsSchema,
  foodSearchSchema,
  logCatalogFoodSchema,
  updateFoodLogItemSchema,
} from './schemas/food.js';
import {
  createFoodRepository,
  dateRangeFromLocalDate,
  FoodRepositoryError,
  type FoodRepository,
} from './services/food-repository.js';
import {
  createProfileRepository,
  isProfileRepositoryError,
  type ProfileRepository,
} from './services/profile-repository.js';
import {
  checkDatabaseConnectivity,
  type DatabaseHealthResult,
} from './services/database-health.js';
import {
  createMeasurementSchema,
  progressQuerySchema,
} from './schemas/progress.js';
import {
  createProgressRepository,
  type ProgressRepository,
  ProgressRepositoryError,
} from './services/progress-repository.js';
import {
  nutritionTargetsSchema,
  reminderParamsSchema,
  reminderSchema,
  unitsSchema,
} from './schemas/settings.js';
import {
  createSettingsRepository,
  type SettingsRepository,
  SettingsRepositoryError,
} from './services/settings-repository.js';
import {
  activityListQuerySchema,
  activityParamsSchema,
  appendActivityPointsSchema,
  createActivitySchema,
  updateActivityStatusSchema,
} from './schemas/activity.js';
import {
  ActivityRepositoryError,
  createActivityRepository,
  type ActivityRepository,
} from './services/activity-repository.js';

interface AppDependencies {
  checkDatabase?: (env: Env) => Promise<DatabaseHealthResult>;
  verifyAccessToken?: VerifyAccessToken;
  profileRepository?: ProfileRepository;
  foodRepository?: FoodRepository;
  foodAnalysisService?: FoodAnalysisService;
  progressRepository?: ProgressRepository;
  settingsRepository?: SettingsRepository;
  activityRepository?: ActivityRepository;
  nutritionAnalysisService?: NutritionAnalysisService;
}

const FOOD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const analysisRateWindowMs = 15 * 60 * 1000;
const analysisRateLimit = 10;

export async function buildApp(
  env: Env = loadEnv(),
  dependencies: AppDependencies = {},
) {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });
  const checkDatabase = dependencies.checkDatabase ?? checkDatabaseConnectivity;
  const profileRepository =
    dependencies.profileRepository ?? createProfileRepository(env);
  const foodRepository =
    dependencies.foodRepository ?? createFoodRepository(env);
  const foodAnalysisService =
    dependencies.foodAnalysisService ?? createFoodAnalysisService(env);
  const progressRepository =
    dependencies.progressRepository ?? createProgressRepository(env);
  const settingsRepository =
    dependencies.settingsRepository ?? createSettingsRepository(env);
  const activityRepository =
    dependencies.activityRepository ?? createActivityRepository(env);
  const nutritionAnalysisService =
    dependencies.nutritionAnalysisService ??
    createNutritionAnalysisService(env);
  const analysisRequests = new Map<string, number[]>();

  await app.register(sensible);
  await app.register(multipart, {
    limits: { files: 1, fields: 0, parts: 1, fileSize: FOOD_IMAGE_MAX_BYTES },
  });
  const allowedOrigins = new Set(
    env.CORS_ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin:
      env.NODE_ENV !== 'production'
        ? true
        : (origin, callback) =>
            callback(null, !origin || allowedOrigins.has(origin)),
  });
  await app.register(authPlugin, {
    env,
    verifyAccessToken: dependencies.verifyAccessToken,
  });

  app.get('/api/health', async () => ({ status: 'ok' as const }));

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
      return nutritionAnalysisService.analyze(parsed.data);
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
  app.get(
    '/api/me',
    { preHandler: app.verifySupabaseJwt },
    async (request) => ({
      id: request.authUser!.id,
      email: request.authUser!.email,
    }),
  );

  app.get(
    '/api/profile',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return await profileRepository.getProfile(
          request.authUser!.id,
          request.authToken!,
        );
      } catch (error) {
        request.log.warn(
          { repositoryError: isProfileRepositoryError(error) },
          'Unable to load profile',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load profile',
        });
      }
    },
  );

  app.put(
    '/api/onboarding',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = onboardingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid onboarding data',
        });
      }

      try {
        const saved = await profileRepository.completeOnboarding(
          request.authUser!.id,
          request.authToken!,
          parsed.data,
        );
        return reply.send(saved);
      } catch (error) {
        request.log.warn(
          { repositoryError: isProfileRepositoryError(error) },
          'Unable to complete onboarding',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to complete onboarding',
        });
      }
    },
  );

  app.put(
    '/api/profile',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = profileUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid profile data',
        });
      }

      try {
        return await profileRepository.updateProfile(
          request.authUser!.id,
          request.authToken!,
          parsed.data,
        );
      } catch (error) {
        request.log.warn(
          { repositoryError: isProfileRepositoryError(error) },
          'Unable to update profile',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to update profile',
        });
      }
    },
  );

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
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - parsed.data.days);
      try {
        return await progressRepository.getProgress({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          startUtc: start.toISOString(),
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
        const [logs, settings] = await Promise.all([
          foodRepository.getFoodLogs({
            userId: request.authUser!.id,
            accessToken: request.authToken!,
            ...range,
          }),
          settingsRepository.get(request.authUser!.id, request.authToken!),
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

  return app;
}
