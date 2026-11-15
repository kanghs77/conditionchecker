export type QuestionType = 'yesno' | 'scale' | 'number' | 'choice' | 'text';

/**
 * outcome: 결과 지표 (몸 컨디션, 기분, 집중도 등 — "무엇에 영향을 받는가")
 * factor:  원인 후보 변수 (수면, 물, 운동, 카페인 등 — "무엇이 영향을 주는가")
 * note:    분석 보조용 메모
 */
export type QuestionRole = 'outcome' | 'factor' | 'note';

export const CATEGORIES = ['신체', '정신', '집중', '수면', '생활습관', '식단', '환경', '기타'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Question {
  id: number;
  key: string; // 내보내기용 변수명 (예: water, focus)
  text: string;
  type: QuestionType;
  role: QuestionRole;
  category: string;
  min: number | null; // scale 전용
  max: number | null; // scale 전용
  options: string[]; // choice 전용
  unit: string | null; // number 전용 (예: 시간, 잔)
  sortOrder: number;
  active: boolean;
  deleted: boolean;
}

export type QuestionDraft = Omit<Question, 'id' | 'sortOrder' | 'deleted'>;

export interface Entry {
  id: number;
  date: string; // YYYY-MM-DD
  startedAt: string;
  completedAt: string | null;
}

export interface Answer {
  entryId: number;
  questionId: number;
  value: string;
  answeredAt: string;
}

export interface Reminder {
  id: number;
  hour: number;
  minute: number;
  enabled: boolean;
  notificationId: string | null;
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  yesno: '예 / 아니오',
  scale: '점수 (예: 1~10)',
  number: '숫자 입력 (예: 수면 시간)',
  choice: '객관식',
  text: '자유 메모',
};

export const ROLE_LABELS: Record<QuestionRole, string> = {
  outcome: '결과 지표',
  factor: '영향 요인',
  note: '메모',
};
