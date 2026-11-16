import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, SectionTitle, colors } from '../components/ui';
import { deleteEntry, listAllAnswers, listEntries, listQuestions, listReminders } from '../db';
import { addDays, formatDateLabel, formatTime, fromDateKey, toDateKey } from '../dates';
import { Answer, Entry, Question, Reminder } from '../types';

interface Props {
  refreshKey: number;
  onStartSurvey: (date: string) => void;
}

export default function HomeScreen({ refreshKey, onStartSurvey }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [picking, setPicking] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    (async () => {
      const [e, a, q, r] = await Promise.all([
        listEntries(),
        listAllAnswers(),
        listQuestions({ includeDeleted: true }),
        listReminders(),
      ]);
      setEntries(e);
      setAnswers(a);
      setQuestions(q);
      setReminders(r);
    })();
  }, [refreshKey, localRefresh]);

  const today = toDateKey();
  const yesterday = addDays(today, -1);
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries]);
  const answersByEntry = useMemo(() => {
    const m = new Map<number, Answer[]>();
    for (const a of answers) {
      if (!m.has(a.entryId)) m.set(a.entryId, []);
      m.get(a.entryId)!.push(a);
    }
    return m;
  }, [answers]);
  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const todayEntry = byDate.get(today);
  const todayDone = !!todayEntry?.completedAt;

  // 연속 기록일 (오늘 아직 안 했으면 어제부터 센다)
  const streak = useMemo(() => {
    let d = todayDone ? today : yesterday;
    let n = 0;
    while (byDate.get(d)?.completedAt) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }, [byDate, today, yesterday, todayDone]);

  const nextReminder = reminders.find((r) => r.enabled);
  const outcomeQs = questions.filter((q) => q.role === 'outcome' && q.type === 'scale' && !q.deleted).slice(0, 4);

  function onPickDate(e: DateTimePickerEvent, d?: Date) {
    if (Platform.OS === 'android') setPicking(false);
    if (e.type === 'set' && d) {
      setPicking(false);
      onStartSurvey(toDateKey(d));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.hero}>
        <Text style={styles.heroDate}>{formatDateLabel(today)}</Text>
        <Text style={styles.heroTitle}>{todayDone ? '오늘 기록을 마쳤어요 ✅' : '오늘의 컨디션을 기록해 주세요'}</Text>
        <Button
          title={todayDone ? '오늘 기록 수정' : todayEntry ? '이어서 기록하기' : '오늘 기록하기'}
          variant={todayDone ? 'secondary' : 'primary'}
          onPress={() => onStartSurvey(today)}
          style={{ marginTop: 16 }}
        />
        <View style={styles.stats}>
          <Stat label="연속 기록" value={`${streak}일`} />
          <Stat label="총 기록" value={`${entries.length}일`} />
          <Stat label="알림" value={nextReminder ? formatTime(nextReminder.hour, nextReminder.minute) : '꺼짐'} />
        </View>
      </Card>

      <View style={styles.inline}>
        {!byDate.get(yesterday)?.completedAt && (
          <Button title="어제 기록 채우기" variant="secondary" onPress={() => onStartSurvey(yesterday)} style={{ flex: 1 }} />
        )}
        <Button title="다른 날짜 기록" variant="secondary" onPress={() => setPicking(true)} style={{ flex: 1 }} />
      </View>
      {picking && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onPickDate}
        />
      )}

      <SectionTitle>기록</SectionTitle>
      {entries.length === 0 && <Text style={styles.empty}>아직 기록이 없어요.</Text>}
      {entries.map((e) => {
        const ans = answersByEntry.get(e.id) ?? [];
        const m = new Map(ans.filter((a) => a.value !== '').map((a) => [a.questionId, a.value]));
        return (
          <Pressable key={e.id} onPress={() => setDetail(e)}>
            <Card style={styles.entryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryDate}>{formatDateLabel(e.date)}</Text>
                <Text style={styles.entryMeta}>
                  {e.completedAt ? '완료' : '미완료'} · {ans.length}개 응답
                </Text>
              </View>
              <View style={styles.scoreRow}>
                {outcomeQs.map((q) => (
                  <View key={q.id} style={styles.score}>
                    <Text style={styles.scoreVal}>{m.get(q.id) ?? '-'}</Text>
                    <Text style={styles.scoreLabel} numberOfLines={1}>
                      {shortLabel(q)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </Pressable>
        );
      })}

      <Modal visible={detail !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetail(null)}>
        {detail && (
          <EntryDetail
            entry={detail}
            answers={answersByEntry.get(detail.id) ?? []}
            qById={qById}
            onClose={() => setDetail(null)}
            onEdit={() => {
              setDetail(null);
              onStartSurvey(detail.date);
            }}
            onDelete={() => {
              Alert.alert('기록 삭제', `${formatDateLabel(detail.date)} 기록을 삭제할까요?`, [
                { text: '취소', style: 'cancel' },
                {
                  text: '삭제',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteEntry(detail.id);
                    setDetail(null);
                    setLocalRefresh((n) => n + 1);
                  },
                },
              ]);
            }}
          />
        )}
      </Modal>
    </ScrollView>
  );
}

function shortLabel(q: Question): string {
  const map: Record<string, string> = { body_condition: '몸', mood: '기분', stress: '스트레스', focus: '집중' };
  return map[q.key] ?? q.category;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function formatAnswer(q: Question | undefined, value: string): string {
  if (value === '') return '(답 없음)';
  if (!q) return value;
  if (q.type === 'yesno') return value === '1' ? '예' : '아니오';
  if (q.type === 'number' && q.unit) return `${value} ${q.unit}`;
  if (q.type === 'scale') return `${value} / ${q.max}`;
  return value;
}

function EntryDetail({
  entry,
  answers,
  qById,
  onClose,
  onEdit,
  onDelete,
}: {
  entry: Entry;
  answers: Answer[];
  qById: Map<number, Question>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sorted = [...answers].sort((a, b) => (qById.get(a.questionId)?.sortOrder ?? 0) - (qById.get(b.questionId)?.sortOrder ?? 0));
  const completed = entry.completedAt ? fromDateKey(entry.completedAt.slice(0, 10)) : null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.detailHeader}>
        <Button title="닫기" variant="ghost" onPress={onClose} />
        <Text style={styles.detailTitle}>{formatDateLabel(entry.date)}</Text>
        <Button title="수정" variant="ghost" textStyle={{ color: colors.primary }} onPress={onEdit} />
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.entryMeta}>
          {entry.completedAt ? `완료: ${entry.completedAt.slice(0, 16).replace('T', ' ')}` : '미완료'}
          {completed && toDateKey(completed) !== entry.date ? ' (나중에 입력함)' : ''}
        </Text>
        {sorted.map((a) => {
          const q = qById.get(a.questionId);
          return (
            <Card key={a.questionId}>
              <Text style={styles.entryMeta}>{q?.text ?? '(삭제된 질문)'}</Text>
              <Text style={styles.answerVal}>{formatAnswer(q, a.value)}</Text>
              {a.note ? <Text style={styles.note}>비고: {a.note}</Text> : null}
            </Card>
          );
        })}
        <Button title="이 날짜 기록 삭제" variant="danger" onPress={onDelete} style={{ marginTop: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  hero: { padding: 20 },
  heroDate: { color: colors.sub, fontWeight: '600' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 6 },
  stats: { flexDirection: 'row', marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 16 },
  statVal: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.sub, marginTop: 2 },
  inline: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  empty: { color: colors.sub, textAlign: 'center', marginTop: 24 },
  entryRow: { flexDirection: 'row', alignItems: 'center' },
  entryDate: { fontSize: 16, fontWeight: '700', color: colors.text },
  entryMeta: { fontSize: 13, color: colors.sub, marginTop: 2 },
  scoreRow: { flexDirection: 'row', gap: 10 },
  score: { alignItems: 'center', width: 40 },
  scoreVal: { fontSize: 17, fontWeight: '700', color: colors.primary },
  scoreLabel: { fontSize: 10, color: colors.sub },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  detailTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  note: { fontSize: 14, color: colors.sub, marginTop: 6, lineHeight: 20 },
  answerVal: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 6 },
});
