export type ProfileRouteState =
  'login' | 'loading' | 'error' | 'onboarding' | 'home';

export function resolveProfileRoute(input: {
  authenticated: boolean;
  loading: boolean;
  error: boolean;
  onboardingCompleted: boolean;
}): ProfileRouteState {
  if (!input.authenticated) return 'login';
  if (input.loading) return 'loading';
  if (input.error) return 'error';
  return input.onboardingCompleted ? 'home' : 'onboarding';
}
