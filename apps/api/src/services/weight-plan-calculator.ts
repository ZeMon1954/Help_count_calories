export type Sex = 'male' | 'female';
export type Pace = 'easy' | 'normal' | 'fast';

export interface WeightPlan {
  sex: Sex;
  targetWeightKg: number;
  startWeightKg: number;
  pace: Pace;
}

export interface DailyIntake {
  date: string;
  consumed: number;
  exerciseCalories: number;
}

export interface WeightPlanInputs {
  plan: WeightPlan;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel?: ActivityLevel | null;
  currentWeightKg: number | null;
  today: string;
  daily: DailyIntake[];
  weightHistory: { weightKg: number; recordedAt: string }[];
}

export type TodayStatus = 'within' | 'slightly_over' | 'over';

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

export const KCAL_PER_KG = 7_700;
export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active';
// Logged workouts are added on top of the daily burn, so the base factor is
// capped at "lightly active" to avoid counting the same exercise twice.
const BASE_ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.375,
  very_active: 1.375,
};
const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = 'lightly_active';
const PACE_KG_PER_WEEK: Record<Pace, number> = {
  easy: 0.25,
  normal: 0.5,
  fast: 0.75,
};
const ZONE_HALF_WIDTH = 150;
const OVER_TOLERANCE = 150;

const round = (value: number) => Math.round(value);
const round2 = (value: number) => Math.round(value * 100) / 100;

export function ageFromBirthDate(birthDate: string, today: string) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate()))
    age -= 1;
  return age;
}

export function calculateBmr(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}) {
  return round(
    10 * input.weightKg +
      6.25 * input.heightCm -
      5 * input.age +
      (input.sex === 'male' ? 5 : -161),
  );
}

export function missingPlanFields(input: {
  birthDate: string | null;
  heightCm: number | null;
  currentWeightKg: number | null;
}) {
  const missing: string[] = [];
  if (!input.birthDate) missing.push('birthDate');
  if (!input.heightCm) missing.push('heightCm');
  if (!input.currentWeightKg) missing.push('currentWeightKg');
  return missing;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function calculateWeightPlan(
  input: WeightPlanInputs,
): WeightPlanSummary | null {
  const { plan, birthDate, heightCm, currentWeightKg } = input;
  if (!birthDate || !heightCm || !currentWeightKg) return null;
  const age = ageFromBirthDate(birthDate, input.today);
  if (age < 18) return null;

  const bmr = calculateBmr({
    sex: plan.sex,
    weightKg: currentWeightKg,
    heightCm,
    age,
  });
  const dailyBurn = round(
    bmr * BASE_ACTIVITY_FACTOR[input.activityLevel ?? DEFAULT_ACTIVITY_LEVEL],
  );
  const minimumIntake = Math.max(
    bmr,
    plan.sex === 'male' ? 1_500 : 1_200,
  );
  const maxSafeDeficit = Math.max(0, dailyBurn - minimumIntake);
  const paceKgPerWeek = PACE_KG_PER_WEEK[plan.pace];
  const wantedDeficit = round((paceKgPerWeek * KCAL_PER_KG) / 7);
  const targetDeficit = Math.min(wantedDeficit, maxSafeDeficit);
  const safetyAdjusted = targetDeficit < wantedDeficit;
  const zone = {
    minDeficit: Math.max(0, targetDeficit - ZONE_HALF_WIDTH),
    maxDeficit: Math.min(maxSafeDeficit, targetDeficit + ZONE_HALF_WIDTH),
  };

  const todayRow = input.daily.find((row) => row.date === input.today);
  const consumed = round(todayRow?.consumed ?? 0);
  const exerciseCalories = round(todayRow?.exerciseCalories ?? 0);
  const burnToday = dailyBurn + exerciseCalories;
  const budget = burnToday - targetDeficit;
  const status: TodayStatus =
    consumed <= budget
      ? 'within'
      : consumed <= budget + OVER_TOLERANCE
        ? 'slightly_over'
        : 'over';

  // Days with a food log only: a missing log is not "ate nothing".
  const tracked = input.daily
    .filter((row) => row.consumed > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sortedWeights = [...input.weightHistory].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt),
  );
  const anchorKg = sortedWeights[0]?.weightKg ?? plan.startWeightKg;
  let cumulativeDeficit = 0;
  const series = tracked.map((row) => {
    cumulativeDeficit += dailyBurn + row.exerciseCalories - row.consumed;
    const actual =
      [...sortedWeights]
        .reverse()
        .find((weight) => weight.recordedAt.slice(0, 10) <= row.date)
        ?.weightKg ?? anchorKg;
    return {
      date: row.date,
      estimatedKg: round2(anchorKg - cumulativeDeficit / KCAL_PER_KG),
      actualKg: round2(actual),
    };
  });

  const totalToLose = plan.startWeightKg - plan.targetWeightKg;
  const lostSoFar = plan.startWeightKg - currentWeightKg;
  const progressPercent =
    totalToLose > 0
      ? Math.max(0, Math.min(100, round((lostSoFar / totalToLose) * 100)))
      : currentWeightKg <= plan.targetWeightKg
        ? 100
        : 0;
  const remainingKg = Math.max(0, round2(currentWeightKg - plan.targetWeightKg));
  const estimatedDate =
    remainingKg > 0 && paceKgPerWeek > 0 && targetDeficit > 0
      ? addDays(
          input.today,
          Math.ceil(
            (remainingKg * KCAL_PER_KG) / Math.max(1, targetDeficit),
          ),
        )
      : null;

  return {
    bmr,
    dailyBurn,
    pace: plan.pace,
    paceKgPerWeek,
    targetDeficit,
    zone,
    safetyAdjusted,
    today: {
      consumed,
      exerciseCalories,
      budget,
      remaining: budget - consumed,
      burn: burnToday,
      deficitIfStopNow: burnToday - consumed,
      status,
    },
    goal: {
      startWeightKg: plan.startWeightKg,
      currentWeightKg,
      targetWeightKg: plan.targetWeightKg,
      progressPercent,
      remainingKg,
      estimatedDate,
    },
    projection: {
      estimatedLossKg: round2(cumulativeDeficit / KCAL_PER_KG),
      daysTracked: tracked.length,
      series,
    },
  };
}
