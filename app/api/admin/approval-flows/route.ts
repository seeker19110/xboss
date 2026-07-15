import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { APPROVAL_ENTITY_TYPES, createApprovalFlow, listApprovalFlows } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// GET /api/admin/approval-flows — danh sách mọi flow (xuyên dự án) kèm bước + số
// request tổng/đang chờ. Admin/PM xem được (CAN.viewApprovalFlows); tạo/sửa/xoá chỉ Admin.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewApprovalFlows(user.role))
    return NextResponse.json({ error: "Không có quyền xem cấu hình duyệt" }, { status: 403 });

  const flows = await listApprovalFlows();
  return NextResponse.json({ flows });
}

// POST /api/admin/approval-flows { projectId, entityType, name, steps: [{seq,role,minAmount,slaDays}] }
// — tạo flow mới (chỉ Admin). Không seed sẵn — trước khi tạo, mọi entity_type hành xử
// như hiện tại (duyệt 1 bước qua CAN.approve).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageApprovalFlows(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình luồng duyệt" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const entityType = String(body.entityType ?? "");
  if (!APPROVAL_ENTITY_TYPES.includes(entityType as (typeof APPROVAL_ENTITY_TYPES)[number]))
    return NextResponse.json({ error: "Loại thực thể không hợp lệ" }, { status: 422 });
  const name = String(body.name ?? "");
  const projectId = body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null;
  if (projectId != null && !Number.isInteger(projectId))
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 422 });
  const steps = Array.isArray(body.steps)
    ? body.steps.map((s: Record<string, unknown>) => ({
        seq: Number(s.seq),
        role: String(s.role ?? ""),
        minAmount: s.minAmount != null && s.minAmount !== "" ? Number(s.minAmount) : null,
        slaDays: s.slaDays != null && s.slaDays !== "" ? Number(s.slaDays) : null,
      }))
    : [];

  const result = await createApprovalFlow({ projectId, entityType, name, steps });
  if (typeof result === "string") {
    const status = result.startsWith("Đã có flow") ? 409 : 422;
    return NextResponse.json({ error: result }, { status });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
