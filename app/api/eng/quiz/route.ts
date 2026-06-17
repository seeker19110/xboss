import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";
import { seedVocabulary, seedGrammar } from "@/lib/eng/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureEngSchema();

  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  let body: { mode?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const mode = body.mode;
  if (!["vocabulary", "grammar", "mixed"].includes(mode as string)) {
    return NextResponse.json({ error: "mode phải là 'vocabulary', 'grammar' hoặc 'mixed'" }, { status: 400 });
  }

  const count = typeof body.count === "number" ? Math.min(Math.max(body.count, 1), 50) : 10;

  type VocabRow = {
    id: number;
    word: string;
    meaning_vi: string;
    options_raw?: string;
  };
  type ExRow = {
    id: number;
    question: string;
    options: string[];
    answer: string;
  };

  let vocabItems: VocabRow[] = [];
  let exItems: ExRow[] = [];

  if (mode === "vocabulary" || mode === "mixed") {
    await seedVocabulary();
    vocabItems = await query<VocabRow>(
      `SELECT id, word, meaning_vi FROM eng_vocabulary ORDER BY RANDOM() LIMIT ?`,
      mode === "vocabulary" ? count : Math.ceil(count / 2)
    );
  }

  if (mode === "grammar" || mode === "mixed") {
    await seedGrammar();
    exItems = await query<ExRow>(
      `SELECT id, question, options, answer FROM eng_grammar_exercises ORDER BY RANDOM() LIMIT ?`,
      mode === "grammar" ? count : Math.floor(count / 2)
    );
  }

  const sessionId = await insertId(
    `INSERT INTO eng_quiz_sessions (user_id, mode, total) VALUES (?, ?, ?) RETURNING id`,
    user.id,
    mode,
    vocabItems.length + exItems.length
  );

  type QuizItem = {
    id: number;
    question: string;
    options: string[];
    type: string;
  };

  const items: QuizItem[] = [];

  // Tạo câu hỏi từ vocabulary: hỏi nghĩa của từ
  for (const v of vocabItems) {
    // Lấy 3 đáp án sai ngẫu nhiên từ các từ còn lại
    const distractors = await query<{ meaning_vi: string }>(
      `SELECT meaning_vi FROM eng_vocabulary WHERE id != ? ORDER BY RANDOM() LIMIT 3`,
      v.id
    );
    const options = [v.meaning_vi, ...distractors.map((d) => d.meaning_vi)].sort(() => Math.random() - 0.5);

    const itemId = await insertId(
      `INSERT INTO eng_quiz_items (session_id, type, question, options, correct_answer, vocab_id)
       VALUES (?, 'vocabulary', ?, ?, ?, ?) RETURNING id`,
      sessionId,
      `"${v.word}" có nghĩa là gì?`,
      JSON.stringify(options),
      v.meaning_vi,
      v.id
    );
    items.push({ id: itemId, question: `"${v.word}" có nghĩa là gì?`, options, type: "vocabulary" });
  }

  // Tạo câu hỏi từ grammar exercises
  for (const ex of exItems) {
    const opts = Array.isArray(ex.options) ? ex.options : (JSON.parse(ex.options as unknown as string) as string[]);
    const itemId = await insertId(
      `INSERT INTO eng_quiz_items (session_id, type, question, options, correct_answer, exercise_id)
       VALUES (?, 'grammar', ?, ?, ?, ?) RETURNING id`,
      sessionId,
      ex.question,
      JSON.stringify(opts),
      ex.answer,
      ex.id
    );
    items.push({ id: itemId, question: ex.question, options: opts, type: "grammar" });
  }

  return NextResponse.json({ sessionId, items });
}

export async function GET() {
  await ensureEngSchema();

  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const sessions = await query<{
    id: number;
    mode: string;
    score: number | null;
    total: number;
    started_at: string;
    completed_at: string | null;
  }>(
    `SELECT id, mode, score, total, started_at, completed_at
     FROM eng_quiz_sessions
     WHERE user_id = ?
     ORDER BY started_at DESC
     LIMIT 10`,
    user.id
  );

  return NextResponse.json({ sessions });
}
