import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/bao-mat/api-keys";
import {
  intelligencePackageInputSchema,
  ingestIntelligencePackage,
  UnknownObjectKeyError,
} from "@/lib/ky-thuat/engineering-intel";

export const dynamic = "force-dynamic";

// POST /api/v1/engineering/intelligence — nhận Intelligence Package từ hệ thống ngoài
// (ENG-2, docs/nang-cap/ENG-2-engineering-intelligence.md mục 4.1). Auth qua API key scope
// "engineering", 1 dự án/key.
//
// Confidence và trạng thái ban đầu LUÔN được tính lại ở server (computeConfidence +
// initialStatus) — giá trị bên gọi tự khai bị bỏ qua hoàn toàn, đúng §5 "confidence không
// phải LLM tự chấm điểm". Response trả lại status/confidence thật để bên gọi biết
// suggestion nào bị hạ về needs_review.
//
// KHÔNG có đường nào từ route này ghi sang boq_items/payment_bills/tasks — ENG-2 chỉ
// KNOW/REASON/SUGGEST (§0 core principle).
export async function POST(req: NextRequest) {
  const ctx = await requireApiKey(req, "engineering");
  if (ctx instanceof Response) return ctx;
  const { auth, projectId } = ctx;

  const body = await req.json().catch(() => null);
  const parsed = intelligencePackageInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "body";
    return NextResponse.json(
      { error: `${path}: ${issue?.message ?? "không hợp lệ"}` },
      { status: 422 },
    );
  }

  try {
    const result = await ingestIntelligencePackage(projectId, auth.keyId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof UnknownObjectKeyError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
