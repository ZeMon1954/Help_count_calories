import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import {
  buildWeeklyReports,
  localDateOf,
  mondayOf,
  shiftDate,
} from '../src/services/weekly-report.js';
import type { WeeklyReportRepository } from '../src/services/weekly-report-repository.js';

const targets = {
  dailyBurn: 2400,
  targetDeficit: 500,
  zone: { minDeficit: 350, maxDeficit: 650 },
};

// 2026-09-30 is a Wednesday, so its week starts on Monday 2026-09-28.
const today = '2026-09-30';

const log = (
  eatenAt: string,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  ...items: [string, number][]
) => ({
  eatenAt,
  mealType,
  items: items.map(([name, calories]) => ({ name, calories })),
});

test('week helpers use Monday as the first day', () => {
  assert.equal(mondayOf('2026-09-30'), '2026-09-28');
  assert.equal(mondayOf('2026-09-28'), '2026-09-28');
  assert.equal(mondayOf('2026-10-04'), '2026-09-28');
  assert.equal(mondayOf('2026-10-05'), '2026-10-05');
  assert.equal(shiftDate('2026-09-28', -7), '2026-09-21');
  assert.equal(localDateOf('2026-09-28T18:00:00.000Z', 420), '2026-09-29');
});

test('days get meals, deficit and a status against the zone', () => {
  const [week] = buildWeeklyReports({
    today,
    weeks: 1,
    timezoneOffsetMinutes: 0,
    targets,
    activities: [{ endedAt: '2026-09-29T10:00:00.000Z', calories: 200 }],
    measurements: [],
    foodLogs: [
      // Mon: burn 2400, ate 1900 -> deficit 500 -> in zone
      log('2026-09-28T12:00:00.000Z', 'lunch', ['ข้าวมันไก่', 700]),
      log('2026-09-28T07:00:00.000Z', 'breakfast', ['ไข่ต้ม', 200], ['กาแฟ', 50]),
      log('2026-09-28T19:00:00.000Z', 'dinner', ['ต้มยำ', 950]),
      // Tue: burn 2600 (with 200 exercise), ate 2500 -> deficit 100 -> over budget
      log('2026-09-29T12:00:00.000Z', 'lunch', ['พิซซ่า', 2500]),
    ],
  });
  const [mon, tue, wed, thu] = week!.days;
  assert.deepEqual(
    mon!.meals.map((meal) => meal.name),
    ['ไข่ต้ม', 'กาแฟ', 'ข้าวมันไก่', 'ต้มยำ'],
  );
  assert.equal(mon!.consumed, 1900);
  assert.equal(mon!.deficit, 500);
  assert.equal(mon!.status, 'in_zone');
  assert.equal(tue!.exerciseCalories, 200);
  assert.equal(tue!.budget, 2100);
  assert.equal(tue!.deficit, 100);
  assert.equal(tue!.status, 'over_budget');
  assert.equal(wed!.status, 'today');
  assert.equal(thu!.status, 'future');
});

test('eating far below the zone is flagged as too low', () => {
  const [week] = buildWeeklyReports({
    today,
    weeks: 1,
    timezoneOffsetMinutes: 0,
    targets,
    activities: [],
    measurements: [],
    foodLogs: [log('2026-09-28T12:00:00.000Z', 'lunch', ['สลัด', 1000])],
  });
  assert.equal(week!.days[0]!.status, 'too_low');
  assert.equal(week!.days[1]!.status, 'no_data');
});

test('week summary skips today and reports estimated loss and weight change', () => {
  const [week] = buildWeeklyReports({
    today,
    weeks: 1,
    timezoneOffsetMinutes: 0,
    targets,
    activities: [],
    foodLogs: [
      log('2026-09-28T12:00:00.000Z', 'lunch', ['a', 1900]),
      log('2026-09-29T12:00:00.000Z', 'lunch', ['b', 1900]),
      log('2026-09-30T08:00:00.000Z', 'breakfast', ['c', 300]),
    ],
    measurements: [
      { weightKg: 80, recordedAt: '2026-09-28T01:00:00.000Z' },
      { weightKg: 79.4, recordedAt: '2026-09-30T01:00:00.000Z' },
    ],
  });
  const summary = week!.summary;
  assert.equal(summary.daysLogged, 3);
  assert.equal(summary.daysCounted, 2);
  assert.equal(summary.daysInZone, 2);
  assert.equal(summary.totalConsumed, 4100);
  assert.equal(summary.averageConsumed, 1367);
  assert.equal(summary.totalDeficit, 1000);
  assert.equal(summary.estimatedLossKg, 0.13);
  assert.equal(summary.weightChangeKg, -0.6);
});

test('previous weeks are kept, newest first', () => {
  const reports = buildWeeklyReports({
    today,
    weeks: 3,
    timezoneOffsetMinutes: 0,
    targets,
    activities: [],
    measurements: [],
    foodLogs: [
      log('2026-09-22T12:00:00.000Z', 'lunch', ['last week', 1900]),
      log('2026-09-15T12:00:00.000Z', 'lunch', ['two weeks ago', 1800]),
    ],
  });
  assert.deepEqual(
    reports.map((week) => [week.weekStart, week.isCurrent]),
    [
      ['2026-09-28', true],
      ['2026-09-21', false],
      ['2026-09-14', false],
    ],
  );
  assert.equal(reports[1]!.days[1]!.meals[0]!.name, 'last week');
  assert.equal(reports[1]!.summary.daysInZone, 1);
  assert.equal(reports[2]!.days[1]!.consumed, 1800);
  assert.equal(reports[0]!.summary.totalDeficit, null);
});

test('without a plan days are listed but not graded', () => {
  const [week] = buildWeeklyReports({
    today,
    weeks: 1,
    timezoneOffsetMinutes: 0,
    targets: null,
    activities: [],
    measurements: [],
    foodLogs: [log('2026-09-28T12:00:00.000Z', 'lunch', ['x', 1500])],
  });
  assert.equal(week!.days[0]!.status, 'no_plan');
  assert.equal(week!.days[0]!.deficit, null);
  assert.equal(week!.summary.totalDeficit, null);
});

const emptyRepository: WeeklyReportRepository = {
  async getRaw() {
    return { foodLogs: [], activities: [], measurements: [] };
  },
};

test('weekly report endpoint requires auth and validates input', async () => {
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), {
    verifyAccessToken: async () => ({ id: 'verified-user', email: null }),
    weeklyReportRepository: emptyRepository,
  });
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/weekly-report?date=2026-09-30' }))
      .statusCode,
    401,
  );
  const headers = { authorization: 'Bearer token' };
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/weekly-report?date=x', headers }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/api/weekly-report?date=2026-09-30&weeks=99',
        headers,
      })
    ).statusCode,
    400,
  );
  await app.close();
});
