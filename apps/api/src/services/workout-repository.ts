import type { Env } from '../config/env.js';

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

export interface WorkoutHistoryItem {
  id: string;
  planDayId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: 'in_progress' | 'completed';
  notes: string | null;
}

export interface WorkoutSetRecord {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  completed: boolean;
}

export interface ActiveWorkoutSession extends WorkoutHistoryItem {
  sets: WorkoutSetRecord[];
}

export interface WorkoutRepository {
  getActivePlan(input: {
    userId: string;
    accessToken: string;
  }): Promise<ActiveWorkoutPlan | null>;
  getHistory(input: {
    userId: string;
    accessToken: string;
    limit: number;
  }): Promise<WorkoutHistoryItem[]>;
  startSession(input: {
    userId: string;
    accessToken: string;
    planDayId: string | null;
  }): Promise<WorkoutHistoryItem | null>;
  saveSet(input: {
    userId: string;
    accessToken: string;
    sessionId: string;
    exerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
    completed: boolean;
  }): Promise<WorkoutSetRecord | null>;
  finishSession(input: {
    userId: string;
    accessToken: string;
    sessionId: string;
    notes: string | null;
  }): Promise<WorkoutHistoryItem | null>;
  createDefaultPlan(input: { accessToken: string }): Promise<string>;
  getInProgressSession(input:{userId:string;accessToken:string}):Promise<ActiveWorkoutSession|null>;
}

