import { z } from 'zod';

export const unitsSchema = z.object({ units: z.enum(['metric', 'imperial']) }).strict();
export const nutritionTargetsSchema = z.object({
  calories: z.number().int().min(500).max(10_000),
  protein_g: z.number().min(0).max(1_000),
  carbs_g: z.number().min(0).max(2_000),
  fat_g: z.number().min(0).max(1_000),
}).strict();
export const reminderSchema = z.object({
  type: z.enum(['meal', 'workout', 'weight']),
  title: z.string().trim().min(1).max(120),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  days_of_week: z.array(z.number().int().min(1).max(7)).min(1),
  enabled: z.boolean(),
}).strict();
export const reminderParamsSchema = z.object({ id: z.uuid() });
