import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listAllAnswers, listEntries, listQuestions, listReminders } from './db';
import { nowIso, toDateKey, weekdayOf } from './dates';
import { Answer, Entry, Question, ROLE_LABELS, TYPE_LABELS } from './types';

interface Dataset {
  questions: Question[];
  entries: Entry[]; // 날짜 오름차순
  answers: Answer[];
}

async function loadDataset(): Promise<Dataset> {
  const [questions, entries, answers] = await Promise.all([
    listQuestions({ includeDeleted: true }),
    listEntries(),
    listAllAnswers(),
  ]);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { questions, entries, answers };
}

/** 답변이 하나라도 있거나 현재 사용 중인 질문만 내보낸다. */
function exportedQuestions(ds: Dataset): Question[] {
  const used = new Set(ds.answers.map((a) => a.questionId));
  return ds.questions.filter((q) => !q.deleted || used.has(q.id));
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function describeValues(q: Question): string {
  switch (q.type) {
    case 'yesno':
      return '1=예, 0=아니오';
    case 'scale':
      return `${q.min ?? 1}~${q.max ?? 10} 정수 (높을수록 큼)`;
    case 'number':
      return q.unit ? `숫자 (단위: ${q.unit})` : '숫자';
    case 'choice':
      return `선택지: ${q.options.join(' / ')}`;
    case 'text':
      return '자유 텍스트';
  }
}

/** 날짜 1행 × 질문 1열 (분석용 기본 형태). 빈 칸 = 답하지 않음 */
function buildWide(ds: Dataset): string {
  const qs = exportedQuestions(ds);
  const byEntry = new Map<number, Map<number, string>>();
  for (const a of ds.answers) {
    if (!byEntry.has(a.entryId)) byEntry.set(a.entryId, new Map());
    byEntry.get(a.entryId)!.set(a.questionId, a.value);
  }
  const header = ['date', 'weekday', 'completed', ...qs.map((q) => q.key)];
  const rows = ds.entries.map((e) => {
    const m = byEntry.get(e.id) ?? new Map<number, string>();
    return [e.date, weekdayOf(e.date), e.completedAt ? 1 : 0, ...qs.map((q) => m.get(q.id) ?? '')];
  });
  return toCsv([header, ...rows]);
}

/** 답변 1개 = 1행 (응답 시각까지 포함한 원본 형태) */
function buildLong(ds: Dataset): string {
  const qMap = new Map(ds.questions.map((q) => [q.id, q]));
  const eMap = new Map(ds.entries.map((e) => [e.id, e]));
  const header = ['date', 'question_key', 'question_text', 'role', 'category', 'type', 'value', 'answered_at'];
  const rows = ds.answers
    .map((a) => ({ a, q: qMap.get(a.questionId), e: eMap.get(a.entryId) }))
    .filter((x) => x.q && x.e)
    .sort((x, y) => x.e!.date.localeCompare(y.e!.date) || x.q!.sortOrder - y.q!.sortOrder)
    .map(({ a, q, e }) => [e!.date, q!.key, q!.text, q!.role, q!.category, q!.type, a.value, a.answeredAt]);
  return toCsv([header, ...rows]);
}

function buildDictionary(ds: Dataset): string {
  const header = ['key', 'question_text', 'role', 'category', 'type', 'values', 'status'];
  const rows = exportedQuestions(ds).map((q) => [
    q.key,
    q.text,
    q.role,
    q.category,
    q.type,
    describeValues(q),
    q.deleted ? 'deleted' : q.active ? 'active' : 'paused',
  ]);
  return toCsv([header, ...rows]);
}

function buildLlmMarkdown(ds: Dataset): string {
  const qs = exportedQuestions(ds);
  const first = ds.entries[0]?.date ?? '-';
  const last = ds.entries[ds.entries.length - 1]?.date ?? '-';
  const dictLines = qs.map(
    (q) =>
      `| ${q.key} | ${q.text.replace(/\|/g, '/')} | ${ROLE_LABELS[q.role]} | ${q.category} | ${TYPE_LABELS[q.type]} | ${describeValues(q)} |` +
      (q.deleted ? ' (삭제된 질문: 일부 기간만 존재)' : ''),
  );
  return `# 개인 컨디션 기록 분석 요청

아래는 내가 매일 기록한 컨디션 데이터입니다. (기간: ${first} ~ ${last}, 기록일 수: ${ds.entries.length}일)

## 분석해 줬으면 하는 것
1. **결과 지표**(몸 컨디션·정신 상태·집중도 등)에 가장 크게 영향을 주는 **영향 요인**을 찾아 주세요. 상관계수나 그룹 간 평균 차이(예: 운동한 날 vs 안 한 날) 등 근거 수치를 함께 보여 주세요.
2. **하루 지연 효과**도 확인해 주세요. (예: 전날 음주·수면이 다음 날 집중도에 미치는 영향)
3. 요일별 패턴, 추세(좋아지는지/나빠지는지)가 있는지 알려 주세요.
4. 자유 메모(text 타입)에서 반복되는 사건이나 키워드가 점수와 관련 있는지 봐 주세요.
5. 표본 수가 적어 확신하기 어려운 결론은 따로 표시해 주세요. 상관관계와 인과관계를 구분해 주세요.
6. 마지막으로, 내가 다음 2~4주 동안 시도해 볼 수 있는 구체적인 실험(한 번에 한 변수만 바꾸기)을 제안해 주세요.

## 변수 설명 (data dictionary)
- 영향 요인(factor) = 원인 후보, 결과 지표(outcome) = 내가 개선하고 싶은 상태
- 빈 칸 = 그날 답하지 않음 (0이 아님)

| 변수명 | 질문 | 역할 | 분류 | 형식 | 값 |
|---|---|---|---|---|---|
${dictLines.join('\n')}

## 일별 데이터 (CSV)
\`\`\`csv
${buildWide(ds)}
\`\`\`
`;
}

async function shareText(filename: string, content: string, mimeType: string) {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  // CSV는 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다.
  await file.write(mimeType === 'text/csv' ? '﻿' + content : content);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('이 기기에서는 공유 기능을 사용할 수 없습니다.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

export type ExportKind = 'llm' | 'wide' | 'long' | 'dictionary' | 'backup';

export async function exportData(kind: ExportKind): Promise<void> {
  const ds = await loadDataset();
  const stamp = toDateKey();
  switch (kind) {
    case 'llm':
      return shareText(`condition_llm_${stamp}.md`, buildLlmMarkdown(ds), 'text/markdown');
    case 'wide':
      return shareText(`condition_daily_${stamp}.csv`, buildWide(ds), 'text/csv');
    case 'long':
      return shareText(`condition_answers_${stamp}.csv`, buildLong(ds), 'text/csv');
    case 'dictionary':
      return shareText(`condition_questions_${stamp}.csv`, buildDictionary(ds), 'text/csv');
    case 'backup': {
      const backup = {
        app: 'conditionchecker',
        schemaVersion: 1,
        exportedAt: nowIso(),
        questions: ds.questions,
        entries: ds.entries,
        answers: ds.answers,
        reminders: await listReminders(),
      };
      return shareText(`condition_backup_${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
    }
  }
}
