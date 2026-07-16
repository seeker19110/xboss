import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listAlertRules, upsertAlertRule } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// GET /api/admin/alert-rules — danh sách mọi rule (xuyên dự án). Admin/PM xem được
// (CAN.viewAlertRules); tạo/sửa/xoá chỉ Admin.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAlertRules(user.role))
    return NextResponse.json({ error: "Không có quyền xem ngưỡng cảnh báo" }, { status: 403 });

  const rules = await listAlertRules();
  return NextResponse.json({ rules });
}

// POST /api/admin/alert-rules { projectId, metric, threshold, active? } — tạo/cập nhật
// ngưỡng cho 1 (metric, dự án). Chỉ Admin. Không có rule cho 1 metric → hành vi giữ
// nguyên default cũ (lib/alerts.ts::ALERT_METRICS).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageAlertRules(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình ngưỡng cảnh báo" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const projectId = body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null;
  const metric = String(body.metric ?? "");
  const threshold = Number(body.threshold);
  const active = typeof body.active === "boolean" ? body.active : undefined;

  const result = await upsertAlertRule({ projectId, metric, threshold, active, userId: user.id });
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 422 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
