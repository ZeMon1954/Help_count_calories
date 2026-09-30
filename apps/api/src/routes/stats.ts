import { weeklyReportQuerySchema } from '../schemas/weekly-report.js';
import { isProfileRepositoryError } from '../services/profile-repository.js';
import {
  buildWeeklyReports,
  mondayOf,
  shiftDate,
} from '../services/weekly-report.js';
import { WeeklyReportRepositoryError } from '../services/weekly-report-repository.js';
import {
  calculateWeightPlan,
  missingPlanFields,
  planTargetsFor,
} from '../services/weight-plan-calculator.js';
import { WeightPlanRepositoryError } from '../services/weight-plan-repository.js';

import type { RouteContext } from './types.js';

const PLAN_WINDOW_DAYS = 30;
const CHART_WINDOW_DAYS = 30;

/**
 * One request for the whole stats screen. The weekly table, the plan summary
 * and the weight history are all derived from a single read of the user's
 * food logs, activities and weights, so the profile and logs are fetched once
 * instead of once per widget.
 */
export function registerStatsRoutes(context: RouteContext) {
  const {
    app,
    profileRepository,
    weightPlanRepository,
    weeklyReportRepository,
  } = context;

  app.get(
    '/api/stats',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = weeklyReportQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid stats query',
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
        const birthDate = profile.profile?.birthDate ?? null;
        const heightCm = profile.profile?.heightCm ?? null;
        const activityLevel = profile.profile?.activityLevel ?? null;
        const currentWeightKg = profile.latestMeasurement?.weightKg ?? null;
        const missing = missingPlanFields({
          birthDate,
          heightCm,
          currentWeightKg,
        });
        const targets = plan
          ? planTargetsFor({
              plan,
              birthDate,
              heightCm,
              activityLevel,
              currentWeightKg,
              today: date,
            })
          : null;
        const reports = buildWeeklyReports({
          today: date,
          weeks,
          timezoneOffsetMinutes: offsetMinutes,
          targets,
          ...raw,
        });

        const planFrom = shiftDate(date, -(PLAN_WINDOW_DAYS - 1));
        const daily = reports
          .flatMap((week) => week.days)
          .filter((day) => day.date >= planFrom && day.date <= date)
          .map((day) => ({
            date: day.date,
            consumed: day.consumed,
            exerciseCalories: day.exerciseCalories,
          }));
        const chartFrom = Date.parse(
          `${shiftDate(date, -(CHART_WINDOW_DAYS - 1))}T00:00:00Z`,
        ) - offsetMs;
        const weightHistory = raw.measurements
          .filter((row) => Date.parse(row.recordedAt) >= chartFrom)
          .map((row) => ({
            id: row.id ?? row.recordedAt,
            weightKg: row.weightKg,
            recordedAt: row.recordedAt,
          }));
        const summary =
          plan && missing.length === 0
            ? calculateWeightPlan({
                plan,
                birthDate,
                heightCm,
                activityLevel,
                currentWeightKg,
                today: date,
                daily,
                weightHistory,
              })
            : null;

        return {
          plan,
          missing,
          currentWeightKg,
          summary,
          weightHistory,
          weekly: { hasPlan: targets !== null, targets, weeks: reports },
        };
      } catch (error) {
        request.log.warn(
          {
            repositoryError:
              error instanceof WeeklyReportRepositoryError ||
              error instanceof WeightPlanRepositoryError ||
              isProfileRepositoryError(error),
          },
          'Unable to load stats',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load stats',
        });
      }
    },
  );
}
