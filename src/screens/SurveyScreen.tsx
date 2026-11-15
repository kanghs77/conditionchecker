import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors } from '../components/ui';
import { clearAnswer, completeEntry, getAnswers, getEntryByDate, getOrCreateEntry, listQuestions, saveAnswer } from '../db';
import { formatDateLabel } from '../dates';
import { Question } from '../types';

interface Props {
  date: string;
  onClose: () => void;
}

export default function SurveyScreen({ date, onClose }: Props) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const entryIdRef = useRef<number | null>(null);
  const advancing = useRef(false);

  useEffect(() => {
    (async () => {
      const qs = (await listQuestions()).filter((q) => q.active);
      const entry = await getEntryByDate(date);
      const prev: Record<number, string> = {};
      if (entry) {
        entryIdRef.current = entry.id;
        for (const a of await getAnswers(entry.id)) prev[a.questionId] = a.value;
      }
      setValues(prev);
      setQuestions(qs);
    })();
  }, [date]);

  const q = questions?.[index];
  const total = questions?.length ?? 0;
  const done = questions !== null && index >= total;

  // 숫자/텍스트 질문으로 이동하면 기존 답을 입력창에 채운다.
  useEffect(() => {
    if (q) setDraft(values[q.id] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  useEffect(() => {
    if (done && entryIdRef.current !== null) completeEntry(entryIdRef.current);
  }, [done]);

  async function ensureEntry(): Promise<number> {
    if (entryIdRef.current === null) entryIdRef.current = (await getOrCreateEntry(date)).id;
    return entryIdRef.current;
  }

  async function answer(value: string, autoAdvance: boolean) {
    if (!q || advancing.current) return;
    if (value === '') return skip();
    advancing.current = true;
    setValues((v) => ({ ...v, [q.id]: value }));
    await saveAnswer(await ensureEntry(), q.id, value);
    if (autoAdvance) await new Promise((r) => setTimeout(r, 180));
    setIndex((i) => i + 1);
    advancing.current = false;
  }

  async function skip() {
    if (!q) return;
    if (values[q.id] !== undefined && entryIdRef.current !== null) {
      await clearAnswer(entryIdRef.current, q.id);
      setValues((v) => {
        const n = { ...v };
        delete n[q.id];
        return n;
      });
    }
    setIndex((i) => i + 1);
  }

  if (questions === null) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (total === 0) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.qText}>활성화된 질문이 없어요.</Text>
        <Text style={styles.sub}>"질문" 탭에서 질문을 추가해 주세요.</Text>
        <Button title="닫기" onPress={onClose} style={{ marginTop: 24, alignSelf: 'stretch' }} />
      </SafeAreaView>
    );
  }

  if (done) {
    const answered = questions.filter((x) => values[x.id] !== undefined).length;
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={{ fontSize: 56 }}>🎉</Text>
        <Text style={styles.qText}>오늘 기록 완료!</Text>
        <Text style={styles.sub}>
          {formatDateLabel(date)} · {answered}/{total}개 응답
        </Text>
        <Button title="닫기" onPress={onClose} style={{ marginTop: 32, alignSelf: 'stretch' }} />
        <Button title="처음부터 다시 보기" variant="ghost" onPress={() => setIndex(0)} style={{ alignSelf: 'stretch' }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <Text style={styles.headerDate}>{formatDateLabel(date)}</Text>
          <Text style={styles.counter}>
            {index + 1} / {total}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.category}>{q!.category}</Text>
          <Text style={styles.qText}>{q!.text}</Text>
          <AnswerInput
            key={q!.id}
            question={q!}
            value={values[q!.id]}
            draft={draft}
            setDraft={setDraft}
            onAnswer={answer}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button title="← 이전" variant="ghost" disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} style={{ flex: 1 }} />
          <Button title="건너뛰기" variant="ghost" onPress={skip} style={{ flex: 1 }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AnswerInput({
  question: q,
  value,
  draft,
  setDraft,
  onAnswer,
}: {
  question: Question;
  value: string | undefined;
  draft: string;
  setDraft: (s: string) => void;
  onAnswer: (v: string, autoAdvance: boolean) => void;
}) {
  const scaleValues = useMemo(() => {
    if (q.type !== 'scale') return [];
    const min = q.min ?? 1;
    const max = q.max ?? 10;
    return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  }, [q]);

  switch (q.type) {
    case 'yesno':
      return (
        <View style={styles.yesnoRow}>
          {[
            { v: '1', label: '예', color: colors.yes },
            { v: '0', label: '아니오', color: colors.no },
          ].map((o) => {
            const on = value === o.v;
            return (
              <Pressable
                key={o.v}
                onPress={() => onAnswer(o.v, true)}
                style={({ pressed }) => [
                  styles.yesnoBtn,
                  { borderColor: o.color },
                  on && { backgroundColor: o.color },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.yesnoText, { color: on ? '#fff' : o.color }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      );

    case 'scale':
      return (
        <View>
          <View style={styles.scaleGrid}>
            {scaleValues.map((n) => {
              const on = value === String(n);
              return (
                <Pressable
                  key={n}
                  onPress={() => onAnswer(String(n), true)}
                  style={({ pressed }) => [styles.scaleBtn, on && styles.scaleBtnOn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.scaleText, on && { color: '#fff' }]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.scaleLegend}>
            <Text style={styles.sub}>낮음</Text>
            <Text style={styles.sub}>높음</Text>
          </View>
        </View>
      );

    case 'choice':
      return (
        <View style={{ gap: 10 }}>
          {q.options.map((opt) => {
            const on = value === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onAnswer(opt, true)}
                style={({ pressed }) => [styles.choiceBtn, on && styles.scaleBtnOn, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.choiceText, on && { color: '#fff' }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      );

    case 'number': {
      const num = Number(draft.replace(',', '.'));
      const valid = draft.trim() !== '' && Number.isFinite(num);
      return (
        <View>
          <View style={styles.numberRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
              style={styles.numberInput}
              returnKeyType="done"
              onSubmitEditing={() => valid && onAnswer(String(num), false)}
            />
            {q.unit ? <Text style={styles.unit}>{q.unit}</Text> : null}
          </View>
          <Button title="다음" disabled={!valid} onPress={() => onAnswer(String(num), false)} style={{ marginTop: 24 }} />
        </View>
      );
    }

    case 'text':
      return (
        <View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="자유롭게 적어 주세요"
            multiline
            autoFocus
            style={styles.textInput}
          />
          <Button
            title={draft.trim() ? '다음' : '비워두고 다음'}
            onPress={() => (draft.trim() ? onAnswer(draft.trim(), false) : onAnswer('', false))}
            style={{ marginTop: 16 }}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  close: { fontSize: 22, color: colors.sub, width: 40 },
  headerDate: { fontSize: 15, fontWeight: '600', color: colors.text },
  counter: { fontSize: 14, color: colors.sub, width: 40, textAlign: 'right' },
  progressTrack: { height: 4, backgroundColor: colors.border, marginHorizontal: 20, marginTop: 12, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  body: { padding: 24, paddingTop: 48, flexGrow: 1 },
  category: { color: colors.primary, fontWeight: '700', marginBottom: 8 },
  qText: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 32, lineHeight: 32, textAlign: 'left' },
  sub: { color: colors.sub, fontSize: 14 },
  yesnoRow: { flexDirection: 'row', gap: 12 },
  yesnoBtn: { flex: 1, paddingVertical: 28, borderRadius: 16, borderWidth: 2, alignItems: 'center', backgroundColor: '#fff' },
  yesnoText: { fontSize: 22, fontWeight: '700' },
  scaleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  scaleBtn: {
    width: '17%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  scaleText: { fontSize: 20, fontWeight: '700', color: colors.text },
  scaleLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  choiceBtn: { padding: 18, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  choiceText: { fontSize: 17, fontWeight: '600', color: colors.text },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  unit: { fontSize: 20, color: colors.sub, fontWeight: '600' },
  textInput: {
    minHeight: 140,
    fontSize: 17,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
    color: colors.text,
  },
  footer: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8 },
});
