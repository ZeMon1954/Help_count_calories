import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';

import { loadEnv, type Env } from './config/env.js';
import { authPlugin, type VerifyAccessToken } from './plugins/auth.js';
import { onboardingSchema, profileUpdateSchema } from './schemas/profile.js';
import { nutritionAnalysisSchema } from './schemas/nutrition-analysis.js';
import { physiqueAnalysisQuerySchema } from './schemas/physique-analysis.js';
import {
  calculateNutritionTargets,
  createNutritionAnalysisService,
  type NutritionAnalysisService,
} from './services/nutrition-analysis-service.js';
import {
  createPhysiqueAnalysisService,
  PhysiqueAnalysisError,
  type PhysiqueAnalysisService,
} from './services/physique-analysis-service.js';
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
import {
  createAiUsageRepository,
  type AiUsageRepository,
  type RecordAiUsage,
} from './services/ai-usage-repository.js';

import { registerActivityRoutes } from './routes/activities.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerFoodAnalysisRoutes } from './routes/food-analysis.js';
import { registerFoodDiaryRoutes } from './routes/food-diary.js';
import { registerFoodRoutes } from './routes/foods.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerProgressRoutes } from './routes/progress.js';
import { registerSettingsRoutes } from './routes/settings.js';
import type { RouteContext } from './routes/types.js';

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
  physiqueAnalysisService?: PhysiqueAnalysisService;
  aiUsageRepository?: AiUsageRepository;
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
  const physiqueAnalysisService =
    dependencies.physiqueAnalysisService ?? createPhysiqueAnalysisService(env);
  const aiUsageRepository =
    dependencies.aiUsageRepository ?? createAiUsageRepository(env);
  const usageRecorder = (userId: string, accessToken: string): RecordAiUsage =>
    async (event) => {
      try {
        await aiUsageRepository.record({ ...event, userId, accessToken });
      } catch (error) {
        app.log.warn(
          { feature: event.feature, loggingError: error instanceof Error },
          'Unable to persist AI usage log',
        );
      }
    };
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


  const routeContext: RouteContext = {
    app,
    env,
    checkDatabase,
    profileRepository,
    foodRepository,
    foodAnalysisService,
    progressRepository,
    settingsRepository,
    activityRepository,
    nutritionAnalysisService,
    physiqueAnalysisService,
    usageRecorder,
    analysisRequests,
  };

  registerHealthRoutes(routeContext);
  registerAnalysisRoutes(routeContext);
  registerActivityRoutes(routeContext);
  registerProfileRoutes(routeContext);
  registerFoodRoutes(routeContext);
  registerSettingsRoutes(routeContext);
  registerProgressRoutes(routeContext);
  registerFoodDiaryRoutes(routeContext);
  registerFoodAnalysisRoutes(routeContext);

  return app;
}

