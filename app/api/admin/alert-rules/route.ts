import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listAlertRules, upsertAlertRule } from "@/lib/van-hanh/alerts";
import { queryOne } from "@/lib/db";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// GET /api/admin/alert-rules — rule của tổ chức người gọi (dự án đang chọn + rule toàn cục
// của org; S02e). Admin/PM xem được (CAN.viewAlertRules); tạo/sửa/xoá chỉ Admin.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAlertRules(user.role))
    return NextResponse.json({ error: "Không có quyền xem ngưỡng cảnh báo" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const rules = await listAlertRules(user.orgId, projectId);
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

  // S02: rule gắn dự án thì dự án phải thuộc tổ chức người gọi (không lộ dự án org khác).
  if (projectId != null && Number.isInteger(projectId) && projectId > 0) {
    const project = await queryOne(
      `SELECT 1 FROM projects WHERE id = ? AND org_id = ?`,
      projectId,
      user.orgId,
    );
    if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  }

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await ghiNeuConQuyen(
    () => CAN.manageAlertRules(user.role),
    () =>
      upsertAlertRule({
        projectId,
        metric,
        threshold,
        active,
        userId: user.id,
        orgId: user.orgId,
      }),
  );
  if (!kq.ok)
    return NextResponse.json({ error: "Chỉ Admin được cấu hình ngưỡng cảnh báo" }, { status: 403 });
  const result = kq.value;
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 422 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
