import { NextRequest, NextResponse } from "next/server";
import { todayISO } from "@/lib/nen/date";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  bundleDigitalHandoverPassport,
  saveDigitalHandoverPassport,
  listDigitalHandoverPassports,
  HandoverSummaryInput,
} from "@/lib/ky-thuat/engineering-digital-handover";

export const dynamic = "force-dynamic";

// GET /api/engineering/digital-handover — Danh sách các Passport bàn giao số LOD 500
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem Passport hoàn công" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listDigitalHandoverPassports(projectId);
    return NextResponse.json({ passports: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/digital-handover — Đóng gói Hồ Sơ Hoàn Công Số LOD 500
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền đóng gói hồ sơ hoàn công" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const passportCode =
      body.passportCode || `PASS-LOD500-${Date.now().toString(36).toUpperCase()}`;
    const input: HandoverSummaryInput = {
      projectTitle: body.projectTitle || "TT AVIO Tháp A (MEPF)",
      handoverDate: body.handoverDate || todayISO(),
      totalSpoolsCount: parseInt(body.totalSpoolsCount, 10) || 128,
      totalBbntCount: parseInt(body.totalBbntCount, 10) || 24,
      totalTcTestsPassed: parseInt(body.totalTcTestsPassed, 10) || 18,
      totalLinearMetersApproved: parseFloat(body.totalLinearMetersApproved) || 4520.0,
      totalDuctAreaApprovedM2: parseFloat(body.totalDuctAreaApprovedM2) || 3850.0,
      verifiedByPmName: user.name || "Giám Đốc Dự Án",
    };

    const passport = bundleDigitalHandoverPassport(passportCode, input);
    const saved = await saveDigitalHandoverPassport(projectId, passport);

    return NextResponse.json({
      success: true,
      passportId: saved.id,
      passport,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
