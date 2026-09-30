import { KCAL_PER_KG } from './weight-plan-calculator.js';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface RawFoodLog {
  eatenAt: string;
  mealType: MealType;
  items: { name: string; calories: number }[];
}

export interface RawActivity {
  endedAt: string;
  calories: number;
}

export interface RawMeasurement {
  id?: string;
  weightKg: number;
  recordedAt: string;
}

export interface PlanTargets {
  dailyBurn: number;
  targetDeficit: number;
  zone: { minDeficit: number; maxDeficit: number };
}

export type DayStatus =
  | 'future'
  | 'today'
  | 'no_data'
  | 'in_zone'
  | 'over_budget'
  | 'too_low'
  | 'no_plan';

export interface ReportDay {
  date: string;
  weekday: number;
  isToday: boolean;
  meals: { mealType: MealType; name: string; calories: number }[];
  consumed: number;
  exerciseCalories: number;
  budget: number | null;
  deficit: number | null;
  status: DayStatus;
}

export interface WeekReport {
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  days: ReportDay[];
  summary: {
    daysLogged: number;
    daysCounted: number;
    daysInZone: number;
    totalConsumed: number;
    averageConsumed: number | null;
    exerciseCalories: number;
    totalDeficit: number | null;
    estimatedLossKg: number | null;
    weightStartKg: number | null;
    weightEndKg: number | null;
    weightChangeKg: number | null;
  };
}

const DAY_MS = 86_400_000;
const round = (value: number) => Math.round(value);
const round2 = (value: number) => Math.round(value * 100) / 100;
const mealOrder: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Monday of the ISO week containing `date` (YYYY-MM-DD). */
export function mondayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

export function localDateOf(iso: string, timezoneOffsetMinutes: number) {
  return new Date(Date.parse(iso) + timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function buildWeeklyReports(input: {
  today: string;
  weeks: number;
  timezoneOffsetMinutes: number;
  targets: PlanTargets | null;
  foodLogs: RawFoodLog[];
  activities: RawActivity[];
  measurements: RawMeasurement[];
}): WeekReport[] {
  const { today, targets, timezoneOffsetMinutes: offset } = input;
  const meals = new Map<string, ReportDay['meals']>();
  for (const log of [...input.foodLogs].sort((a, b) =>
    a.eatenAt.localeCompare(b.eatenAt),
  )) {
    const date = localDateOf(log.eatenAt, offset);
    const list = meals.get(date) ?? [];
    for (const item of log.items)
      list.push({
        mealType: log.mealType,
        name: item.name,
        calories: round(item.calories),
      });
    meals.set(date, list);
  }
  const exercise = new Map<string, number>();
  for (const activity of input.activities) {
    const date = localDateOf(activity.endedAt, offset);
    exercise.set(date, (exercise.get(date) ?? 0) + activity.calories);
  }
  const weights = input.measurements
    .map((row) => ({
      date: localDateOf(row.recordedAt, offset),
      at: row.recordedAt,
      weightKg: row.weightKg,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

  const currentMonday = mondayOf(today);
  const reports: WeekReport[] = [];
  for (let index = 0; index < input.weeks; index += 1) {
    const weekStart = shiftDate(currentMonday, -7 * index);
    const days: ReportDay[] = Array.from({ length: 7 }, (_, weekday) => {
      const date = shiftDate(weekStart, weekday);
      const dayMeals = [...(meals.get(date) ?? [])].sort(
        (a, b) => mealOrder[a.mealType] - mealOrder[b.mealType],
      );
      const consumed = round(
        dayMeals.reduce((sum, meal) => sum + meal.calories, 0),
      );
      const exerciseCalories = round(exercise.get(date) ?? 0);
      const isToday = date === today;
      const logged = dayMeals.length > 0;
      let status: DayStatus;
      let budget: number | null = null;
      let deficit: number | null = null;
      if (targets) {
        const burn = targets.dailyBurn + exerciseCalories;
        budget = burn - targets.targetDeficit;
        if (logged) deficit = burn - consumed;
      }
      if (date > today) status = 'future';
      else if (isToday) status = 'today';
      else if (!logged) status = 'no_data';
      else if (!targets || deficit === null) status = 'no_plan';
      else if (deficit < targets.zone.minDeficit) status = 'over_budget';
      else if (deficit > targets.zone.maxDeficit) status = 'too_low';
      else status = 'in_zone';
      return {
        date,
        weekday,
        isToday,
        meals: dayMeals,
        consumed,
        exerciseCalories,
        budget,
        deficit,
        status,
      };
    });

    const weekEnd = days[6]!.date;
    const logged = days.filter((day) => day.meals.length > 0);
    // Today is still in progress, so it is left out of deficit totals.
    const counted = logged.filter((day) => day.date < today);
    const totalDeficit =
      targets && counted.length
        ? counted.reduce((sum, day) => sum + (day.deficit ?? 0), 0)
        : null;
    const inWeek = weights.filter(
      (weight) => weight.date >= weekStart && weight.date <= weekEnd,
    );
    const first = inWeek[0];
    const last = inWeek[inWeek.length - 1];
    const totalConsumed = round(
      logged.reduce((sum, day) => sum + day.consumed, 0),
    );
    reports.push({
      weekStart,
      weekEnd,
      isCurrent: index === 0,
      days,
      summary: {
        daysLogged: logged.length,
        daysCounted: counted.length,
        daysInZone: days.filter((day) => day.status === 'in_zone').length,
        totalConsumed,
        averageConsumed: logged.length
          ? round(totalConsumed / logged.length)
          : null,
        exerciseCalories: round(
          days.reduce((sum, day) => sum + day.exerciseCalories, 0),
        ),
        totalDeficit: totalDeficit === null ? null : round(totalDeficit),
        estimatedLossKg:
          totalDeficit === null ? null : round2(totalDeficit / KCAL_PER_KG),
        weightStartKg: first ? round2(first.weightKg) : null,
        weightEndKg: last ? round2(last.weightKg) : null,
        weightChangeKg:
          first && last && inWeek.length > 1
            ? round2(last.weightKg - first.weightKg)
            : null,
      },
    });
  }
  return reports;
}
