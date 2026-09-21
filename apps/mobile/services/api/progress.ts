import { apiRequest } from './client';

export interface ProgressSnapshot {
  weightHistory: { id: string; weightKg: number; recordedAt: string }[];
  calorieAdherence: {
    target: number | null;
    daysLogged: number;
    daysWithinTarget: number;
    percentage: number | null;
  };
}

function headers(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchProgress(accessToken: string, days: 7 | 30 | 90) {
  return (
    await apiRequest<ProgressSnapshot>(`progress?days=${days}`, {
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
