import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";
import { seedVocabulary } from "@/lib/eng/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureEngSchema();

  const user = await getCurrentEngUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  await seedVocabulary();

  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic");

  const rows = await query<{
    id: number;
    word: string;
    phonetic: string;
    meaning_vi: string;
    example_en: string;
    example_vi: string;
    topic: string;
    level: string;
    sort_order: number;
    uv_id: number | null;
    ease_factor: number | null;
    interval_days: number | null;
    reps: number | null;
    next_review: string | null;
    last_quality: number | null;
  }>(
    `SELECT
       v.id, v.word, v.phonetic, v.meaning_vi, v.example_en, v.example_vi,
       v.topic, v.level, v.sort_order,
       uv.id AS uv_id, uv.ease_factor, uv.interval_days, uv.reps,
       uv.next_review, uv.last_quality
     FROM eng_vocabulary v
     LEFT JOIN eng_user_vocabulary uv ON uv.vocab_id = v.id AND uv.user_id = ?
     ${topic ? "WHERE v.topic = ?" : ""}
     ORDER BY v.sort_order`,
    ...(topic ? [user.id, topic] : [user.id])
  );

  const now = new Date();
  const vocabulary = rows.map((r) => ({
    id: r.id,
    word: r.word,
    phonetic: r.phonetic,
    meaning_vi: r.meaning_vi,
    example_en: r.example_en,
    example_vi: r.example_vi,
    topic: r.topic,
    level: r.level,
    sort_order: r.sort_order,
    learned: r.uv_id !== null,
    ease_factor: r.ease_factor,
    interval_days: r.interval_days,
    reps: r.reps,
    next_review: r.next_review,
    last_quality: r.last_quality,
    due: r.uv_id === null || (r.next_review !== null && new Date(r.next_review) <= now),
  }));

  return NextResponse.json({ vocabulary });
}
