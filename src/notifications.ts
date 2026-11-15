import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { listReminders, setReminderNotificationId } from './db';

const CHANNEL_ID = 'daily-check';
export const SURVEY_NOTIFICATION_TYPE = 'daily-survey';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '컨디션 체크 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** DB에 저장된 알림 시각과 실제 예약된 OS 알림을 일치시킨다. */
export async function syncReminders(): Promise<{ granted: boolean; scheduled: number }> {
  const granted = await ensurePermission();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const reminders = await listReminders();
  let scheduled = 0;
  for (const r of reminders) {
    if (!granted || !r.enabled) {
      await setReminderNotificationId(r.id, null);
      continue;
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '컨디션 체크할 시간이에요 📝',
        body: '눌러서 오늘의 질문에 답해 주세요.',
        data: { type: SURVEY_NOTIFICATION_TYPE },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: r.hour,
        minute: r.minute,
        channelId: CHANNEL_ID,
      },
    });
    await setReminderNotificationId(r.id, id);
    scheduled++;
  }
  return { granted, scheduled };
}

export function isSurveyNotification(response: Notifications.NotificationResponse | null | undefined): boolean {
  return response?.notification.request.content.data?.type === SURVEY_NOTIFICATION_TYPE;
}
