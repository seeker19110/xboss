import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, run } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureEngSchema();

  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id } = await params;
  const lessonId = parseInt(id, 10);
  if (isNaN(lessonId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const lesson = await queryOne<{ id: number }>(
    `SELECT id FROM eng_grammar_lessons WHERE id = ?`,
    lessonId
  );
  if (!lesson) {
    return NextResponse.json({ error: "Bài học không tồn tại" }, { status: 404 });
  }

  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers phải là object {exerciseId: answer}" }, { status: 400 });
  }

  const answers = body.answers as Record<string, string>;

  const exercises = await query<{
    id: number;
    answer: string;
    explanation_vi: string;
  }>(
    `SELECT id, answer, explanation_vi FROM eng_grammar_exercises WHERE lesson_id = ? ORDER BY sort_order`,
    lessonId
  );

  let score = 0;
  const results = exercises.map((ex) => {
    const userAnswer = answers[String(ex.id)] ?? null;
    const correct = userAnswer !== null && userAnswer.trim() === ex.answer.trim();
    if (correct) score++;
    return {
      id: ex.id,
      correct,
      correct_answer: ex.answer,
      user_answer: userAnswer,
      explanation_vi: ex.explanation_vi,
    };
  });

  const total = exercises.length;

  await run(
    `INSERT INTO eng_user_lesson_progress (user_id, lesson_id, completed_at, score, total)
     VALUES (?, ?, NOW(), ?, ?)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       completed_at = EXCLUDED.completed_at,
       score = EXCLUDED.score,
       total = EXCLUDED.total`,
    user.id,
    lessonId,
    score,
    total
  );

  return NextResponse.json({ score, total, results });
}
