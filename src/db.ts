import * as SQLite from 'expo-sqlite';
import { DEFAULT_QUESTIONS } from './defaultQuestions';
import { nowIso } from './dates';
import { Answer, Entry, Question, QuestionDraft, Reminder } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

const SCHEMA_VERSION = 1;

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('condition.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'factor',
        category TEXT NOT NULL DEFAULT '기타',
        min INTEGER,
        max INTEGER,
        options TEXT NOT NULL DEFAULT '[]',
        unit TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS answers (
        entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(id),
        value TEXT NOT NULL,
        answered_at TEXT NOT NULL,
        PRIMARY KEY (entry_id, question_id)
      );
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        notification_id TEXT
      );
    `);
    const now = nowIso();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < DEFAULT_QUESTIONS.length; i++) {
        await insertQuestionRow(db, DEFAULT_QUESTIONS[i], i, now);
      }
      await db.runAsync('INSERT INTO reminders (hour, minute, enabled) VALUES (21, 30, 1)');
    });
  }
  // 향후 스키마 변경은 여기서 `if (version < 2) { ... }` 식으로 추가한다.
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

// ---------- 질문 ----------

interface QuestionRow {
  id: number;
  key: string;
  text: string;
  type: string;
  role: string;
  category: string;
  min: number | null;
  max: number | null;
  options: string;
  unit: string | null;
  sort_order: number;
  active: number;
  deleted: number;
}

function mapQuestion(r: QuestionRow): Question {
  let options: string[] = [];
  try {
    options = JSON.parse(r.options);
  } catch {}
  return {
    id: r.id,
    key: r.key,
    text: r.text,
    type: r.type as Question['type'],
    role: r.role as Question['role'],
    category: r.category,
    min: r.min,
    max: r.max,
    options,
    unit: r.unit,
    sortOrder: r.sort_order,
    active: !!r.active,
    deleted: !!r.deleted,
  };
}

async function insertQuestionRow(db: SQLite.SQLiteDatabase, q: QuestionDraft, order: number, now: string) {
  return db.runAsync(
    `INSERT INTO questions (key, text, type, role, category, min, max, options, unit, sort_order, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    q.key, q.text, q.type, q.role, q.category, q.min, q.max, JSON.stringify(q.options), q.unit, order, q.active ? 1 : 0, now,
  );
}

/** includeDeleted: 내보내기처럼 과거 기록을 해석해야 할 때 삭제된 질문까지 포함 */
export async function listQuestions(opts: { includeDeleted?: boolean } = {}): Promise<Question[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QuestionRow>(
    `SELECT * FROM questions ${opts.includeDeleted ? '' : 'WHERE deleted = 0'} ORDER BY sort_order, id`,
  );
  return rows.map(mapQuestion);
}

export async function isKeyTaken(key: string, exceptId?: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM questions WHERE key = ?', key);
  return !!row && row.id !== exceptId;
}

export async function createQuestion(q: QuestionDraft): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM questions');
  await insertQuestionRow(db, q, (row?.m ?? -1) + 1, nowIso());
}

export async function updateQuestion(id: number, q: QuestionDraft): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE questions SET key=?, text=?, type=?, role=?, category=?, min=?, max=?, options=?, unit=?, active=? WHERE id=?`,
    q.key, q.text, q.type, q.role, q.category, q.min, q.max, JSON.stringify(q.options), q.unit, q.active ? 1 : 0, id,
  );
}

export async function setQuestionActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE questions SET active=? WHERE id=?', active ? 1 : 0, id);
}

/** 답변이 쌓인 질문은 과거 데이터 보존을 위해 숨김(soft delete) 처리, 답변이 없으면 완전히 삭제 */
export async function deleteQuestion(id: number): Promise<void> {
  const db = await getDb();
  const used = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM answers WHERE question_id=?', id);
  if (used && used.c > 0) {
    await db.runAsync('UPDATE questions SET deleted=1, active=0 WHERE id=?', id);
  } else {
    await db.runAsync('DELETE FROM questions WHERE id=?', id);
  }
}

export async function reorderQuestions(idsInOrder: number[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < idsInOrder.length; i++) {
      await db.runAsync('UPDATE questions SET sort_order=? WHERE id=?', i, idsInOrder[i]);
    }
  });
}

// ---------- 기록 ----------

interface EntryRow {
  id: number;
  date: string;
  started_at: string;
  completed_at: string | null;
}

const mapEntry = (r: EntryRow): Entry => ({ id: r.id, date: r.date, startedAt: r.started_at, completedAt: r.completed_at });

export async function getEntryByDate(date: string): Promise<Entry | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE date=?', date);
  return r ? mapEntry(r) : null;
}

export async function getOrCreateEntry(date: string): Promise<Entry> {
  const existing = await getEntryByDate(date);
  if (existing) return existing;
  const db = await getDb();
  await db.runAsync('INSERT INTO entries (date, started_at) VALUES (?, ?)', date, nowIso());
  return (await getEntryByDate(date))!;
}

export async function completeEntry(entryId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE entries SET completed_at=? WHERE id=?', nowIso(), entryId);
}

export async function deleteEntry(entryId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM entries WHERE id=?', entryId);
}

export async function listEntries(): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM entries ORDER BY date DESC');
  return rows.map(mapEntry);
}

interface AnswerRow {
  entry_id: number;
  question_id: number;
  value: string;
  answered_at: string;
}

const mapAnswer = (r: AnswerRow): Answer => ({
  entryId: r.entry_id,
  questionId: r.question_id,
  value: r.value,
  answeredAt: r.answered_at,
});

export async function getAnswers(entryId: number): Promise<Answer[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AnswerRow>('SELECT * FROM answers WHERE entry_id=?', entryId);
  return rows.map(mapAnswer);
}

export async function listAllAnswers(): Promise<Answer[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AnswerRow>('SELECT * FROM answers');
  return rows.map(mapAnswer);
}

export async function saveAnswer(entryId: number, questionId: number, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO answers (entry_id, question_id, value, answered_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(entry_id, question_id) DO UPDATE SET value=excluded.value, answered_at=excluded.answered_at`,
    entryId, questionId, value, nowIso(),
  );
}

export async function clearAnswer(entryId: number, questionId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM answers WHERE entry_id=? AND question_id=?', entryId, questionId);
}

// ---------- 알림 시각 ----------

interface ReminderRow {
  id: number;
  hour: number;
  minute: number;
  enabled: number;
  notification_id: string | null;
}

export async function listReminders(): Promise<Reminder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReminderRow>('SELECT * FROM reminders ORDER BY hour, minute');
  return rows.map((r) => ({
    id: r.id,
    hour: r.hour,
    minute: r.minute,
    enabled: !!r.enabled,
    notificationId: r.notification_id,
  }));
}

export async function addReminder(hour: number, minute: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO reminders (hour, minute, enabled) VALUES (?, ?, 1)', hour, minute);
}

export async function updateReminder(id: number, patch: Partial<Pick<Reminder, 'hour' | 'minute' | 'enabled'>>) {
  const db = await getDb();
  const cur = (await listReminders()).find((r) => r.id === id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  await db.runAsync('UPDATE reminders SET hour=?, minute=?, enabled=? WHERE id=?', next.hour, next.minute, next.enabled ? 1 : 0, id);
}

export async function setReminderNotificationId(id: number, notificationId: string | null) {
  const db = await getDb();
  await db.runAsync('UPDATE reminders SET notification_id=? WHERE id=?', notificationId, id);
}

export async function deleteReminder(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reminders WHERE id=?', id);
}
