import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  canEditClaim,
  checkClaimRefs,
  getClaim,
  parseClaimBody,
  validateClaimInput,
} from "@/lib/claims";

export const dynamic = "force-dynamic";

// GET /api/claims/:id — chi tiết 1 claim (kèm số file đính kèm).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem claim" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const claim = await getClaim(id, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });
  return NextResponse.json({ claim });
}

// PATCH /api/claims/:id — sửa thông tin claim (còn đang mở — chưa settled/rejected).
// Không cho đổi status='settled'/'rejected' qua đây — phải qua /settle hoặc /reject.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền sửa claim" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const claim = await getClaim(id, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });
  const editErr = canEditClaim(claim, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  const input = parseClaimBody({
    kind: body.kind ?? claim.kind,
    title: body.title ?? claim.title,
    contractId: body.contractId !== undefined ? body.contractId : claim.contractId,
    voId: body.voId !== undefined ? body.voId : claim.voId,
    noticeDate: body.noticeDate ?? claim.noticeDate,
    cause: body.cause ?? claim.cause,
    amountRequested:
      body.amountRequested !== undefined ? body.amountRequested : claim.amountRequested,
    daysRequested: body.daysRequested !== undefined ? body.daysRequested : claim.daysRequested,
  });
  const validationErr = validateClaimInput(input);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
  const refErr = await checkClaimRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  // status: chỉ cho phép trong nhóm "đang mở" (notice/quantified/negotiating) — chốt/từ
  // chối bắt buộc đi qua /settle /reject (kiểm tra CAN.approve + ghi audit riêng).
  let status = claim.status;
  if (typeof body.status === "string" && body.status.trim()) {
    const nextStatus = body.status.trim();
    if (nextStatus === "settled" || nextStatus === "rejected")
      return NextResponse.json(
        { error: "Chốt/từ chối claim phải qua /api/claims/:id/settle hoặc /reject" },
        { status: 422 },
      );
    if (!["notice", "quantified", "negotiating"].includes(nextStatus))
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
    status = nextStatus as typeof claim.status;
  }

  await run(
    `UPDATE claims
        SET kind = ?, title = ?, contract_id = ?, vo_id = ?, notice_date = ?, cause = ?,
            amount_requested = ?, days_requested = ?, status = ?
      WHERE id = ?`,
    input.kind,
    input.title,
    input.contractId,
    input.voId,
    input.noticeDate,
    input.cause,
    input.amountRequested,
    input.daysRequested,
    status,
    id,
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/claims/:id — xoá claim (còn đang mở — chưa settled/rejected).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xoá claim" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const claim = await getClaim(id, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });
  const editErr = canEditClaim(claim, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

  await run(`DELETE FROM claims WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
