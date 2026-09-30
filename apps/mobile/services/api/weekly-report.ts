import { apiRequest } from './client';
import { localDateString } from './food';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
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

export interface WeeklyReport {
  hasPlan: boolean;
  targets: {
    dailyBurn: number;
    targetDeficit: number;
    zone: { minDeficit: number; maxDeficit: number };
  } | null;
  weeks: WeekReport[];
}

export async function fetchWeeklyReport(accessToken: string, weeks = 8) {
  const query = new URLSearchParams({
    date: localDateString(),
    weeks: String(weeks),
    timezone_offset_minutes: String(-new Date().getTimezoneOffset()),
  });
  return (
    await apiRequest<WeeklyReport>(`weekly-report?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).data;
}
