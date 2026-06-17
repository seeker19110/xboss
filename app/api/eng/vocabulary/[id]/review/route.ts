import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentEngUser } from "@/lib/eng/auth";
import { ensureEngSchema } from "@/lib/eng/db";
import { reviewCard } from "@/lib/eng/srs";

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
  const vocabId = parseInt(id, 10);
  if (isNaN(vocabId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  let body: { quality?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const quality = body.quality;
  if (typeof quality !== "number" || ![0, 1, 2, 3, 4, 5].includes(quality)) {
    return NextResponse.json({ error: "quality phải là số từ 0 đến 5" }, { status: 400 });
  }

  const vocab = await queryOne<{ id: number }>(
    `SELECT id FROM eng_vocabulary WHERE id = ?`,
    vocabId
  );
  if (!vocab) {
    return NextResponse.json({ error: "Từ vựng không tồn tại" }, { status: 404 });
  }

  const existing = await queryOne<{
    ease_factor: number;
    interval_days: number;
    reps: number;
  }>(
    `SELECT ease_factor, interval_days, reps FROM eng_user_vocabulary WHERE user_id = ? AND vocab_id = ?`,
    user.id,
    vocabId
  );

  const card = existing ?? { ease_factor: 2.5, interval_days: 1, reps: 0 };
  const result = reviewCard(card, quality as 0 | 1 | 2 | 3 | 4 | 5);

  await run(
    `INSERT INTO eng_user_vocabulary (user_id, vocab_id, ease_factor, interval_days, reps, next_review, last_quality)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, vocab_id) DO UPDATE SET
       ease_factor = EXCLUDED.ease_factor,
       interval_days = EXCLUDED.interval_days,
       reps = EXCLUDED.reps,
       next_review = EXCLUDED.next_review,
       last_quality = EXCLUDED.last_quality`,
    user.id,
    vocabId,
    result.ease_factor,
    result.interval_days,
    result.reps,
    result.next_review.toISOString(),
    quality
  );

  return NextResponse.json({
    next_review: result.next_review.toISOString(),
    ease_factor: result.ease_factor,
    interval_days: result.interval_days,
    reps: result.reps,
  });
}
