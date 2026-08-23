import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { createFidicClaim, listFidicClaims } from "@/lib/ky-thuat/engineering-fidic-claim";

export const dynamic = "force-dynamic";

// GET /api/engineering/fidic/claims
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem hồ sơ khiếu nại" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);

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
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền lập hồ sơ khiếu nại" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

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
