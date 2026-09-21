import { apiRequest } from './client';

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  description: string | null;
  instructions: string | null;
  equipment: string | null;
  difficulty: string;
  mediaUrl: string | null;
  safetyNotes: string | null;
  sortOrder: number;
  targetSets: number | null;
  targetReps: string | null;
  restSeconds: number | null;
}

export interface WorkoutDay {
  id: string;
  dayOfWeek: number;
  name: string | null;
  isRestDay: boolean;
  exercises: WorkoutExercise[];
}

export interface ActiveWorkoutPlan {
  id: string;
  name: string;
  goalType: string | null;
  source: 'ai' | 'manual';
  days: WorkoutDay[];
}

export interface WorkoutSession {
  id: string;
  planDayId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: 'in_progress' | 'completed';
  notes: string | null;
}

export interface WorkoutSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  completed: boolean;
}

export interface ActiveWorkoutSession extends WorkoutSession { sets: WorkoutSet[] }

function headers(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchActiveWorkout(accessToken: string) {
  return (
    await apiRequest<{ plan: ActiveWorkoutPlan | null }>('workouts/active', {
      headers: headers(accessToken),
    })
  ).data.plan;
}

export async function fetchWorkoutHistory(accessToken: string, limit = 20) {
  return (
    await apiRequest<{ items: WorkoutSession[] }>(
      `workouts/history?limit=${limit}`,
      { headers: headers(accessToken) },
    )
  ).data.items;
}

export async function createDefaultWorkoutPlan(accessToken: string) {
  return (
    await apiRequest<{ planId: string }>('workouts/default-plan', {
      method: 'POST',
      headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
      body: '{}',
    })
  ).data;
}

export async function startWorkoutSession(
  accessToken: string,
  planDayId: string | null,
) {
  return (
    await apiRequest<WorkoutSession>('workout-sessions', {
      method: 'POST',
      headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_day_id: planDayId }),
    })
  ).data;
}

export async function fetchCurrentWorkoutSession(accessToken: string) {
  return (await apiRequest<{ session: ActiveWorkoutSession | null }>('workout-sessions/current', {
    headers: headers(accessToken),
  })).data.session;
}

export async function saveWorkoutSet(
  accessToken: string,
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  completed: boolean,
  reps: number | null = null,
  weightKg: number | null = null,
) {
  return (
    await apiRequest<unknown>(
      `workout-sessions/${sessionId}/sets/${exerciseId}/${setNumber}`,
      {
        method: 'PUT',
        headers: {
          ...headers(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reps,
          weight_kg: weightKg,
          duration_seconds: null,
          completed,
        }),
      },
    )
  ).data;
}

export async function finishWorkoutSession(
  accessToken: string,
  sessionId: string,
) {
  return (
    await apiRequest<WorkoutSession>(`workout-sessions/${sessionId}/finish`, {
      method: 'POST',
      headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: null }),
    })
  ).data;
}
