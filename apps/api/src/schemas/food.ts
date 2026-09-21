import { z } from 'zod';

export const foodSearchSchema = z.object({
  search: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const createFoodSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    serving_size_g: z.number().positive().max(10_000),
    calories: z.number().min(0).max(100_000),
    protein_g: z.number().min(0).max(10_000).default(0),
    carbs_g: z.number().min(0).max(10_000).default(0),
    fat_g: z.number().min(0).max(10_000).default(0),
  })
  .strict();

export const diaryDateSchema = z.object({
  date: z.iso.date(),
  timezone_offset_minutes: z.coerce.number().int().min(-840).max(840),
});

export const foodItemParamsSchema = z.object({
  id: z.uuid(),
});

export const logCatalogFoodSchema = z
  .object({
    food_id: z.uuid(),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    quantity_g: z.number().positive().max(100_000),
    eaten_at: z.iso.datetime({ offset: true }),
    client_request_id: z.uuid(),
  })
  .strict();

export const updateFoodLogItemSchema = z
  .object({ quantity_g: z.number().positive().max(100_000) })
  .strict();

export type CreateFoodInput = z.infer<typeof createFoodSchema>;
export type LogCatalogFoodInput = z.infer<typeof logCatalogFoodSchema>;
