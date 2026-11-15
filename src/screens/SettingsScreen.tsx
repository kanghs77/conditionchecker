import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, SectionTitle, colors } from '../components/ui';
import { addReminder, deleteReminder, listReminders, updateReminder } from '../db';
import { formatTime } from '../dates';
import { ExportKind, exportData } from '../export';
import { syncReminders } from '../notifications';
import { Reminder } from '../types';

type PickerTarget = { mode: 'new' } | { mode: 'edit'; reminder: Reminder };

const EXPORTS: { kind: ExportKind; title: string; desc: string }[] = [
  {
    kind: 'llm',
    title: '🤖 LLM 분석용 파일 (.md)',
    desc: '분석 요청문 + 변수 설명 + 일별 데이터가 한 파일에. ChatGPT·Claude 등에 그대로 첨부하세요.',
  },
  { kind: 'wide', title: '📊 일별 표 (CSV)', desc: '날짜 1행 × 질문 1열. 엑셀·구글시트 분석용.' },
  { kind: 'long', title: '🧾 전체 응답 원본 (CSV)', desc: '답변 1개당 1행, 응답 시각 포함.' },
  { kind: 'dictionary', title: '📖 질문 목록 (CSV)', desc: '변수명, 질문, 형식, 값의 의미.' },
  { kind: 'backup', title: '💾 전체 백업 (JSON)', desc: '모든 테이블을 그대로. 보관용.' },
];

export default function SettingsScreen() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerTime, setPickerTime] = useState(new Date());
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const reload = useCallback(async () => setReminders(await listReminders()), []);

  const resync = useCallback(async () => {
    const { granted } = await syncReminders();
    setPermissionDenied(!granted);
    await reload();
  }, [reload]);

  useEffect(() => {
    resync();
  }, [resync]);

  function openPicker(target: PickerTarget) {
    const d = new Date();
    if (target.mode === 'edit') d.setHours(target.reminder.hour, target.reminder.minute, 0, 0);
    else d.setHours(21, 30, 0, 0);
    setPickerTime(d);
    setPicker(target);
  }

  async function commitTime(d: Date, target: PickerTarget) {
    if (target.mode === 'new') await addReminder(d.getHours(), d.getMinutes());
    else await updateReminder(target.reminder.id, { hour: d.getHours(), minute: d.getMinutes() });
    setPicker(null);
    await resync();
  }

  function onPickerChange(e: DateTimePickerEvent, d?: Date) {
    if (!picker) return;
    if (Platform.OS === 'android') {
      // 안드로이드는 다이얼로그에서 확인/취소를 누르면 바로 닫힌다.
      if (e.type === 'set' && d) commitTime(d, picker);
      else setPicker(null);
    } else if (d) {
      setPickerTime(d);
    }
  }

  async function runExport(kind: ExportKind) {
    try {
      setBusy(kind);
      await exportData(kind);
    } catch (err) {
      Alert.alert('내보내기 실패', String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle>알림 시각</SectionTitle>
      {permissionDenied && (
        <Card style={{ backgroundColor: '#FFF6E5' }}>
          <Text style={styles.warn}>알림 권한이 꺼져 있어 알림이 울리지 않아요.</Text>
          <Button title="설정에서 알림 허용하기" variant="secondary" onPress={() => Linking.openSettings()} style={{ marginTop: 10 }} />
        </Card>
      )}
      {reminders.map((r) => (
        <Card key={r.id} style={styles.row}>
          <Pressable style={{ flex: 1 }} onPress={() => openPicker({ mode: 'edit', reminder: r })}>
            <Text style={[styles.time, !r.enabled && { color: colors.sub }]}>{formatTime(r.hour, r.minute)}</Text>
            <Text style={styles.meta}>매일 · 눌러서 시간 변경</Text>
          </Pressable>
          <Switch
            value={r.enabled}
            onValueChange={async (v) => {
              await updateReminder(r.id, { enabled: v });
              await resync();
            }}
          />
          <Pressable
            hitSlop={8}
            onPress={async () => {
              await deleteReminder(r.id);
              await resync();
            }}
          >
            <Text style={{ color: colors.no, marginLeft: 12 }}>삭제</Text>
          </Pressable>
        </Card>
      ))}
      <Button title="+ 알림 시각 추가" variant="secondary" onPress={() => openPicker({ mode: 'new' })} />

      {picker && (
        <Card style={{ marginTop: 12 }}>
          <DateTimePicker
            value={pickerTime}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onPickerChange}
          />
          {Platform.OS === 'ios' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="취소" variant="ghost" onPress={() => setPicker(null)} style={{ flex: 1 }} />
              <Button title="저장" onPress={() => commitTime(pickerTime, picker)} style={{ flex: 1 }} />
            </View>
          )}
        </Card>
      )}

      <SectionTitle>데이터 내보내기</SectionTitle>
      {EXPORTS.map((x) => (
        <Pressable key={x.kind} onPress={() => runExport(x.kind)} disabled={busy !== null}>
          <Card style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.exportTitle}>{x.title}</Text>
              <Text style={styles.meta}>{x.desc}</Text>
            </View>
            {busy === x.kind ? <ActivityIndicator /> : <Text style={styles.chev}>›</Text>}
          </Card>
        </Pressable>
      ))}
      <Text style={styles.note}>모든 기록은 이 휴대폰 안에만 저장됩니다. 정기적으로 백업 파일을 내보내 두세요.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 28, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.sub, marginTop: 2, lineHeight: 18 },
  warn: { color: '#8A5A00', fontWeight: '600' },
  exportTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chev: { fontSize: 26, color: colors.sub, marginLeft: 8 },
  note: { color: colors.sub, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
