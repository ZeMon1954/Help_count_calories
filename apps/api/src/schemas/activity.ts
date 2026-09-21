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

export type ActivityType = z.infer<typeof activityTypeSchema>;
export type ActivityPointInput = z.infer<typeof activityPointSchema>;
