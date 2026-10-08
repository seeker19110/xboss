import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, withProjectScope } from "@/lib/db";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

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

  // S02a cụm 3: dự án đã xác minh (cookie sai/không có dự án khả kiến → 404, không query
  // nghiệp vụ) — tiền lệ GET /api/payments/bills. Lọc dự án vô điều kiện: sheet qua tower,
  // bill theo đúng project_id (dòng legacy project_id NULL không hiện ở dự án nào).
  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Không tìm thấy dự án đang chọn" },
      { status: 404, headers: PRIVATE_NO_STORE },
    );

  const person = req.nextUrl.searchParams.get("person")?.trim() ?? "";
  if (!person) return NextResponse.json({ floors: [] }, { headers: PRIVATE_NO_STORE });

  const [floorRows, histRows] = await withProjectScope("*", () =>
    Promise.all([
      query<FloorBase>(
        `
      SELECT st.id AS "sheetTypeId", st.code AS "sheetType",
             wp.floor_label AS "floorLabel",
             COALESCE(fc.contract_value, 0) AS "contractValue"
        FROM work_packages wp
        JOIN sheet_types st ON wp.sheet_type_id = st.id
        JOIN towers tw ON tw.id = st.tower_id
        LEFT JOIN floor_contracts fc
               ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
       WHERE st.responsible = ?
         AND wp.floor_label IS NOT NULL AND wp.floor_label <> ''
         AND tw.project_id = ?
       GROUP BY st.id, st.code, wp.floor_label, fc.contract_value
       ORDER BY st.id, wp.floor_label`,
        person,
        projectId,
      ),

      query<BillHistory>(
        `
      SELECT sheet_type_id AS "sheetTypeId", floor_label AS "floorLabel",
             period, pct_this_period AS "pctThisPeriod",
             amount, paid_date AS "paidDate"
        FROM payment_bills
       WHERE responsible = ? AND type = 'bill'
         AND sheet_type_id IS NOT NULL AND floor_label IS NOT NULL
         AND project_id = ?
       ORDER BY paid_date ASC, id ASC`,
        person,
        projectId,
      ),
    ]),
  );

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

  return NextResponse.json({ floors }, { headers: PRIVATE_NO_STORE });
}
