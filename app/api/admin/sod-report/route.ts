import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { buildSodReport } from "@/lib/sod";

export const dynamic = "force-dynamic";

// Chỉ cho chọn 3 mốc cố định trên UI — chặn giá trị days bất kỳ để tránh quét khoảng
// thời gian tuỳ ý (mặc định 90 khi tham số thiếu/không hợp lệ).
const ALLOWED_DAYS = [30, 90, 180];

// GET /api/admin/sod-report?days=90 — báo cáo phân tách nhiệm vụ (SoD) mềm phục vụ kiểm
// toán (M50 PR3, chỉ Admin qua CAN.viewAudit). Trả mảng { rule, description, violations }
// — xem lib/sod.ts để biết rule nào được viết / rule nào bị bỏ vì thiếu cột.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAudit(me.role))
    return NextResponse.json({ error: "Chỉ Admin được xem báo cáo SoD" }, { status: 403 });

  const raw = parseInt(req.nextUrl.searchParams.get("days") ?? "90", 10);
  const days = ALLOWED_DAYS.includes(raw) ? raw : 90;

  const report = await buildSodReport(days);
  return NextResponse.json(report);
}