export class WorkoutRepositoryError extends Error {
  constructor(readonly status: number) {
    super('Workout repository request failed');
  }
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createWorkoutRepository(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): WorkoutRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    const unavailable = async () => {
      throw new WorkoutRepositoryError(503);
    };
    return {
      getActivePlan: unavailable,
      getHistory: unavailable,
      startSession: unavailable,
      saveSet: unavailable,
      finishSession: unavailable,
      createDefaultPlan: unavailable,
      getInProgressSession: unavailable,
    };
  }

  const baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const request = async <T>(
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImplementation(`${baseUrl}/${path}`, {
        ...init,
        headers: {
          apikey: env.SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...init?.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WorkoutRepositoryError(502);
    }
    if (!response.ok) throw new WorkoutRepositoryError(response.status);
    return (await response.json()) as T;
  };

  return {
    async getActivePlan({ userId, accessToken }) {
      const planParams = new URLSearchParams({
        select: 'id,name,goal_type,source',
        user_id: `eq.${userId}`,
        status: 'eq.active',
        order: 'created_at.desc',
        limit: '1',
      });
      const plans = await request<Record<string, unknown>[]>(
        `workout_plans?${planParams.toString()}`,
        accessToken,
      );
      const plan = plans[0];
      if (!plan) return null;

      const dayParams = new URLSearchParams({
        select: 'id,day_of_week,name,is_rest_day',
        plan_id: `eq.${String(plan.id)}`,
        order: 'day_of_week.asc',
      });
      const dayRows = await request<Record<string, unknown>[]>(
        `workout_plan_days?${dayParams.toString()}`,
        accessToken,
      );
      const days: WorkoutDay[] = [];
      for (const day of dayRows) {
        const itemParams = new URLSearchParams({
          select:
            'id,exercise_id,sort_order,target_sets,target_reps,rest_seconds,exercise:exercises(id,name,description,instructions,equipment,difficulty,media_url,safety_notes)',
          plan_day_id: `eq.${String(day.id)}`,
          order: 'sort_order.asc',
        });
        const itemRows = await request<Record<string, unknown>[]>(
          `workout_plan_exercises?${itemParams.toString()}`,
          accessToken,
        );
        days.push({
          id: String(day.id),
          dayOfWeek: Number(day.day_of_week),
          name: typeof day.name === 'string' ? day.name : null,
          isRestDay: day.is_rest_day === true,
          exercises: itemRows.map((item) => {
            const exercise = item.exercise as Record<string, unknown>;
            return {
              id: String(item.id),
              exerciseId: String(item.exercise_id),
              name: String(exercise.name),
              description:
                typeof exercise.description === 'string'
                  ? exercise.description
                  : null,
              instructions:
                typeof exercise.instructions === 'string'
                  ? exercise.instructions
                  : null,
              equipment:
                typeof exercise.equipment === 'string'
                  ? exercise.equipment
                  : null,
              difficulty: String(exercise.difficulty),
              mediaUrl:
                typeof exercise.media_url === 'string'
                  ? exercise.media_url
                  : null,
              safetyNotes:
                typeof exercise.safety_notes === 'string'
                  ? exercise.safety_notes
                  : null,
              sortOrder: Number(item.sort_order),
              targetSets: numberOrNull(item.target_sets),
              targetReps:
                typeof item.target_reps === 'string' ? item.target_reps : null,
              restSeconds: numberOrNull(item.rest_seconds),
            };
          }),
        });
      }
      return {
        id: String(plan.id),
        name: String(plan.name),
        goalType:
          typeof plan.goal_type === 'string' ? plan.goal_type : null,
        source: plan.source === 'ai' ? 'ai' : 'manual',
        days,
      };
    },

    async getHistory({ userId, accessToken, limit }) {
      const params = new URLSearchParams({
        select: 'id,plan_day_id,started_at,ended_at,status,notes',
        user_id: `eq.${userId}`,
        status: 'eq.completed',
        order: 'started_at.desc',
        limit: String(limit),
      });
      const rows = await request<Record<string, unknown>[]>(
        `workout_sessions?${params.toString()}`,
        accessToken,
      );
      return rows.map((row) => ({
        id: String(row.id),
        planDayId:
          typeof row.plan_day_id === 'string' ? row.plan_day_id : null,
        startedAt: String(row.started_at),
        endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
        status: row.status === 'completed' ? 'completed' : 'in_progress',
        notes: typeof row.notes === 'string' ? row.notes : null,
      }));
    },

    async startSession({ userId, accessToken, planDayId }) {
      const existing=await request<Record<string,unknown>[]>(`workout_sessions?select=id,plan_day_id,started_at,ended_at,status,notes&user_id=eq.${encodeURIComponent(userId)}&status=eq.in_progress&order=started_at.desc&limit=1`,accessToken);
      if(existing[0]) return mapSession(existing[0]);
      if (planDayId) {
        const visible = await request<Record<string, unknown>[]>(
          `workout_plan_days?select=id&id=eq.${encodeURIComponent(planDayId)}&limit=1`,
          accessToken,
        );
        if (!visible[0]) return null;
      }
      const rows = await request<Record<string, unknown>[]>(
        'workout_sessions',
        accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ user_id: userId, plan_day_id: planDayId }),
        },
      );
      const row = rows[0];
      return row ? mapSession(row) : null;
    },

    async saveSet(input) {
      const sessions = await request<Record<string, unknown>[]>(
        `workout_sessions?select=id&id=eq.${encodeURIComponent(input.sessionId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.in_progress&limit=1`,
        input.accessToken,
      );
      if (!sessions[0]) return null;
      const params = new URLSearchParams({
        on_conflict: 'session_id,exercise_id,set_number',
      });
      const rows = await request<Record<string, unknown>[]>(
        `workout_sets?${params.toString()}`,
        input.accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify({
            session_id: input.sessionId,
            exercise_id: input.exerciseId,
            set_number: input.setNumber,
            reps: input.reps,
            weight_kg: input.weightKg,
            duration_seconds: input.durationSeconds,
            completed: input.completed,
          }),
        },
      );
      const row = rows[0];
      return row
        ? {
            id: String(row.id),
            sessionId: String(row.session_id),
            exerciseId: String(row.exercise_id),
            setNumber: Number(row.set_number),
            reps: numberOrNull(row.reps),
            weightKg: numberOrNull(row.weight_kg),
            durationSeconds: numberOrNull(row.duration_seconds),
            completed: row.completed === true,
          }
        : null;
    },

    async finishSession({ userId, accessToken, sessionId, notes }) {
      const params = new URLSearchParams({
        id: `eq.${sessionId}`,
        user_id: `eq.${userId}`,
        status: 'eq.in_progress',
      });
      const rows = await request<Record<string, unknown>[]>(
        `workout_sessions?${params.toString()}`,
        accessToken,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            status: 'completed',
            ended_at: new Date().toISOString(),
            notes,
          }),
        },
      );
      return rows[0] ? mapSession(rows[0]) : null;
    },

    async createDefaultPlan({ accessToken }) {
      const planId = await request<unknown>(
        'rpc/create_default_workout_plan',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      if (typeof planId !== 'string') throw new WorkoutRepositoryError(502);
      return planId;
    },
    async getInProgressSession({userId,accessToken}) {
      const rows=await request<Record<string,unknown>[]>(`workout_sessions?select=id,plan_day_id,started_at,ended_at,status,notes&user_id=eq.${encodeURIComponent(userId)}&status=eq.in_progress&order=started_at.desc&limit=1`,accessToken);
      if (!rows[0]) return null;
      const current = mapSession(rows[0]);
      const setRows = await request<Record<string, unknown>[]>(
        `workout_sets?select=id,session_id,exercise_id,set_number,reps,weight_kg,duration_seconds,completed&session_id=eq.${encodeURIComponent(current.id)}&order=set_number.asc`,
        accessToken,
      );
      return {
        ...current,
        sets: setRows.map((row) => ({
          id: String(row.id), sessionId: String(row.session_id),
          exerciseId: String(row.exercise_id), setNumber: Number(row.set_number),
          reps: numberOrNull(row.reps), weightKg: numberOrNull(row.weight_kg),
          durationSeconds: numberOrNull(row.duration_seconds), completed: row.completed === true,
        })),
      };
    },
  };
}

function mapSession(row: Record<string, unknown>): WorkoutHistoryItem {
  return {
    id: String(row.id),
    planDayId: typeof row.plan_day_id === 'string' ? row.plan_day_id : null,
    startedAt: String(row.started_at),
    endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
    status: row.status === 'completed' ? 'completed' : 'in_progress',
    notes: typeof row.notes === 'string' ? row.notes : null,
  };
}
