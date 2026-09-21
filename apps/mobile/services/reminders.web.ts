import type { ReminderRecord } from './api/settings';

export function configureNotifications() {}

export async function syncLocalReminders(reminders: ReminderRecord[]) {
  void reminders;
  throw new Error('web_push_not_configured');
}
