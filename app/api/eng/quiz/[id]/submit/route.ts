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
  const sessionId = parseInt(id, 10);
  if (isNaN(sessionId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const session = await queryOne<{
    id: number;
    user_id: number;
    completed_at: string | null;
  }>(
    `SELECT id, user_id, completed_at FROM eng_quiz_sessions WHERE id = ?`,
    sessionId
  );

  if (!session) {
    return NextResponse.json({ error: "Phiên quiz không tồn tại" }, { status: 404 });
  }
  if (session.user_id !== user.id) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  if (session.completed_at) {
    return NextResponse.json({ error: "Phiên quiz đã hoàn thành" }, { status: 409 });
  }

  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers phải là object {itemId: answer}" }, { status: 400 });
  }

  const answers = body.answers as Record<string, string>;

  const items = await query<{
    id: number;
    correct_answer: string;
  }>(
    `SELECT id, correct_answer FROM eng_quiz_items WHERE session_id = ?`,
    sessionId
  );

  let score = 0;
  const results: Array<{
    id: number;
    correct_answer: string;
    user_answer: string | null;
    is_correct: boolean;
  }> = [];

  for (const item of items) {
    const userAnswer = answers[String(item.id)] ?? null;
    const isCorrect = userAnswer !== null && userAnswer.trim() === item.correct_answer.trim();
    if (isCorrect) score++;

    await run(
      `UPDATE eng_quiz_items SET user_answer = ?, is_correct = ? WHERE id = ?`,
      userAnswer,
      isCorrect,
      item.id
    );

    results.push({
      id: item.id,
      correct_answer: item.correct_answer,
      user_answer: userAnswer,
      is_correct: isCorrect,
    });
  }

  await run(
    `UPDATE eng_quiz_sessions SET score = ?, completed_at = NOW() WHERE id = ?`,
    score,
    sessionId
  );

  return NextResponse.json({ score, total: items.length, items: results });
}
