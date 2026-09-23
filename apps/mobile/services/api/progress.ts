import { apiRequest } from './client';

export interface ProgressSnapshot {
  weightHistory: { id: string; weightKg: number; recordedAt: string }[];
  calorieAdherence: {
    target: number | null;
    daysLogged: number;
    daysWithinTarget: number;
    percentage: number | null;
  };
  calorieBalance: {
    totalConsumed: number;
    totalTarget: number | null;
    difference: number | null;
    averageConsumed: number | null;
    exerciseCalories: number;
    daysTracked: number;
    daily: {
      date: string;
      consumed: number;
      target: number | null;
      difference: number | null;
      exerciseCalories: number;
    }[];
  };
}

function headers(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchProgress(accessToken: string, days: 7 | 30 | 90) {
  const query = new URLSearchParams({
    days: String(days),
    timezone_offset_minutes: String(-new Date().getTimezoneOffset()),
  });
  return (
    await apiRequest<ProgressSnapshot>(`progress?${query.toString()}`, {
      headers: headers(accessToken),
    })
  ).data;
}

export async function saveWeight(accessToken: string, weightKg: number) {
  return (
    await apiRequest<{ id: string; weightKg: number; recordedAt: string }>(
      'measurements',
      {
        method: 'POST',
        headers: {
          ...headers(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ weight_kg: weightKg, waist_cm: null }),
      },
    )
  ).data;
}
