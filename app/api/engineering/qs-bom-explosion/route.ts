import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { queryOne } from "@/lib/db";
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
      // Trước đây mọi trường đều có giá trị mặc định BỊA ("BOQ-FP-DN100", 520.000đ/m…) và
      // kết quả được GHI THẲNG vào dự án qua saveQsBomExplosion — gọi API thiếu tham số là
      // sinh ra bản ghi định mức không có thật (audit 2026-08-25 §3.2). Nay bắt buộc đủ
      // tham số, thiếu/không hợp lệ thì 422 và không ghi gì.
      const itemCode = String(body.itemCode ?? "").trim();
      const itemDescription = String(body.itemDescription ?? "").trim();
      const unit = String(body.unit ?? "").trim();
      const contractRateVnd = Number(body.contractRateVnd);
      const quantity = Number(body.quantity);
      if (!itemCode || !itemDescription || !unit)
        return NextResponse.json(
          { error: "Thiếu mã hạng mục, mô tả hoặc đơn vị tính" },
          { status: 422 },
        );
      if (!Number.isFinite(contractRateVnd) || contractRateVnd <= 0)
        return NextResponse.json({ error: "Đơn giá hợp đồng không hợp lệ" }, { status: 422 });
      if (!Number.isFinite(quantity) || quantity <= 0)
        return NextResponse.json({ error: "Khối lượng không hợp lệ" }, { status: 422 });

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
      // Tên dự án lấy từ DB (quy ước: không hard-code tên dự án trong UI/API/export) —
      // trước đây mặc định là tên một dự án cụ thể. Nội dung sự kiện/khối lượng/đơn giá
      // không còn giá trị mặc định bịa: thiếu là 422 (audit 2026-08-25 §3.2).
      const project = await queryOne<{ name: string }>(
        `SELECT name FROM projects WHERE id = ?`,
        projectId,
      );
      const projectName = String(body.projectName ?? "").trim() || project?.name || "";
      const claimCode =
        String(body.claimCode ?? "").trim() || `CLM-VO-${Date.now().toString(36).toUpperCase()}`;
      const eventDescription = String(body.eventDescription ?? "").trim();
      const deltaVoQty = Number(body.deltaVoQty);
      const unitRateVnd = Number(body.unitRateVnd);
      const impactDays = Number.parseInt(String(body.impactDays), 10);
      if (!projectName || !eventDescription)
        return NextResponse.json({ error: "Thiếu tên dự án hoặc mô tả sự kiện" }, { status: 422 });
      if (!Number.isFinite(deltaVoQty) || deltaVoQty <= 0)
        return NextResponse.json({ error: "Khối lượng phát sinh không hợp lệ" }, { status: 422 });
      if (!Number.isFinite(unitRateVnd) || unitRateVnd <= 0)
        return NextResponse.json({ error: "Đơn giá không hợp lệ" }, { status: 422 });
      if (!Number.isFinite(impactDays) || impactDays < 0)
        return NextResponse.json({ error: "Số ngày ảnh hưởng không hợp lệ" }, { status: 422 });

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
