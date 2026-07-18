import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

type FloorBase = {
  sheetTypeId: number;
  sheetType: string;
  floorLabel: string;
  contractValue: number;
};
type BillHistory = {
  sheetTypeId: number;
  floorLabel: string;
  period: string | null;
  pctThisPeriod: number;
  amount: number;
  paidDate: string;
};

// GET /api/payments/floors?person=X
// Trả danh sách tầng × hệ cho người phụ trách, kèm lịch sử thanh toán.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem thanh toán" }, { status: 403 });

  const person = req.nextUrl.searchParams.get("person")?.trim() ?? "";
  if (!person) return NextResponse.json({ floors: [] });

  // Dự án đang chọn — lọc chéo dự án (giống pattern app/api/notifications/route.ts).
  // sheet_types không có project_id trực tiếp (suy qua tower_id); payment_bills đã có
  // project_id trực tiếp (migration 0069_rls.sql). null = DB chưa có dự án nào → giữ
  // hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);
  const towerJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const towerFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const towerParam = projectId != null ? [projectId] : [];
  const billProjectFilter = projectId != null ? " AND (project_id = ? OR project_id IS NULL)" : "";
  const billProjectParam = projectId != null ? [projectId] : [];

  const [floorRows, histRows] = await Promise.all([
    query<FloorBase>(
      `
      SELECT st.id AS "sheetTypeId", st.code AS "sheetType",
             wp.floor_label AS "floorLabel",
             COALESCE(fc.contract_value, 0) AS "contractValue"
        FROM work_packages wp
        JOIN sheet_types st ON wp.sheet_type_id = st.id${towerJoin}
        LEFT JOIN floor_contracts fc
               ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
       WHERE st.responsible = ?
         AND wp.floor_label IS NOT NULL AND wp.floor_label <> ''${towerFilter}
       GROUP BY st.id, st.code, wp.floor_label, fc.contract_value
       ORDER BY st.id, wp.floor_label`,
      person,
      ...towerParam,
    ),

    query<BillHistory>(
      `
      SELECT sheet_type_id AS "sheetTypeId", floor_label AS "floorLabel",
             period, pct_this_period AS "pctThisPeriod",
             amount, paid_date AS "paidDate"
        FROM payment_bills
       WHERE responsible = ? AND type = 'bill'
         AND sheet_type_id IS NOT NULL AND floor_label IS NOT NULL${billProjectFilter}
       ORDER BY paid_date ASC, id ASC`,
      person,
      ...billProjectParam,
    ),
  ]);

  // Gộp history vào từng tầng
  const histMap = new Map<string, BillHistory[]>();
  for (const h of histRows) {
    const k = `${h.sheetTypeId}__${h.floorLabel}`;
    const list = histMap.get(k) ?? [];
    list.push(h);
    histMap.set(k, list);
  }

  const floors = floorRows.map((f) => {
    const history = histMap.get(`${f.sheetTypeId}__${f.floorLabel}`) ?? [];
    const pctPaid = history.reduce((s, h) => s + (h.pctThisPeriod ?? 0), 0);
    return { ...f, pctPaid, history };
  });

  return NextResponse.json({ floors });
}
