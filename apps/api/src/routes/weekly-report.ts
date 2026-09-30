import { weeklyReportQuerySchema } from '../schemas/weekly-report.js';
import { isProfileRepositoryError } from '../services/profile-repository.js';
import {
  buildWeeklyReports,
  mondayOf,
  shiftDate,
} from '../services/weekly-report.js';
import { WeeklyReportRepositoryError } from '../services/weekly-report-repository.js';
import { calculateWeightPlan } from '../services/weight-plan-calculator.js';
import { WeightPlanRepositoryError } from '../services/weight-plan-repository.js';

import type { RouteContext } from './types.js';

export function registerWeeklyReportRoutes(context: RouteContext) {
  const {
    app,
    profileRepository,
    weightPlanRepository,
    weeklyReportRepository,
  } = context;

  app.get(
    '/api/weekly-report',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = weeklyReportQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid weekly report query',
        });
      const {
        date,
        weeks,
        timezone_offset_minutes: offsetMinutes,
      } = parsed.data;
      const userId = request.authUser!.id;
      const accessToken = request.authToken!;
      const offsetMs = offsetMinutes * 60_000;
      const firstDay = shiftDate(mondayOf(date), -7 * (weeks - 1));
      const startUtc = new Date(
        Date.parse(`${firstDay}T00:00:00Z`) - offsetMs,
      ).toISOString();
      const endUtc = new Date(
        Date.parse(`${shiftDate(date, 1)}T00:00:00Z`) - offsetMs,
      ).toISOString();
      try {
        const [plan, profile, raw] = await Promise.all([
          weightPlanRepository.get({ userId, accessToken }),
          profileRepository.getProfile(userId, accessToken),
          weeklyReportRepository.getRaw({
            userId,
            accessToken,
            startUtc,
            endUtc,
          }),
        ]);
        // Targets come from the plan; an empty `daily` is enough to read them.
        const planSummary = plan
          ? calculateWeightPlan({
              plan,
              birthDate: profile.profile?.birthDate ?? null,
              heightCm: profile.profile?.heightCm ?? null,
              activityLevel: profile.profile?.activityLevel ?? null,
              currentWeightKg: profile.latestMeasurement?.weightKg ?? null,
              today: date,
              daily: [],
              weightHistory: [],
            })
          : null;
        const targets = planSummary
          ? {
              dailyBurn: planSummary.dailyBurn,
              targetDeficit: planSummary.targetDeficit,
              zone: planSummary.zone,
            }
          : null;
        return {
          hasPlan: targets !== null,
          targets,
          weeks: buildWeeklyReports({
            today: date,
            weeks,
            timezoneOffsetMinutes: offsetMinutes,
            targets,
            ...raw,
          }),
        };
      } catch (error) {
        request.log.warn(
          {
            repositoryError:
              error instanceof WeeklyReportRepositoryError ||
              error instanceof WeightPlanRepositoryError ||
              isProfileRepositoryError(error),
          },
          'Unable to load weekly report',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load weekly report',
        });
      }
    },
  );
}
