import type {
  FoodAnalysisItem,
  FoodAnalysisResult,
} from '@/services/api/food-analysis';

const round = (value: number) => Math.round(value * 10) / 10;

export function scaleAnalysisItem(
  original: FoodAnalysisItem,
  quantityG: number,
): FoodAnalysisItem {
  const safeQuantity = Number.isFinite(quantityG)
    ? Math.max(1, Math.min(10_000, quantityG))
    : original.estimated_quantity_g;
  const ratio = safeQuantity / original.estimated_quantity_g;
  return {
    ...original,
    estimated_quantity_g: safeQuantity,
    calories: round(original.calories * ratio),
    protein_g: round(original.protein_g * ratio),
    carbs_g: round(original.carbs_g * ratio),
    fat_g: round(original.fat_g * ratio),
  };
}

export function totalAnalysisItems(
  items: FoodAnalysisItem[],
): FoodAnalysisResult['total'] {
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
    calories: round(total.calories),
    protein_g: round(total.protein_g),
    carbs_g: round(total.carbs_g),
    fat_g: round(total.fat_g),
  };
}
