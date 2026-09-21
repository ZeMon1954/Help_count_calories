import assert from 'node:assert/strict';
import test from 'node:test';

import type { FoodAnalysisItem } from '../services/api/food-analysis';
import { scaleAnalysisItem, totalAnalysisItems } from '../utils/food-analysis';

const original: FoodAnalysisItem = {
  name: 'ข้าวสวย',
  estimated_quantity_g: 200,
  calories: 260,
  protein_g: 5,
  carbs_g: 57,
  fat_g: 1,
  nutrition_source: 'ai_estimate',
};

test('quantity editing recalculates from the original AI estimate', () => {
  const half = scaleAnalysisItem(original, 100);
  assert.deepEqual(half, {
    ...original,
    estimated_quantity_g: 100,
    calories: 130,
    protein_g: 2.5,
    carbs_g: 28.5,
    fat_g: 0.5,
  });

  const restored = scaleAnalysisItem(original, 200);
  assert.deepEqual(restored, original);
});

test('edited item totals are recomputed and rounded once', () => {
  assert.deepEqual(
    totalAnalysisItems([
      scaleAnalysisItem(original, 100),
      {
        ...original,
        name: 'ไข่ดาว',
        estimated_quantity_g: 50,
        calories: 200.06,
        protein_g: 10.04,
        carbs_g: 1.02,
        fat_g: 15.03,
      },
    ]),
    {
      calories: 330.1,
      protein_g: 12.5,
      carbs_g: 29.5,
      fat_g: 15.5,
    },
  );
});
