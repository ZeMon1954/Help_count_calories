import { z } from 'zod';

const finiteNonnegative = z.number().finite().min(0).max(100_000);

export const aiFoodItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    estimated_quantity_g: z.number().finite().positive().max(10_000),
    calories: finiteNonnegative,
    protein_g: finiteNonnegative,
    carbs_g: finiteNonnegative,
    fat_g: finiteNonnegative,
  })
  .strict();

export const aiFoodAnalysisSchema = z
  .object({
    is_food: z.boolean(),
    food_name: z.string().trim().max(160),
    items: z.array(aiFoodItemSchema).max(12),
    confidence: z.enum(['low', 'medium', 'high']),
    warnings: z.array(z.string().trim().min(1).max(300)).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.is_food && value.food_name.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['food_name'],
        message: 'A food image must have a food name',
      });
    if (value.is_food && value.items.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'A food image must contain at least one item',
      });
  });

export type AiFoodAnalysis = z.infer<typeof aiFoodAnalysisSchema>;
export type AiFoodItem = z.infer<typeof aiFoodItemSchema>;

export interface FoodAnalysisItem extends AiFoodItem {
  nutrition_source: 'ai_estimate';
}

export interface FoodAnalysisResult {
  food_name: string;
  items: FoodAnalysisItem[];
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  confidence: AiFoodAnalysis['confidence'];
  warnings: string[];
  nutrition_source: 'ai_estimate';
}

export function buildFoodAnalysisResult(
  analysis: AiFoodAnalysis,
): FoodAnalysisResult {
  const round = (value: number) => Math.round(value * 10) / 10;
  const items = analysis.items.map((item) => ({
    ...item,
    nutrition_source: 'ai_estimate' as const,
  }));
  const total = items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein_g: sum.protein_g + item.protein_g,
      carbs_g: sum.carbs_g + item.carbs_g,
      fat_g: sum.fat_g + item.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  return {
    food_name: analysis.food_name,
    items,
    total: {
      calories: round(total.calories),
      protein_g: round(total.protein_g),
      carbs_g: round(total.carbs_g),
      fat_g: round(total.fat_g),
    },
    confidence: analysis.confidence,
    warnings: analysis.warnings,
    nutrition_source: 'ai_estimate',
  };
}
