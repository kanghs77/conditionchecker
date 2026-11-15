import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, SectionTitle, colors } from '../components/ui';
import { createQuestion, deleteQuestion, isKeyTaken, listQuestions, reorderQuestions, setQuestionActive, updateQuestion } from '../db';
import { CATEGORIES, Question, QuestionDraft, QuestionRole, QuestionType, ROLE_LABELS, TYPE_LABELS } from '../types';

export default function QuestionsScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editing, setEditing] = useState<Question | 'new' | null>(null);

  const reload = useCallback(async () => setQuestions(await listQuestions()), []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[idx], next[j]] = [next[j], next[idx]];
    setQuestions(next);
    await reorderQuestions(next.map((q) => q.id));
  }

  function confirmDelete(q: Question) {
    Alert.alert('질문 삭제', `"${q.text}"\n\n이미 기록된 답변은 내보내기에 그대로 남습니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteQuestion(q.id);
          reload();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.help}>
          설문은 이 순서대로 하나씩 나옵니다. 스위치를 끄면 기록은 남기고 설문에서만 빠집니다.
        </Text>
        {questions.map((q, i) => (
          <Card key={q.id} style={[styles.row, !q.active && { opacity: 0.5 }]}>
            <View style={styles.order}>
              <Pressable onPress={() => move(i, -1)} hitSlop={8} disabled={i === 0}>
                <Text style={[styles.arrow, i === 0 && { opacity: 0.2 }]}>▲</Text>
              </Pressable>
              <Pressable onPress={() => move(i, 1)} hitSlop={8} disabled={i === questions.length - 1}>
                <Text style={[styles.arrow, i === questions.length - 1 && { opacity: 0.2 }]}>▼</Text>
              </Pressable>
            </View>
            <Pressable style={{ flex: 1 }} onPress={() => setEditing(q)}>
              <Text style={styles.qText}>{q.text}</Text>
              <Text style={styles.meta}>
                {TYPE_LABELS[q.type]}
                {q.type === 'scale' ? ` ${q.min}~${q.max}` : ''} · {ROLE_LABELS[q.role]} · {q.category} · {q.key}
              </Text>
            </Pressable>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Switch
                value={q.active}
                onValueChange={async (v) => {
                  await setQuestionActive(q.id, v);
                  reload();
                }}
              />
              <Pressable onPress={() => confirmDelete(q)} hitSlop={8}>
                <Text style={{ color: colors.no, fontSize: 13 }}>삭제</Text>
              </Pressable>
            </View>
          </Card>
        ))}
        <Button title="+ 질문 추가" onPress={() => setEditing('new')} style={{ marginTop: 8 }} />
      </ScrollView>

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing !== null && (
          <QuestionEditor
            initial={editing === 'new' ? null : editing}
            nextIndex={questions.length + 1}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>
    </View>
  );
}

const TYPES: QuestionType[] = ['yesno', 'scale', 'number', 'choice', 'text'];
const ROLES: QuestionRole[] = ['factor', 'outcome', 'note'];

function QuestionEditor({
  initial,
  nextIndex,
  onClose,
  onSaved,
}: {
  initial: Question | null;
  nextIndex: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  const [key, setKey] = useState(initial?.key ?? '');
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'scale');
  const [role, setRole] = useState<QuestionRole>(initial?.role ?? 'factor');
  const [category, setCategory] = useState(initial?.category ?? '기타');
  const [min, setMin] = useState(String(initial?.min ?? 1));
  const [max, setMax] = useState(String(initial?.max ?? 10));
  const [options, setOptions] = useState((initial?.options ?? []).join('\n'));
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  async function save() {
    const t = text.trim();
    if (!t) return Alert.alert('질문 내용을 입력해 주세요.');
    const k = (key.trim() || `q${nextIndex}`).replace(/\s+/g, '_');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      return Alert.alert('변수명은 영문/숫자/밑줄(_)만 쓸 수 있고, 숫자로 시작할 수 없어요.', '예: water, sleep_hours');
    }
    if (await isKeyTaken(k, initial?.id)) return Alert.alert(`변수명 "${k}"는 이미 사용 중이에요.`);

    const draft: QuestionDraft = {
      text: t,
      key: k,
      type,
      role,
      category,
      min: null,
      max: null,
      options: [],
      unit: null,
      active,
    };
    if (type === 'scale') {
      const lo = parseInt(min, 10);
      const hi = parseInt(max, 10);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo || hi - lo > 20) {
        return Alert.alert('점수 범위를 확인해 주세요.', '최대값이 최소값보다 커야 하고, 범위는 20 이하여야 해요.');
      }
      draft.min = lo;
      draft.max = hi;
    }
    if (type === 'choice') {
      const opts = options.split('\n').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return Alert.alert('선택지를 두 개 이상 입력해 주세요. (한 줄에 하나)');
      draft.options = Array.from(new Set(opts));
    }
    if (type === 'number') draft.unit = unit.trim() || null;

    if (initial) {
      if (initial.type !== type) {
        const ok = await new Promise<boolean>((resolve) =>
          Alert.alert('답변 형식 변경', '형식을 바꾸면 기존 기록과 값의 의미가 달라질 수 있어요. 새 질문으로 추가하는 것을 권장합니다. 그래도 바꿀까요?', [
            { text: '취소', style: 'cancel', onPress: () => resolve(false) },
            { text: '변경', onPress: () => resolve(true) },
          ]),
        );
        if (!ok) return;
      }
      await updateQuestion(initial.id, draft);
    } else {
      await createQuestion(draft);
    }
    onSaved();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.editorHeader}>
        <Button title="취소" variant="ghost" onPress={onClose} />
        <Text style={styles.editorTitle}>{initial ? '질문 수정' : '새 질문'}</Text>
        <Button title="저장" variant="ghost" textStyle={{ color: colors.primary }} onPress={save} />
      </View>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SectionTitle>질문</SectionTitle>
        <TextInput value={text} onChangeText={setText} placeholder="예: 물을 의도적으로 마셨습니까?" style={styles.input} multiline />

        <SectionTitle>답변 형식</SectionTitle>
        <View style={styles.wrap}>
          {TYPES.map((t) => (
            <Chip key={t} label={TYPE_LABELS[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>

        {type === 'scale' && (
          <View style={styles.inline}>
            <TextInput value={min} onChangeText={setMin} keyboardType="number-pad" style={[styles.input, styles.small]} />
            <Text style={styles.meta}>부터</Text>
            <TextInput value={max} onChangeText={setMax} keyboardType="number-pad" style={[styles.input, styles.small]} />
            <Text style={styles.meta}>까지</Text>
          </View>
        )}
        {type === 'choice' && (
          <TextInput
            value={options}
            onChangeText={setOptions}
            placeholder={'한 줄에 하나씩\n예:\n아침\n점심\n저녁'}
            multiline
            style={[styles.input, { minHeight: 110 }]}
          />
        )}
        {type === 'number' && (
          <TextInput value={unit} onChangeText={setUnit} placeholder="단위 (예: 시간, 잔, 보)" style={styles.input} />
        )}

        <SectionTitle>분석에서의 역할</SectionTitle>
        <View style={styles.wrap}>
          {ROLES.map((r) => (
            <Chip key={r} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </View>
        <Text style={styles.help}>
          영향 요인 = 원인 후보 (수면, 물, 운동…){'\n'}결과 지표 = 개선하고 싶은 상태 (컨디션, 기분, 집중도…)
        </Text>

        <SectionTitle>분류</SectionTitle>
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        <SectionTitle>변수명 (내보내기 열 이름, 영문)</SectionTitle>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder={`비워두면 q${nextIndex}`}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <View style={[styles.inline, { justifyContent: 'space-between', marginTop: 16 }]}>
          <Text style={styles.qText}>설문에 포함</Text>
          <Switch value={active} onValueChange={setActive} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  help: { color: colors.sub, fontSize: 13, marginBottom: 12, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  order: { gap: 6 },
  arrow: { fontSize: 14, color: colors.sub },
  qText: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.sub, marginTop: 4 },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  editorTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    marginBottom: 8,
  },
  small: { width: 70, textAlign: 'center', marginBottom: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
