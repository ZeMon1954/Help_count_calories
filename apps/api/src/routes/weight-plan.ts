import {
  weightPlanQuerySchema,
  weightPlanSchema,
} from '../schemas/weight-plan.js';
import { isProfileRepositoryError } from '../services/profile-repository.js';
import { ProgressRepositoryError } from '../services/progress-repository.js';
import {
  calculateWeightPlan,
  missingPlanFields,
} from '../services/weight-plan-calculator.js';
import { WeightPlanRepositoryError } from '../services/weight-plan-repository.js';

import type { RouteContext } from './types.js';

const PROJECTION_DAYS = 30;

export function registerWeightPlanRoutes(context: RouteContext) {
  const { app, profileRepository, progressRepository, weightPlanRepository } =
    context;

  const badRequest = (message: string) => ({
    statusCode: 400,
    error: 'Bad Request',
    message,
  });
  const badGateway = (message: string) => ({
    statusCode: 502,
    error: 'Bad Gateway',
    message,
  });

  app.get(
    '/api/weight-plan',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = weightPlanQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send(badRequest('Invalid weight plan query'));
      const { date, timezone_offset_minutes: offsetMinutes } = parsed.data;
      const userId = request.authUser!.id;
      const accessToken = request.authToken!;
      const offsetMs = offsetMinutes * 60_000;
      const dayStart = Date.parse(`${date}T00:00:00Z`) - offsetMs;
      const start = new Date(dayStart - (PROJECTION_DAYS - 1) * 86_400_000);
      const end = new Date(dayStart + 86_400_000);
      try {
        const [plan, profile, progress] = await Promise.all([
          weightPlanRepository.get({ userId, accessToken }),
          profileRepository.getProfile(userId, accessToken),
          progressRepository.getProgress({
            userId,
            accessToken,
            startUtc: start.toISOString(),
            endUtc: end.toISOString(),
            timezoneOffsetMinutes: offsetMinutes,
          }),
        ]);
        const birthDate = profile.profile?.birthDate ?? null;
        const heightCm = profile.profile?.heightCm ?? null;
        const currentWeightKg = profile.latestMeasurement?.weightKg ?? null;
        const missing = missingPlanFields({
          birthDate,
          heightCm,
          currentWeightKg,
        });
        const summary =
          plan && missing.length === 0
            ? calculateWeightPlan({
                plan,
                birthDate,
                heightCm,
                activityLevel: profile.profile?.activityLevel ?? null,
                currentWeightKg,
                today: date,
                daily: progress.calorieBalance.daily,
                weightHistory: progress.weightHistory,
              })
            : null;
        return {
          plan,
          missing,
          currentWeightKg,
          summary,
          weightHistory: progress.weightHistory,
        };
      } catch (error) {
        request.log.warn(
          {
            repositoryError:
              error instanceof WeightPlanRepositoryError ||
              error instanceof ProgressRepositoryError ||
              isProfileRepositoryError(error),
          },
          'Unable to load weight plan',
        );
        return reply.code(502).send(badGateway('Unable to load weight plan'));
      }
    },
  );

  app.put(
    '/api/weight-plan',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = weightPlanSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send(badRequest('Invalid weight plan data'));
      const userId = request.authUser!.id;
      const accessToken = request.authToken!;
      try {
        const [existing, profile] = await Promise.all([
          weightPlanRepository.get({ userId, accessToken }),
          profileRepository.getProfile(userId, accessToken),
        ]);
        const currentWeightKg = profile.latestMeasurement?.weightKg ?? null;
        if (currentWeightKg === null)
          return reply
            .code(400)
            .send(badRequest('Log your current weight before setting a plan'));
        // A new or changed target restarts the progress bar from today's weight.
        const startWeightKg =
          existing && existing.targetWeightKg === parsed.data.target_weight_kg
            ? existing.startWeightKg
            : currentWeightKg;
        const saved = await weightPlanRepository.save({
          userId,
          accessToken,
          sex: parsed.data.sex,
          targetWeightKg: parsed.data.target_weight_kg,
          pace: parsed.data.pace,
          startWeightKg,
        });
        return { plan: saved };
      } catch (error) {
        request.log.warn(
          {
            repositoryError:
              error instanceof WeightPlanRepositoryError ||
              isProfileRepositoryError(error),
          },
          'Unable to save weight plan',
        );
        return reply.code(502).send(badGateway('Unable to save weight plan'));
      }
    },
  );
}
