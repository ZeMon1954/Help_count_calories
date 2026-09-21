import { apiRequest } from './client';

export type GoalType = 'lose_fat' | 'build_muscle' | 'maintain';
export type ActivityLevel =
  'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';
export type TrainingLocation = 'home' | 'gym' | 'both';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Equipment =
  | 'bodyweight'
  | 'dumbbells'
  | 'resistance_bands'
  | 'barbell'
  | 'bench'
  | 'machines';

export interface OnboardingInput {
  displayName: string;
  birthDate: string | null;
  heightCm: number | null;
  startingWeightKg: number | null;
  goalType: GoalType;
  activityLevel: ActivityLevel | null;
  workoutDays: number;
  trainingLocation: TrainingLocation;
  experienceLevel: ExperienceLevel;
  availableEquipment: Equipment[];
}

export type ProfileUpdateInput = Omit<OnboardingInput, 'startingWeightKg'>;

export interface ProfileSnapshot {
  profile: {
    displayName: string | null;
    birthDate: string | null;
    heightCm: number | null;
    activityLevel: ActivityLevel | null;
    onboardingCompleted: boolean;
  } | null;
  currentGoal: {
    goalType: GoalType;
    workoutDays: number | null;
    startedAt: string;
  } | null;
  latestMeasurement: {
    weightKg: number;
    recordedAt: string;
  } | null;
  workoutPreferences: {
    trainingLocation: TrainingLocation;
    experienceLevel: ExperienceLevel;
    availableEquipment: Equipment[];
  } | null;
}

export async function fetchProfile(accessToken: string) {
  return (
    await apiRequest<ProfileSnapshot>('profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).data;
}

export async function saveOnboarding(
  accessToken: string,
  input: OnboardingInput,
) {
  return (
    await apiRequest<ProfileSnapshot>('onboarding', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  ).data;
}

export async function saveProfile(
  accessToken: string,
  input: ProfileUpdateInput,
) {
  return (
    await apiRequest<ProfileSnapshot>('profile', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  ).data;
}
