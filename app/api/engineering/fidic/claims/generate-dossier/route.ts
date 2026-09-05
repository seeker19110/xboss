import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  mapDelayEventToFidicClause,
  checkNoticeCompliance,
  calculateTimeImpactAnalysis,
  generateFidicClaimDossier,
} from "@/lib/ky-thuat/engineering-fidic-claim";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/fidic/claims/generate-dossier
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền sinh hồ sơ khiếu nại" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      claimCode = "CLM-EOT-01",
      projectName = "Dự án XBoss Engineering",
      contractType = "FIDIC_RED_1999",
      eventType = "ACCESS_DELAY",
      eventTitle = "Chậm bàn giao trục A1-A5",
      eventDate,
      noticeDate,
      events = [],
      evidences = [],
      dailyOverheadVnd = 25000000,
    } = body;

    const clauseMapping = mapDelayEventToFidicClause(eventType, contractType);
    const compliance = checkNoticeCompliance(eventDate, noticeDate);
    const tia = calculateTimeImpactAnalysis(events, dailyOverheadVnd);

    const dossier = generateFidicClaimDossier({
      claimCode,
      projectName,
      contractType,
      clauseMapping,
      eventTitle,
      eventDate,
      noticeDate,
      eotDays: tia.eotDaysRecommended,
      costVnd: tia.prolongationCostVnd,
      evidences,
    });

    return NextResponse.json({
      success: true,
      data: {
        clauseMapping,
        compliance,
        tia,
        dossier,
      },
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
