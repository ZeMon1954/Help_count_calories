import { z } from 'zod';

export const nutritionAnalysisSchema = z
  .object({
    sex: z.enum(['male', 'female']),
    age: z.number().int().min(13).max(100),
    weight_kg: z.number().min(30).max(500),
    height_cm: z.number().min(100).max(250),
    activity_level: z.enum([
      'sedentary',
      'lightly_active',
      'moderately_active',
      'very_active',
    ]),
    goal: z.enum(['lose_fat', 'build_muscle', 'maintain']),
  })
  .strict();

export type NutritionAnalysisInput = z.infer<typeof nutritionAnalysisSchema>;
