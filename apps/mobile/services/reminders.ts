import * as Notifications from 'expo-notifications';

import type { ReminderRecord } from './api/settings';

export async function syncLocalReminders(reminders: ReminderRecord[]) {
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('notification permission denied');

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const reminder of reminders.filter((item) => item.enabled)) {
    const [hourText, minuteText] = reminder.time.split(':');
    const hour = Number(hourText); const minute = Number(minuteText);
    for (const weekday of reminder.days_of_week) {
      await Notifications.scheduleNotificationAsync({
        content: { title: reminder.title, body: 'เปิดแอปนับแคลเพื่อบันทึกความคืบหน้าของคุณ' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute },
      });
    }
  }
}
