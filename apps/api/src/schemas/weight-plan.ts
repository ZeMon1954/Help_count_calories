import { z } from 'zod';

export const sexSchema = z.enum(['male', 'female']);
export const paceSchema = z.enum(['easy', 'normal', 'fast']);

export const weightPlanSchema = z
  .object({
    sex: sexSchema,
    target_weight_kg: z.number().min(30).max(500),
    pace: paceSchema,
  })
  .strict();

export const weightPlanQuerySchema = z.object({
  date: z.iso.date(),
  timezone_offset_minutes: z.coerce.number().int().min(-840).max(840).default(0),
});

export type WeightPlanInput = z.infer<typeof weightPlanSchema>;
