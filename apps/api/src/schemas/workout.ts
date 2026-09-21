import { z } from 'zod';

export const workoutHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const startWorkoutSessionSchema = z
  .object({ plan_day_id: z.uuid().nullable() })
  .strict();

export const workoutSessionParamsSchema = z.object({ sessionId: z.uuid() });

export const workoutSetParamsSchema = z.object({
  sessionId: z.uuid(),
  exerciseId: z.uuid(),
  setNumber: z.coerce.number().int().min(1).max(100),
});

export const saveWorkoutSetSchema = z
  .object({
    reps: z.number().int().min(0).max(10_000).nullable().default(null),
    weight_kg: z.number().min(0).max(5_000).nullable().default(null),
    duration_seconds: z.number().int().min(0).max(86_400).nullable().default(null),
    completed: z.boolean(),
  })
  .strict();

export const finishWorkoutSessionSchema = z
  .object({ notes: z.string().trim().max(2_000).nullable().default(null) })
  .strict();
