import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getComplianceRules } from "@/lib/ky-thuat/engineering-prescriptive";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/compliance/rules — Lấy danh mục các quy chuẩn kỹ thuật
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringCompliance(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem quy chuẩn kỹ thuật" }, { status: 403 });
  }

  try {
    const rules = await getComplianceRules();
    return NextResponse.json(rules);
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
