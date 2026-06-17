import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
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

  const lesson = await queryOne<{
    id: number;
    title: string;
    description_vi: string;
    content_vi: string;
    level: string;
    sort_order: number;
    created_at: string;
  }>(
    `SELECT id, title, description_vi, content_vi, level, sort_order, created_at
     FROM eng_grammar_lessons WHERE id = ?`,
    lessonId
  );

  if (!lesson) {
    return NextResponse.json({ error: "Bài học không tồn tại" }, { status: 404 });
  }

  const exercises = await query<{
    id: number;
    type: string;
    question: string;
    options: string[];
    answer: string;
    explanation_vi: string;
    sort_order: number;
  }>(
    `SELECT id, type, question, options, answer, explanation_vi, sort_order
     FROM eng_grammar_exercises
     WHERE lesson_id = ?
     ORDER BY sort_order`,
    lessonId
  );

  const progress = await queryOne<{
    completed_at: string;
    score: number;
    total: number;
  }>(
    `SELECT completed_at, score, total FROM eng_user_lesson_progress
     WHERE user_id = ? AND lesson_id = ?`,
    user.id,
    lessonId
  );

  return NextResponse.json({ lesson, exercises, progress: progress ?? null });
}
