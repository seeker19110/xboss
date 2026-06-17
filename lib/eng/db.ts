import { run } from "@/lib/db";

export type EngUser = {
  id: number;
  name: string;
  email: string;
  level: string;
  streak_days: number;
  last_study_date: string | null;
};

export type EngVocabulary = {
  id: number;
  word: string;
  phonetic: string;
  meaning_vi: string;
  example_en: string;
  example_vi: string;
  topic: string;
  level: string;
  sort_order: number;
};

export type EngUserVocabulary = {
  id: number;
  user_id: number;
  vocab_id: number;
  ease_factor: number;
  interval_days: number;
  reps: number;
  next_review: string;
  last_quality: number | null;
  created_at: string;
};

export type EngGrammarLesson = {
  id: number;
  title: string;
  description_vi: string;
  content_vi: string;
  level: string;
  sort_order: number;
  created_at: string;
};

export type EngGrammarExercise = {
  id: number;
  lesson_id: number;
  type: string;
  question: string;
  options: string[];
  answer: string;
  explanation_vi: string;
  sort_order: number;
};

export type EngUserLessonProgress = {
  user_id: number;
  lesson_id: number;
  completed_at: string;
  score: number;
  total: number;
};

export type EngQuizSession = {
  id: number;
  user_id: number;
  mode: string;
  score: number | null;
  total: number;
  started_at: string;
  completed_at: string | null;
};

export type EngQuizItem = {
  id: number;
  session_id: number;
  type: string;
  question: string;
  options: string[];
  correct_answer: string;
  user_answer: string | null;
  is_correct: boolean | null;
  vocab_id: number | null;
  exercise_id: number | null;
};

export const ENG_SCHEMA = `
CREATE TABLE IF NOT EXISTS eng_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'beginner',
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_study_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eng_vocabulary (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  meaning_vi TEXT NOT NULL,
  example_en TEXT NOT NULL DEFAULT '',
  example_vi TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT 'general',
  level TEXT NOT NULL DEFAULT 'beginner',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eng_user_vocabulary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
  vocab_id INTEGER NOT NULL REFERENCES eng_vocabulary(id) ON DELETE CASCADE,
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 1,
  reps INTEGER NOT NULL DEFAULT 0,
  next_review TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_quality INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, vocab_id)
);

CREATE TABLE IF NOT EXISTS eng_grammar_lessons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description_vi TEXT NOT NULL DEFAULT '',
  content_vi TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'beginner',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eng_grammar_exercises (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES eng_grammar_lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'multiple_choice',
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL,
  explanation_vi TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eng_user_lesson_progress (
  user_id INTEGER NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES eng_grammar_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS eng_quiz_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES eng_users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  score INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS eng_quiz_items (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES eng_quiz_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  user_answer TEXT,
  is_correct BOOLEAN,
  vocab_id INTEGER REFERENCES eng_vocabulary(id) ON DELETE SET NULL,
  exercise_id INTEGER REFERENCES eng_grammar_exercises(id) ON DELETE SET NULL
);
`;

const g = globalThis as unknown as { __engSchemaReady?: Promise<void> };

export async function ensureEngSchema(): Promise<void> {
  if (!g.__engSchemaReady) {
    g.__engSchemaReady = run(ENG_SCHEMA).then(() => undefined);
  }
  return g.__engSchemaReady;
}
