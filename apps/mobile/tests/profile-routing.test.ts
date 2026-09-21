import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProfileRoute } from '../utils/profile-routing.js';

test('logged-out users route to login', () => {
  assert.equal(
    resolveProfileRoute({
      authenticated: false,
      loading: false,
      error: false,
      onboardingCompleted: false,
    }),
    'login',
  );
});

test('authentication initialization remains on loading before redirecting', () => {
  assert.equal(
    resolveProfileRoute({
      authenticated: false,
      loading: true,
      error: false,
      onboardingCompleted: false,
    }),
    'loading',
  );
});

test('incomplete onboarding routes to onboarding instead of Home', () => {
  assert.equal(
    resolveProfileRoute({
      authenticated: true,
      loading: false,
      error: false,
      onboardingCompleted: false,
    }),
    'onboarding',
  );
});

test('completed onboarding routes to Home', () => {
  assert.equal(
    resolveProfileRoute({
      authenticated: true,
      loading: false,
      error: false,
      onboardingCompleted: true,
    }),
    'home',
  );
});

test('network errors remain errors and do not route to onboarding', () => {
  assert.equal(
    resolveProfileRoute({
      authenticated: true,
      loading: false,
      error: true,
      onboardingCompleted: false,
    }),
    'error',
  );
});
