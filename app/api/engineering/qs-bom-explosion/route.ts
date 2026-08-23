import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  reverseBreakdownUnitRate,
  explodeMultiLevelBOM,
  generateFidicClaimDefense,
  saveQsBomExplosion,
  listQsBomExplosions,
} from "@/lib/ky-thuat/engineering-qs-omnipotent";

export const dynamic = "force-dynamic";

// GET /api/engineering/qs-bom-explosion — Lịch sử các phân tích định mức BOM và giải mã đơn giá
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem định mức QS" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listQsBomExplosions(projectId);
    return NextResponse.json({ items: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/qs-bom-explosion — Chạy giải mã ngược đơn giá, BOM Explosion hoặc sinh hồ sơ FIDIC
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực thi nghiệp vụ QS" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "explode_bom";

    if (action === "explode_bom") {
      const itemCode = body.itemCode || "BOQ-FP-DN100";
      const itemDescription =
        body.itemDescription || "Cung cấp và lắp đặt ống thép tráng kẽm nhúng nóng DN100 SCH40";
      const unit = body.unit || "m";
      const contractRateVnd = parseFloat(body.contractRateVnd) || 520000;
      const quantity = parseFloat(body.quantity) || 1.0;

      const breakdown = reverseBreakdownUnitRate(
        itemCode,
        itemDescription,
        unit,
        contractRateVnd,
        "pipe_steel",
      );
      const bom = explodeMultiLevelBOM(itemCode, itemDescription, unit, quantity);

      const saved = await saveQsBomExplosion(projectId, breakdown, bom);

      return NextResponse.json({
        success: true,
        bomId: saved.id,
        breakdown,
        bom,
      });
    }

    if (action === "fidic_claim") {
      const projectName = body.projectName || "TT AVIO Tháp A (MEPF)";
      const claimCode = body.claimCode || `CLM-VO-${Date.now().toString(36).toUpperCase()}`;
      const eventDescription =
        body.eventDescription ||
        "Bổ sung tuyến ống cứu hỏa nhánh do thay đổi mặt bằng chia phòng kiến trúc tầng 5";
      const deltaVoQty = parseFloat(body.deltaVoQty) || 25.5;
      const unitRateVnd = parseFloat(body.unitRateVnd) || 520000;
      const impactDays = parseInt(body.impactDays, 10) || 7;

      const claimDoc = generateFidicClaimDefense(
        projectName,
        claimCode,
        eventDescription,
        deltaVoQty,
        unitRateVnd,
        impactDays,
      );

      return NextResponse.json({ success: true, claimDoc });
    }

    return NextResponse.json({ error: `Hành động ${action} không hợp lệ` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
