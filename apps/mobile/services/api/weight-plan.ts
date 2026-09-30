import { apiRequest } from './client';
import { localDateString } from './food';

export type Sex = 'male' | 'female';
export type Pace = 'easy' | 'normal' | 'fast';
export type TodayStatus = 'within' | 'slightly_over' | 'over';

export interface WeightPlan {
  sex: Sex;
  targetWeightKg: number;
  startWeightKg: number;
  pace: Pace;
}

export interface WeightPlanSummary {
  bmr: number;
  dailyBurn: number;
  pace: Pace;
  paceKgPerWeek: number;
  targetDeficit: number;
  zone: { minDeficit: number; maxDeficit: number };
  safetyAdjusted: boolean;
  today: {
    consumed: number;
    exerciseCalories: number;
    budget: number;
    remaining: number;
    burn: number;
    deficitIfStopNow: number;
    status: TodayStatus;
  };
  goal: {
    startWeightKg: number;
    currentWeightKg: number;
    targetWeightKg: number;
    progressPercent: number;
    remainingKg: number;
    estimatedDate: string | null;
  };
  projection: {
    estimatedLossKg: number;
    daysTracked: number;
    series: { date: string; estimatedKg: number; actualKg: number }[];
  };
}

export interface WeightPlanSnapshot {
  plan: WeightPlan | null;
  missing: string[];
  currentWeightKg: number | null;
  summary: WeightPlanSummary | null;
  weightHistory: { id: string; weightKg: number; recordedAt: string }[];
}

export interface WeightPlanInput {
  sex: Sex;
  targetWeightKg: number;
  pace: Pace;
}

const headers = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export async function fetchWeightPlan(accessToken: string) {
  const query = new URLSearchParams({
    date: localDateString(),
    timezone_offset_minutes: String(-new Date().getTimezoneOffset()),
  });
  return (
    await apiRequest<WeightPlanSnapshot>(`weight-plan?${query.toString()}`, {
      headers: headers(accessToken),
    })
  ).data;
}

export async function saveWeightPlan(
  accessToken: string,
  input: WeightPlanInput,
) {
  return (
    await apiRequest<{ plan: WeightPlan }>('weight-plan', {
      method: 'PUT',
      headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sex: input.sex,
        target_weight_kg: input.targetWeightKg,
        pace: input.pace,
      }),
    })
  ).data.plan;
}

export const paceOptions: {
  value: Pace;
  label: string;
  detail: string;
}[] = [
  { value: 'easy', label: 'สบาย', detail: '0.25 กก./สัปดาห์' },
  { value: 'normal', label: 'ปกติ', detail: '0.5 กก./สัปดาห์' },
  { value: 'fast', label: 'เร่ง', detail: '0.75 กก./สัปดาห์' },
];
