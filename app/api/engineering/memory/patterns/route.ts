import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  listKnowledgePatterns,
  upsertKnowledgePattern,
  PatternType,
} from "@/lib/ky-thuat/engineering-memory-bank";

export const dynamic = "force-dynamic";

// GET /api/engineering/memory/patterns — Danh sách các mẫu quy luật ẩn liên dự án
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem Ngân hàng tri thức" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const patternType = searchParams.get("type") as PatternType | null;

    const patterns = await listKnowledgePatterns(patternType || undefined);
    return NextResponse.json(patterns);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/memory/patterns — Đăng ký / làm giàu một mẫu quy luật tri thức mới
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringDataQuality(user.role)) {
    return NextResponse.json({ error: "Không có quyền cập nhật tri thức" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { patternType, category, patternMetrics, confidenceScore, lessonLearned } = body;

    if (!patternType || !category || !patternMetrics || !lessonLearned) {
      return NextResponse.json(
        { error: "Cần cung cấp patternType, category, patternMetrics và lessonLearned" },
        { status: 422 },
      );
    }

    const pattern = await upsertKnowledgePattern({
      pattern_type: patternType,
      category,
      pattern_metrics: patternMetrics,
      confidence_score: Number(confidenceScore || 0.8),
      lesson_learned: lessonLearned,
    });

    return NextResponse.json(pattern, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
