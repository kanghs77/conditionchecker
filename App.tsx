import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/components/ui';
import { getDb } from './src/db';
import { toDateKey } from './src/dates';
import { isSurveyNotification, syncReminders } from './src/notifications';
import HomeScreen from './src/screens/HomeScreen';
import QuestionsScreen from './src/screens/QuestionsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SurveyScreen from './src/screens/SurveyScreen';

type Tab = 'home' | 'questions' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: '홈', icon: '🏠' },
  { id: 'questions', label: '질문', icon: '📝' },
  { id: 'settings', label: '알림·내보내기', icon: '⚙️' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [surveyDate, setSurveyDate] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      await getDb();
      setReady(true);
      await syncReminders();
      // 앱이 꺼져 있을 때 알림을 눌러 실행된 경우
      if (isSurveyNotification(Notifications.getLastNotificationResponse())) {
        setSurveyDate(toDateKey());
        Notifications.clearLastNotificationResponse();
      }
    })();
    // 앱이 켜져 있거나 백그라운드일 때 알림을 누른 경우
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isSurveyNotification(response)) {
        setSurveyDate(toDateKey());
        Notifications.clearLastNotificationResponse();
      }
    });
    return () => sub.remove();
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Text style={styles.title}>{tab === 'home' ? '컨디션 체커' : TABS.find((t) => t.id === tab)!.label}</Text>
        <View style={{ flex: 1 }}>
          {tab === 'home' && <HomeScreen refreshKey={refreshKey} onStartSurvey={setSurveyDate} />}
          {tab === 'questions' && <QuestionsScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </View>
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabIcon, tab !== t.id && { opacity: 0.4 }]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.id && { color: colors.primary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      <Modal
        visible={surveyDate !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSurveyDate(null)}
      >
        {surveyDate && (
          <SafeAreaProvider>
            <SurveyScreen
              date={surveyDate}
              onClose={() => {
                setSurveyDate(null);
                setRefreshKey((k) => k + 1);
              }}
            />
          </SafeAreaProvider>
        )}
      </Modal>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 4 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: colors.sub, marginTop: 2, fontWeight: '600' },
});
