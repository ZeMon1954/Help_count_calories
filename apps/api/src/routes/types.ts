import type { FastifyInstance } from 'fastify';

import type { Env } from '../config/env.js';
import type { DatabaseHealthResult } from '../services/database-health.js';
import type { ProfileRepository } from '../services/profile-repository.js';
import type { FoodRepository } from '../services/food-repository.js';
import type { FoodAnalysisService } from '../services/food-analysis-service.js';
import type { ProgressRepository } from '../services/progress-repository.js';
import type { SettingsRepository } from '../services/settings-repository.js';
import type { ActivityRepository } from '../services/activity-repository.js';
import type { NutritionAnalysisService } from '../services/nutrition-analysis-service.js';
import type { PhysiqueAnalysisService } from '../services/physique-analysis-service.js';
import type { RecordAiUsage } from '../services/ai-usage-repository.js';

export interface RouteContext {
  app: FastifyInstance;
  env: Env;
  checkDatabase: (env: Env) => Promise<DatabaseHealthResult>;
  profileRepository: ProfileRepository;
  foodRepository: FoodRepository;
  foodAnalysisService: FoodAnalysisService;
  progressRepository: ProgressRepository;
  settingsRepository: SettingsRepository;
  activityRepository: ActivityRepository;
  nutritionAnalysisService: NutritionAnalysisService;
  physiqueAnalysisService: PhysiqueAnalysisService;
  usageRecorder: (userId: string, accessToken: string) => RecordAiUsage;
  analysisRequests: Map<string, number[]>;
}

