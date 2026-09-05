import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { createFidicClaim, listFidicClaims } from "@/lib/ky-thuat/engineering-fidic-claim";

export const dynamic = "force-dynamic";

// GET /api/engineering/fidic/claims
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem hồ sơ khiếu nại" }, { status: 403 });
  }

  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query.
  const projectId = (await getCurrentProjectId(user)) || 1;

  try {
    const claims = await listFidicClaims(projectId);
    return NextResponse.json({ success: true, data: claims });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/fidic/claims
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền lập hồ sơ khiếu nại" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

    if (!body.claimCode || !body.eventTitle || !body.eventDate || !body.noticeDate) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (claimCode, eventTitle, eventDate, noticeDate)" },
        { status: 422 },
      );
    }

    const claim = await createFidicClaim({
      projectId,
      claimCode: body.claimCode,
      contractType: body.contractType || "FIDIC_RED_1999",
      eventType: body.eventType || "ACCESS_DELAY",
      eventTitle: body.eventTitle,
      eventDate: body.eventDate,
      noticeDate: body.noticeDate,
      eotDaysClaimed: Number(body.eotDaysClaimed || 0),
      costClaimedVnd: Number(body.costClaimedVnd || 0),
      evidences: body.evidences || [],
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: claim });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
