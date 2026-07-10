import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  checkDesignChangeRefs,
  getDesignChange,
  markDrawingUpdated,
  parseDesignChangeBody,
  validateDesignChangeInput,
} from "@/lib/designchanges";

export const dynamic = "force-dynamic";

// GET /api/design-changes/:id — chi tiết 1 thay đổi thiết kế. Mọi vai trò đăng nhập.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const designChange = await getDesignChange(id);
  if (!designChange)
    return NextResponse.json({ error: "Không tìm thấy thay đổi thiết kế" }, { status: 404 });

  return NextResponse.json({ designChange });
}

// PATCH /api/design-changes/:id — 2 nhánh:
// - body.markDrawingUpdated=true: đánh dấu đã cập nhật bản vẽ xong sau khi duyệt (thao
//   tác tay, không tự động — spec M32).
// - ngược lại: sửa metadata (tiêu đề/lý do/tác động...) khi còn 'submitted'/'assessing'.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDesignChanges(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa thay đổi thiết kế (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await getDesignChange(id);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy thay đổi thiết kế" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (body.markDrawingUpdated === true) {
    const err = await markDrawingUpdated(id);
    if (err) return NextResponse.json({ error: err }, { status: 409 });
    return NextResponse.json({ ok: true, status: "drawing_updated" });
  }

  if (existing.status !== "submitted" && existing.status !== "assessing")
    return NextResponse.json(
      { error: "Đã có quyết định — chỉ sửa được khi đang chờ duyệt" },
      { status: 409 },
    );

  const merged: Record<string, unknown> = {
    title: existing.title,
    disciplineId: existing.disciplineId,
    drawingId: existing.drawingId,
    requestedByNote: existing.requestedByNote,
    reason: existing.reason,
    impactTechnical: existing.impactTechnical,
    impactCost: existing.impactCost,
    impactSchedule: existing.impactSchedule,
  };
  for (const key of Object.keys(merged)) if (key in body) merged[key] = body[key];
  const input = parseDesignChangeBody(merged);

  const invalid = validateDesignChangeInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkDesignChangeRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  // status='assessing' là chuyển tiếp hợp lệ trước khi quyết (đang đánh giá tác động).
  const nextStatus = body.status === "assessing" ? "assessing" : existing.status;

  await run(
    `UPDATE design_changes SET title = ?, discipline_id = ?, drawing_id = ?, requested_by_note = ?,
            reason = ?, impact_technical = ?, impact_cost = ?, impact_schedule = ?, status = ?
      WHERE id = ?`,
    input.title,
    input.disciplineId,
    input.drawingId,
    input.requestedByNote,
    input.reason,
    input.impactTechnical,
    input.impactCost,
    input.impactSchedule,
    nextStatus,
    id,
  );
  return NextResponse.json({ updated: id });
}

// DELETE /api/design-changes/:id — xoá khi còn chờ duyệt (Admin/PM/Kỹ sư); Admin xoá
// được cả khi đã có quyết định (dọn dữ liệu sai/nhập nhầm).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDesignChanges(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá thay đổi thiết kế (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await getDesignChange(id);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy thay đổi thiết kế" }, { status: 404 });

  const isPending = existing.status === "submitted" || existing.status === "assessing";
  if (!isPending && user.role !== "admin")
    return NextResponse.json({ error: "Đã có quyết định — chỉ Admin xoá được" }, { status: 403 });

  await run(`DELETE FROM design_changes WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
