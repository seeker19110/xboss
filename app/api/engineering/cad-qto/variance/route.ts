import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { query } from "@/lib/db";
import { compute3WayVariance, QtoVarianceSummary } from "@/lib/engineering-cad-qto";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-qto/variance — Bảng ma trận đối soát khối lượng 3 chiều
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem ma trận khối lượng" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    // 1. Lấy danh sách boq_items của dự án kèm khối lượng Spool sum
    const rows = await query<{
      id: number;
      code: string;
      name: string;
      unit: string;
      qty_contract: number;
      unit_price: number;
      shop_qty_sum: string | number;
      installed_qty_sum: string | number;
      approved_qty_sum: string | number;
    }>(
      `SELECT
        b.id, b.code, b.name, b.unit,
        COALESCE(b.qty_contract, 0) as qty_contract,
        COALESCE(b.unit_price, 500000) as unit_price,
        COALESCE(SUM(s.calculated_qty), 0) as shop_qty_sum,
        COALESCE(SUM(CASE WHEN s.status IN ('installed', 'qc_passed', 'bbnt_approved') THEN s.calculated_qty ELSE 0 END), 0) as installed_qty_sum,
        COALESCE(SUM(CASE WHEN s.status = 'bbnt_approved' THEN s.calculated_qty ELSE 0 END), 0) as approved_qty_sum
       FROM boq_items b
       LEFT JOIN engineering_cad_spools s ON s.boq_item_id = b.id AND s.project_id = b.project_id
       WHERE b.project_id = ?
       GROUP BY b.id, b.code, b.name, b.unit, b.qty_contract, b.unit_price
       ORDER BY b.code ASC
       LIMIT 50`,
      projectId,
    );

    const summaries: QtoVarianceSummary[] = rows.map((r) => {
      const contractQty = Number(r.qty_contract) || 0;
      const shopQty = Number(r.shop_qty_sum) || 0;
      const installedQty = Number(r.installed_qty_sum) || 0;
      const approvedQty = Number(r.approved_qty_sum) || 0;
      const unitRate = Number(r.unit_price) || 500000;

      const v = compute3WayVariance(contractQty, shopQty, installedQty, approvedQty, unitRate);

      return {
        boqItemId: r.id,
        boqCode: r.code,
        boqName: r.name,
        unit: r.unit || "m",
        qtyContract: contractQty,
        qtyShopCad: shopQty,
        qtyInstalled: installedQty,
        qtyApprovedBbnt: approvedQty,
        deltaVoQty: v.deltaVoQty,
        estimatedVoVnd: v.estimatedVoVnd,
        unitRateVnd: unitRate,
        status: v.status,
        riskMessage: v.riskMessage,
      };
    });

    return NextResponse.json({
      variances: summaries,
      totalVoImpactVnd: summaries.reduce((acc, s) => acc + s.estimatedVoVnd, 0),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
