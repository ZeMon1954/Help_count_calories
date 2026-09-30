import { apiRequest } from './client';
import { localDateString } from './food';
import type { WeeklyReport } from './weekly-report';
import type { WeightPlanSnapshot } from './weight-plan';

export interface StatsSnapshot extends WeightPlanSnapshot {
  weekly: WeeklyReport;
}

/** Everything the stats screen needs, in one request. */
export async function fetchStats(accessToken: string, weeks = 8) {
  const query = new URLSearchParams({
    date: localDateString(),
    weeks: String(weeks),
    timezone_offset_minutes: String(-new Date().getTimezoneOffset()),
  });
  return (
    await apiRequest<StatsSnapshot>(`stats?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).data;
}
