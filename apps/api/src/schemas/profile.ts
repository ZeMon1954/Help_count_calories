import { z } from 'zod';

export const goalTypeSchema = z.enum(['lose_fat', 'build_muscle', 'maintain']);
export const activityLevelSchema = z.enum([
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
]);
export const trainingLocationSchema = z.enum(['home', 'gym', 'both']);
export const experienceLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);
export const equipmentSchema = z.enum([
  'bodyweight',
  'dumbbells',
  'resistance_bands',
  'barbell',
  'bench',
  'machines',
]);

export const onboardingSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    birthDate: z.iso.date().nullable().optional(),
    heightCm: z.number().positive().max(300).nullable().optional(),
    startingWeightKg: z.number().positive().max(500).nullable().optional(),
    goalType: goalTypeSchema,
    activityLevel: activityLevelSchema.nullable().optional(),
    workoutDays: z.number().int().min(0).max(7),
    trainingLocation: trainingLocationSchema,
    experienceLevel: experienceLevelSchema,
    availableEquipment: z.array(equipmentSchema).max(6).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.birthDate) return;
    const date = new Date(`${value.birthDate}T00:00:00Z`);
    const earliest = new Date('1900-01-01T00:00:00Z');
    if (Number.isNaN(date.valueOf()) || date < earliest || date > new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'Birth date must be between 1900-01-01 and today',
      });
    }
  });

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    birthDate: z.iso.date().nullable(),
    heightCm: z.number().positive().max(300).nullable(),
    goalType: goalTypeSchema,
    activityLevel: activityLevelSchema.nullable(),
    workoutDays: z.number().int().min(0).max(7),
    trainingLocation: trainingLocationSchema,
    experienceLevel: experienceLevelSchema,
    availableEquipment: z.array(equipmentSchema).max(6),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.birthDate) return;
    const date = new Date(`${value.birthDate}T00:00:00Z`);
    const earliest = new Date('1900-01-01T00:00:00Z');
    if (Number.isNaN(date.valueOf()) || date < earliest || date > new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'Birth date must be between 1900-01-01 and today',
      });
    }
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
