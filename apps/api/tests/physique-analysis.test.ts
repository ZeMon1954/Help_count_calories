import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import type { ProfileRepository } from '../src/services/profile-repository.js';
import type { ProgressRepository } from '../src/services/progress-repository.js';
import type { PhysiqueAnalysisService } from '../src/services/physique-analysis-service.js';

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);

function multipartPayload(content: Buffer) {
  const boundary = 'physique-boundary';
  return {
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="progress.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

const profileRepository: ProfileRepository = {
  async getProfile() {
    return {
      profile: {
        displayName: 'Tester',
        birthDate: '1996-01-01',
        heightCm: 175,
        activityLevel: 'moderately_active',
        onboardingCompleted: true,
      },
      currentGoal: {
        goalType: 'lose_fat',
        workoutDays: 3,
        startedAt: '2026-01-01',
      },
      latestMeasurement: null,
      workoutPreferences: null,
    };
  },
  async completeOnboarding() {
    return this.getProfile('', '');
  },
  async updateProfile() {
    return this.getProfile('', '');
  },
};

const progressRepository: ProgressRepository = {
  async getProgress() {
    return {
      weightHistory: [],
      calorieAdherence: {
        target: null,
        daysLogged: 0,
        daysWithinTarget: 0,
        percentage: null,
      },
      calorieBalance: {
        totalConsumed: 0,
        totalTarget: null,
        difference: null,
        averageConsumed: null,
        exerciseCalories: 0,
        daysTracked: 0,
        daily: [],
      },
    };
  },
  async createMeasurement({ weightKg, recordedAt }) {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      weightKg,
      recordedAt,
    };
  },
};

const physiqueAnalysisService: PhysiqueAnalysisService = {
  async analyze() {
    return {
      photo_suitable: true,
      confidence: 'medium',
      observations: ['ภาพเห็นลำตัวชัด'],
      recommendations: ['ถ่ายภาพในมุมเดิมทุก 2 สัปดาห์'],
      warnings: ['ผลจากภาพเป็นค่าประมาณ'],
    };
  },
};

const dependencies = {
  verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
  profileRepository,
  progressRepository,
  physiqueAnalysisService,
};

test('physique analysis requires authentication and valid inputs', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), dependencies);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/progress/physique-analysis' }))
      .statusCode,
    401,
  );
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/progress/physique-analysis?weight_kg=0&sex=male',
    ...multipartPayload(jpegBytes),
  });
  assert.equal(invalid.statusCode, 400);
  await app.close();
});

test('physique analysis calculates targets and saves verified-user weight', async () => {
  let savedUserId = '';
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    ...dependencies,
    progressRepository: {
      ...progressRepository,
      async createMeasurement(input) {
        savedUserId = input.userId;
        return {
          id: '11111111-1111-4111-8111-111111111111',
          weightKg: input.weightKg,
          recordedAt: input.recordedAt,
        };
      },
    },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/progress/physique-analysis?weight_kg=70&sex=male',
    ...multipartPayload(jpegBytes),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().measurement.weightKg, 70);
  assert.equal(response.json().image_retained, false);
  assert.ok(response.json().nutrition.calories > 0);
  assert.equal(savedUserId, 'verified-user');
  await app.close();
});
