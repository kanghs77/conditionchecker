import { QuestionDraft } from './types';

/** 처음 설치 시 넣어 두는 예시 질문. 앱의 "질문" 탭에서 자유롭게 수정·삭제할 수 있다. */
export const DEFAULT_QUESTIONS: QuestionDraft[] = [
  // 영향 요인
  { key: 'sleep_hours', text: '어젯밤 몇 시간 잤나요?', type: 'number', role: 'factor', category: '수면', min: null, max: null, options: [], unit: '시간', active: true },
  { key: 'sleep_quality', text: '수면의 질은 어땠나요?', type: 'scale', role: 'factor', category: '수면', min: 1, max: 10, options: [], unit: null, active: true },
  { key: 'water', text: '물을 의도적으로 마셨습니까?', type: 'yesno', role: 'factor', category: '생활습관', min: null, max: null, options: [], unit: null, active: true },
  { key: 'exercise', text: '오늘 운동을 했나요?', type: 'yesno', role: 'factor', category: '생활습관', min: null, max: null, options: [], unit: null, active: true },
  { key: 'caffeine_cups', text: '카페인 음료를 몇 잔 마셨나요?', type: 'number', role: 'factor', category: '식단', min: null, max: null, options: [], unit: '잔', active: true },
  { key: 'alcohol', text: '어제 술을 마셨나요?', type: 'yesno', role: 'factor', category: '식단', min: null, max: null, options: [], unit: null, active: true },
  { key: 'sunlight', text: '햇빛을 보며 바깥에 있었나요? (15분 이상)', type: 'yesno', role: 'factor', category: '환경', min: null, max: null, options: [], unit: null, active: true },
  // 결과 지표
  { key: 'body_condition', text: '오늘 몸 컨디션은?', type: 'scale', role: 'outcome', category: '신체', min: 1, max: 10, options: [], unit: null, active: true },
  { key: 'mood', text: '오늘 기분(정신 상태)은?', type: 'scale', role: 'outcome', category: '정신', min: 1, max: 10, options: [], unit: null, active: true },
  { key: 'stress', text: '오늘 스트레스는?', type: 'scale', role: 'outcome', category: '정신', min: 1, max: 10, options: [], unit: null, active: true },
  { key: 'focus', text: '오늘 집중도는?', type: 'scale', role: 'outcome', category: '집중', min: 1, max: 10, options: [], unit: null, active: true },
  // 메모
  { key: 'memo', text: '오늘 특별한 일이 있었나요? (자유 메모)', type: 'text', role: 'note', category: '기타', min: null, max: null, options: [], unit: null, active: true },
];
