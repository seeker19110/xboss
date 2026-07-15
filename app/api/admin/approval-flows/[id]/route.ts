import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { deleteApprovalFlow, updateApprovalFlow } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// PATCH /api/admin/approval-flows/:id { name?, active?, steps? } — chỉ Admin. Chặn khi
// còn approval_request 'pending' qua flow này (đổi bước giữa chừng làm currentSeq của
// request đang chờ trỏ vào bước không còn tồn tại).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageApprovalFlows(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình luồng duyệt" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const patch: {
    name?: string;
    active?: boolean;
    steps?: Parameters<typeof updateApprovalFlow>[1]["steps"];
  } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Array.isArray(body.steps))
    patch.steps = body.steps.map((s: Record<string, unknown>) => ({
      seq: Number(s.seq),
      role: String(s.role ?? ""),
      minAmount: s.minAmount != null && s.minAmount !== "" ? Number(s.minAmount) : null,
      slaDays: s.slaDays != null && s.slaDays !== "" ? Number(s.slaDays) : null,
    }));

  const result = await updateApprovalFlow(id, patch);
  if (typeof result === "string") {
    const status = result === "Không tìm thấy flow" ? 404 : 409;
    return NextResponse.json({ error: result }, { status });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/approval-flows/:id — chỉ Admin. Chặn khi flow đã có bất kỳ request
// nào (kể cả đã xong, giữ lịch sử duyệt) — hướng dẫn tắt (active=false) thay vì xoá.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageApprovalFlows(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình luồng duyệt" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const result = await deleteApprovalFlow(id);
  if (typeof result === "string") {
    const status = result === "Không tìm thấy flow" ? 404 : 409;
    return NextResponse.json({ error: result }, { status });
  }
  return NextResponse.json({ deleted: id });
}
