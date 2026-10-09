import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getClaim, rejectClaim } from "@/lib/tai-chinh/claims";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// POST /api/claims/:id/reject — từ chối claim (Admin/PM), bắt buộc settlementNote làm lý do.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được từ chối claim" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  // S02a (A1-AC02): không có dự án khả kiến → 404, không đọc/ghi claim của dự án nào.
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });
  const claim = await getClaim(id, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const settlementNote = typeof body.settlementNote === "string" ? body.settlementNote : "";
  if (!settlementNote.trim())
    return NextResponse.json({ error: "Từ chối claim cần ghi rõ lý do" }, { status: 422 });

  // D01: tái kiểm quyền với dữ liệu có hiệu lực trong cùng transaction với rejectClaim (reentrant).
  const kq = await ghiNeuConQuyen(
    () => CAN.approve(user.role),
    () => rejectClaim({ claimId: id, settlementNote, settledBy: user.id }),
  );
  if (!kq.ok)
    return NextResponse.json({ error: "Chỉ Admin/PM được từ chối claim" }, { status: 403 });
  const result = kq.value;
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
