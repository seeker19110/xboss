import { NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureEngSchema();

  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const [
    vocabTotalRow,
    vocabLearnedRow,
    vocabDueRow,
    grammarTotalRow,
    grammarDoneRow,
    avgScoreRow,
    quizHistory,
  ] = await Promise.all([
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM eng_vocabulary`),
    queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM eng_user_vocabulary WHERE user_id = ?`,
      user.id
    ),
    queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM eng_user_vocabulary
       WHERE user_id = ? AND next_review <= NOW()`,
      user.id
    ),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM eng_grammar_lessons`),
    queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM eng_user_lesson_progress WHERE user_id = ?`,
      user.id
    ),
    queryOne<{ avg: number | null }>(
      `SELECT AVG(score::float / NULLIF(total, 0) * 100) AS avg
       FROM eng_quiz_sessions
       WHERE user_id = ? AND completed_at IS NOT NULL`,
      user.id
    ),
    query<{
      id: number;
      mode: string;
      score: number | null;
      total: number;
      completed_at: string | null;
    }>(
      `SELECT id, mode, score, total, completed_at
       FROM eng_quiz_sessions
       WHERE user_id = ? AND completed_at IS NOT NULL
       ORDER BY completed_at DESC
       LIMIT 7`,
      user.id
    ),
  ]);

  return NextResponse.json({
    vocab_total: Number(vocabTotalRow?.n ?? 0),
    vocab_learned: Number(vocabLearnedRow?.n ?? 0),
    vocab_due: Number(vocabDueRow?.n ?? 0),
    grammar_total: Number(grammarTotalRow?.n ?? 0),
    grammar_done: Number(grammarDoneRow?.n ?? 0),
    quiz_history: quizHistory,
    streak_days: user.streak_days,
    avg_score: avgScoreRow?.avg !== null && avgScoreRow?.avg !== undefined
      ? Math.round(avgScoreRow.avg * 10) / 10
      : null,
  });
}
