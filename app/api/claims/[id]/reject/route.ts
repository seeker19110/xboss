import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getClaim, rejectClaim } from "@/lib/claims";

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
  const claim = await getClaim(id, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const settlementNote = typeof body.settlementNote === "string" ? body.settlementNote : "";
  if (!settlementNote.trim())
    return NextResponse.json({ error: "Từ chối claim cần ghi rõ lý do" }, { status: 422 });

  const result = await rejectClaim({ claimId: id, settlementNote, settledBy: user.id });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
