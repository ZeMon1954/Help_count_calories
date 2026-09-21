import { apiRequest } from './client';

export type Units = 'metric' | 'imperial';
export type ReminderType = 'meal' | 'weight';

export interface ReminderRecord {
  id: string;
  type: ReminderType;
  title: string;
  time: string;
  days_of_week: number[];
  enabled: boolean;
}

export interface SettingsSnapshot {
  units: Units;
  targets: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
  reminders: ReminderRecord[];
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export async function fetchSettings(token: string) {
  return (await apiRequest<SettingsSnapshot>('settings', { headers: headers(token) })).data;
}

export async function saveUnits(token: string, units: Units) {
  await apiRequest('settings/units', {
    method: 'PUT', headers: headers(token), body: JSON.stringify({ units }),
  });
}

export async function saveNutritionTargets(token: string, targets: {
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
}) {
  await apiRequest('settings/nutrition-targets', {
    method: 'PUT', headers: headers(token), body: JSON.stringify(targets),
  });
}

export async function createReminder(token: string, reminder: Omit<ReminderRecord, 'id'>) {
  return (await apiRequest<ReminderRecord>('reminders', {
    method: 'POST', headers: headers(token), body: JSON.stringify(reminder),
  })).data;
}

export async function updateReminder(token: string, reminder: ReminderRecord) {
  return (await apiRequest<ReminderRecord>(`reminders/${reminder.id}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify({
      type: reminder.type, title: reminder.title, time: reminder.time,
      days_of_week: reminder.days_of_week, enabled: reminder.enabled,
    }),
  })).data;
}

export async function deleteReminder(token: string, id: string) {
  await apiRequest(`reminders/${id}`, { method: 'DELETE', headers: headers(token) });
}
