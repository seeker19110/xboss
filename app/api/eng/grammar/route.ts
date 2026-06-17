import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";
import { seedGrammar } from "@/lib/eng/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureEngSchema();

  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  await seedGrammar();

  const lessons = await query<{
    id: number;
    title: string;
    description_vi: string;
    level: string;
    sort_order: number;
    created_at: string;
    completed_at: string | null;
    score: number | null;
    total: number | null;
  }>(
    `SELECT
       l.id, l.title, l.description_vi, l.level, l.sort_order, l.created_at,
       p.completed_at, p.score, p.total
     FROM eng_grammar_lessons l
     LEFT JOIN eng_user_lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
     ORDER BY l.sort_order`,
    user.id
  );

  return NextResponse.json({ lessons });
}
