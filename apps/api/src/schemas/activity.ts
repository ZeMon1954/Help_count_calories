import { z } from 'zod';

export const activityTypeSchema = z.enum(['walk', 'run', 'cycle']);
export const activityParamsSchema = z.object({ activityId: z.uuid() });
export const activityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const createActivitySchema = z
  .object({ activity_type: activityTypeSchema })
  .strict();
export const updateActivityStatusSchema = z
  .object({ status: z.enum(['in_progress', 'paused']) })
  .strict();
export const activityPointSchema = z
  .object({
    sequence: z.number().int().min(0),
    recorded_at: z.iso.datetime({ offset: true }),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy_m: z.number().min(0).max(10_000).nullable(),
    altitude_m: z.number().min(-1_000).max(20_000).nullable(),
    speed_mps: z.number().min(0).max(150).nullable(),
  })
  .strict();
export const appendActivityPointsSchema = z
  .object({ points: z.array(activityPointSchema).min(1).max(100) })
  .strict();

// A run imported from another app (e.g. a Strava screenshot) only carries
// distance and moving time; the server derives pace and calories from them.
export const importRunSchema = z
  .object({
    distance_m: z.number().finite().min(100).max(100_000),
    duration_seconds: z.number().int().min(60).max(86_400),
    ended_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => value.distance_m / value.duration_seconds <= 12, {
    message: 'Speed is not realistic for a run',
    path: ['duration_seconds'],
  });

export const aiRunSummarySchema = z
  .object({
    is_run_summary: z.boolean(),
    distance_km: z.number().finite().min(0).max(1_000),
    duration_seconds: z.number().finite().min(0).max(172_800),
    confidence: z.enum(['low', 'medium', 'high']),
    warnings: z.array(z.string().trim().min(1).max(300)).max(8),
  })
  .strict();

export type ActivityType = z.infer<typeof activityTypeSchema>;
export type ActivityPointInput = z.infer<typeof activityPointSchema>;
export type ImportRunInput = z.infer<typeof importRunSchema>;
