import type { Env } from '../config/env.js';
import type {
  OnboardingInput,
  ProfileUpdateInput,
} from '../schemas/profile.js';

export interface ProfileSnapshot {
  profile: {
    displayName: string | null;
    birthDate: string | null;
    heightCm: number | null;
    activityLevel: OnboardingInput['activityLevel'];
    onboardingCompleted: boolean;
  } | null;
  currentGoal: {
    goalType: OnboardingInput['goalType'];
    workoutDays: number | null;
    startedAt: string;
  } | null;
  latestMeasurement: {
    weightKg: number;
    recordedAt: string;
  } | null;
  workoutPreferences: {
    trainingLocation: OnboardingInput['trainingLocation'];
    experienceLevel: OnboardingInput['experienceLevel'];
    availableEquipment: OnboardingInput['availableEquipment'];
  } | null;
}

export interface ProfileRepository {
  getProfile(userId: string, accessToken: string): Promise<ProfileSnapshot>;
  completeOnboarding(
    userId: string,
    accessToken: string,
    input: OnboardingInput,
  ): Promise<ProfileSnapshot>;
  updateProfile(
    userId: string,
    accessToken: string,
    input: ProfileUpdateInput,
  ): Promise<ProfileSnapshot>;
}

class SupabaseRequestError extends Error {
  constructor(readonly status: number) {
    super('Supabase request failed');
  }
}

const activityFromDatabase = {
  sedentary: 'sedentary',
  light: 'lightly_active',
  moderate: 'moderately_active',
  active: 'very_active',
  very_active: 'very_active',
} as const;

const activityToDatabase = {
  sedentary: 'sedentary',
  lightly_active: 'light',
  moderately_active: 'moderate',
  very_active: 'very_active',
} as const;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createProfileRepository(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): ProfileRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return {
      async getProfile() {
        throw new SupabaseRequestError(503);
      },
      async completeOnboarding() {
        throw new SupabaseRequestError(503);
      },
      async updateProfile() {
        throw new SupabaseRequestError(503);
      },
    };
  }

  const baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const request = async <T>(
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> => {
    const response = await fetchImplementation(`${baseUrl}/${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new SupabaseRequestError(response.status);
    return (await response.json()) as T;
  };

  const getProfile = async (
    userId: string,
    accessToken: string,
  ): Promise<ProfileSnapshot> => {
    const userFilter = encodeURIComponent(`eq.${userId}`);
    const [profiles, goals, measurements, preferences] = await Promise.all([
      request<Record<string, unknown>[]>(
        `profiles?select=display_name,birth_date,height_cm,activity_level,onboarding_completed&id=${userFilter}&limit=1`,
        accessToken,
      ),
      request<Record<string, unknown>[]>(
        `user_goals?select=goal_type,workout_days,started_at,ended_at&user_id=${userFilter}&ended_at=is.null&order=started_at.desc&limit=1`,
        accessToken,
      ),
      request<Record<string, unknown>[]>(
        `body_measurements?select=weight_kg,recorded_at&user_id=${userFilter}&order=recorded_at.desc&limit=1`,
        accessToken,
      ),
      request<Record<string, unknown>[]>(
        `user_workout_preferences?select=training_location,experience_level,available_equipment&user_id=${userFilter}&limit=1`,
        accessToken,
      ),
    ]);

    const profile = profiles[0];
    const goal = goals[0];
    const measurement = measurements[0];
    const preference = preferences[0];
    const storedActivity = profile?.activity_level;

    return {
      profile: profile
        ? {
            displayName:
              typeof profile.display_name === 'string'
                ? profile.display_name
                : null,
            birthDate:
              typeof profile.birth_date === 'string'
                ? profile.birth_date
                : null,
            heightCm: numberOrNull(profile.height_cm),
            activityLevel:
              typeof storedActivity === 'string' &&
              storedActivity in activityFromDatabase
                ? activityFromDatabase[
                    storedActivity as keyof typeof activityFromDatabase
                  ]
                : null,
            onboardingCompleted: profile.onboarding_completed === true,
          }
        : null,
      currentGoal: goal
        ? {
            goalType: goal.goal_type as OnboardingInput['goalType'],
            workoutDays: numberOrNull(goal.workout_days),
            startedAt: String(goal.started_at),
          }
        : null,
      latestMeasurement: measurement
        ? {
            weightKg: Number(measurement.weight_kg),
            recordedAt: String(measurement.recorded_at),
          }
        : null,
      workoutPreferences: preference
        ? {
            trainingLocation:
              preference.training_location as OnboardingInput['trainingLocation'],
            experienceLevel:
              preference.experience_level as OnboardingInput['experienceLevel'],
            availableEquipment: Array.isArray(preference.available_equipment)
              ? (preference.available_equipment as OnboardingInput['availableEquipment'])
              : [],
          }
        : null,
    };
  };

  return {
    getProfile,
    async completeOnboarding(userId, accessToken, input) {
      const result = await request<boolean>(
        'rpc/complete_onboarding',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_data: {
              display_name: input.displayName,
              birth_date: input.birthDate ?? null,
              height_cm: input.heightCm ?? null,
              weight_kg: input.startingWeightKg ?? null,
              goal_type: input.goalType,
              activity_level: input.activityLevel
                ? activityToDatabase[input.activityLevel]
                : null,
              workout_days: input.workoutDays,
              training_location: input.trainingLocation,
              experience_level: input.experienceLevel,
              available_equipment: [...new Set(input.availableEquipment)],
            },
          }),
        },
      );
      if (result !== true) throw new SupabaseRequestError(502);
      return getProfile(userId, accessToken);
    },
    async updateProfile(userId, accessToken, input) {
      const result = await request<boolean>(
        'rpc/update_profile_settings',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_data: {
              display_name: input.displayName,
              birth_date: input.birthDate,
              height_cm: input.heightCm,
              goal_type: input.goalType,
              activity_level: input.activityLevel
                ? activityToDatabase[input.activityLevel]
                : null,
              workout_days: input.workoutDays,
              training_location: input.trainingLocation,
              experience_level: input.experienceLevel,
              available_equipment: [...new Set(input.availableEquipment)],
            },
          }),
        },
      );
      if (result !== true) throw new SupabaseRequestError(502);
      return getProfile(userId, accessToken);
    },
  };
}

export function isProfileRepositoryError(error: unknown): boolean {
  return error instanceof SupabaseRequestError;
}
