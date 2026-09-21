import { apiRequest } from './client';

export type NutritionGoal = 'lose_fat' | 'build_muscle' | 'maintain';
export type NutritionActivity = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';

export interface NutritionAnalysisInput {
  sex: 'male' | 'female';
  age: number;
  weight_kg: number;
  height_cm: number;
  activity_level: NutritionActivity;
  goal: NutritionGoal;
}

export interface NutritionAnalysisResult {
  bmr: number;
  tdee: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  weekly_weight_change_kg: number;
  explanation: string;
  tips: string[];
  ai_generated: boolean;
}

export async function analyzeNutrition(token: string, input: NutritionAnalysisInput) {
  return (await apiRequest<NutritionAnalysisResult>('nutrition/analyze', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })).data;
}
