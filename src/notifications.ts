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

/**
 * 안드로이드 12+에서 '정확한 알람' 권한이 없으면 OS가 절전 중에 알림을 미뤄서
 * 앱을 열 때서야 울리는 문제가 생긴다. 권한이 있으면 알람시계 방식(alarmClock)으로 예약한다.
 */
export async function hasExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function requestExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** 알림이 실제로 오는지 확인하기 위한 1회성 테스트 알림 */
export async function scheduleTestNotification(seconds: number): Promise<void> {
  await ensurePermission();
  const exact = await hasExactAlarmPermission();
  const at = new Date(Date.now() + seconds * 1000);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '테스트 알림 ✅',
      body: '이 알림이 보이면 정상이에요. 눌러서 설문을 열 수 있어요.',
      data: { type: SURVEY_NOTIFICATION_TYPE, test: true },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
      ...(exact ? { delivery: 'alarmClock' as const } : {}),
    },
  });
}

/** DB에 저장된 알림 시각과 실제 예약된 OS 알림을 일치시킨다. */
export async function syncReminders(): Promise<{ granted: boolean; exact: boolean; scheduled: number }> {
  const granted = await ensurePermission();
  const exact = await hasExactAlarmPermission();
  // 테스트 알림은 남겨 두고 매일 알림만 다시 예약한다.
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    if (!n.content.data?.test) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
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
        delivery: exact ? 'alarmClock' : 'bestEffort',
      },
    });
    await setReminderNotificationId(r.id, id);
    scheduled++;
  }
  return { granted, exact, scheduled };
}

export function isSurveyNotification(response: Notifications.NotificationResponse | null | undefined): boolean {
  return response?.notification.request.content.data?.type === SURVEY_NOTIFICATION_TYPE;
}
