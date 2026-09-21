import { z } from 'zod';

export const progressQuerySchema = z.object({
  days: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value)),
});

export const createMeasurementSchema = z
  .object({
    weight_kg: z.number().positive().max(500),
    waist_cm: z.number().positive().max(500).nullable().default(null),
    recorded_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
