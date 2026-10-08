import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, queryOne, withProjectScope } from "@/lib/db";
import { getCurrentProjectId, getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyWireFormat,
  parseMoneyExact,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
  tienTextToWire,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

export type BillType = "bill" | "advance" | "item";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

type Bill = {
  id: number;
  responsible: string;
  type: BillType;
  period: string | null;
  // S10c: tiền đọc `::text` (exact) → wire ở biên DTO.
  amount: string;
  description: string | null;
  paidDate: string;
  progressSnapshot: number;
  note: string | null;
  unit: string | null;
  quantity: number | null;
  labor: string | null;
  sheetTypeId: number | null;
  floorLabel: string | null;
  pctThisPeriod: number;
  workPackageName: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// GET /api/payments/bills — S10c (A3-FR06): header decimal-string-v1 → amount/labor là chuỗi
// canonical + `moneyFormat`; legacy number (mỗi dòng NUMERIC(15,2) luôn trong biên round-trip).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  if (!CAN.viewPayments(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM/BCH được xem thanh toán" },
      { status: 403, headers: PRIVATE_NO_STORE },
    );

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Không tìm thấy dự án đang chọn" },
      { status: 404, headers: PRIVATE_NO_STORE },
    );

  const bills = await withProjectScope(projectId, () =>
    query<Bill>(
      `
    SELECT pb.id, pb.responsible, pb.type, pb.period,
           pb.amount::text AS amount, pb.description,
           pb.paid_date        AS "paidDate",
           pb.progress_snapshot AS "progressSnapshot",
           pb.note, pb.unit, pb.quantity, pb.labor::text AS labor,
           pb.sheet_type_id   AS "sheetTypeId",
           pb.floor_label     AS "floorLabel",
           st.code            AS "sheetCode",
           COALESCE(pb.pct_this_period, 0) AS "pctThisPeriod",
           wp.name            AS "workPackageName",
           pb.created_by      AS "createdBy",
           u.name             AS "createdByName",
           pb.created_at      AS "createdAt"
      FROM payment_bills pb
      LEFT JOIN users u ON u.id = pb.created_by AND u.org_id = ?
      LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
      LEFT JOIN LATERAL (
        SELECT name FROM work_packages
        WHERE sheet_type_id = pb.sheet_type_id AND floor_label = pb.floor_label
        LIMIT 1
      ) wp ON pb.sheet_type_id IS NOT NULL AND pb.floor_label IS NOT NULL
       WHERE pb.project_id = ?
         AND (pb.contract_id IS NULL OR EXISTS (
           SELECT 1 FROM contracts c JOIN projects cp ON cp.id = c.project_id
            WHERE c.id = pb.contract_id AND c.project_id = ? AND cp.org_id = ?
         ))
         AND (pb.payment_cert_id IS NULL OR EXISTS (
           SELECT 1
             FROM payment_certs pc
             JOIN contracts cc ON cc.id = pc.contract_id
             JOIN projects cp ON cp.id = cc.project_id
            WHERE pc.id = pb.payment_cert_id AND cc.project_id = ? AND cp.org_id = ?
              AND (pb.contract_id IS NULL OR pc.contract_id = pb.contract_id)
         ))
         AND (pb.sheet_type_id IS NULL OR EXISTS (
           SELECT 1
             FROM sheet_types pst
             JOIN towers pt ON pt.id = pst.tower_id
             JOIN projects pp ON pp.id = pt.project_id
            WHERE pst.id = pb.sheet_type_id AND pt.project_id = ? AND pp.org_id = ?
         ))
     ORDER BY pb.paid_date ASC, pb.id ASC`,
      user.orgId,
      projectId,
      projectId,
      user.orgId,
      projectId,
      user.orgId,
      projectId,
      user.orgId,
    ),
  );

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  try {
    return NextResponse.json(
      {
        bills: bills.map((b) => ({
          ...b,
          amount: tienTextToWire(b.amount, format),
          labor: tienTextToWire(b.labor, format),
        })),
        ...nhanDinhDangTien(format),
      },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
}

// POST /api/payments/bills
// Body: { responsible, type, amount, paidDate, period?, description?, note?,
//         sheetTypeId?, floorLabel?, pctThisPeriod?, progressSnapshot? }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo mục thanh toán" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const responsible = (b?.responsible ?? "").trim();
  const type: BillType = ["bill", "advance", "item"].includes(b?.type) ? b.type : "bill";
  const paidDate = (b?.paidDate ?? "").trim();

  if (!responsible) return NextResponse.json({ error: "Thiếu người phụ trách" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 400 });

  const period = (b?.period ?? "").trim() || null;
  const description = (b?.description ?? "").trim() || null;
  const note = (b?.note ?? "").trim() || null;
  const sheetTypeId = b?.sheetTypeId ? Number(b.sheetTypeId) : null;
  const floorLabel = b?.floorLabel ? String(b.floorLabel).trim() : null;
  let pctThisPeriod = Number(b?.pctThisPeriod ?? 0);
  if (!Number.isFinite(pctThisPeriod) || pctThisPeriod < 0) pctThisPeriod = 0;
  if (pctThisPeriod > 1) pctThisPeriod = 1;
  let progress = Number(b?.progressSnapshot ?? 0);
  if (!Number.isFinite(progress) || progress < 0) progress = 0;
  if (progress > 1) progress = 1;

  const unit = (b?.unit ?? "").trim() || (type === "bill" ? "LS" : type === "item" ? "Lô" : null);
  let quantity = b?.quantity != null && b.quantity !== "" ? Number(b.quantity) : null;
  if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) quantity = null;
  let labor = b?.labor != null && b.labor !== "" ? Number(b.labor) : null;
  if (labor != null && (!Number.isFinite(labor) || labor < 0)) labor = null;

  // Tính amount: nếu type=bill + có floor → amount = contractValue × pct — S10c: tích làm TRONG
  // SQL trên NUMERIC (không nhân float JS rồi ghi DB), pct dùng đúng giá trị được lưu
  // (NUMERIC(5,4)) để amount đối soát được với pct_this_period; làm tròn tới xu ties xa 0.
  // Loại khác (phát sinh/tạm ứng): amount nhập tay, giữ cách đọc cũ.
  let amount: number | string = Number(b?.amount);
  if (type === "bill" && sheetTypeId && floorLabel && pctThisPeriod > 0) {
    // Kiểm tra tổng % đã thanh toán (không vượt 100%)
    const sumRow = await queryOne<{ total: number }>(
      `
      SELECT COALESCE(SUM(pct_this_period), 0) AS total
        FROM payment_bills
       WHERE type = 'bill' AND sheet_type_id = ? AND floor_label = ?`,
      sheetTypeId,
      floorLabel,
    );
    const pctPaid = sumRow?.total ?? 0;
    if (pctPaid + pctThisPeriod > 1.0001)
      return NextResponse.json(
        {
          error: `Tầng ${floorLabel} đã thanh toán ${Math.round(pctPaid * 100)}%, không thể thêm ${Math.round(pctThisPeriod * 100)}% (vượt 100%)`,
        },
        { status: 400 },
      );

    // Lấy contract_value × pct (đã làm tròn như cột pct_this_period) — exact trong SQL.
    const fc = await queryOne<{ amount: string }>(
      `
      SELECT ROUND(COALESCE(MAX(contract_value), 0) * ROUND(?::numeric, 4), 2)::text AS amount
        FROM floor_contracts WHERE sheet_type_id = ? AND floor_label = ?`,
      pctThisPeriod,
      sheetTypeId,
      floorLabel,
    );
    amount = fc?.amount ?? "0";
  }

  const amountHopLe =
    typeof amount === "string"
      ? parseMoneyExact(amount) > 0n
      : Number.isFinite(amount) && amount > 0;
  if (!amountHopLe) return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });

  // M51 PR1: gắn project_id để RLS lọc đúng dự án (suy từ dự án đang chọn, không tin client).
  const projectId = await getCurrentProjectId(user);

  const saved = await queryOne<{ id: number; amount: string }>(
    `
    INSERT INTO payment_bills
           (responsible, type, period, amount, description, paid_date,
            progress_snapshot, note, unit, quantity, labor,
            sheet_type_id, floor_label, pct_this_period, created_by, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, amount::text AS amount`,
    responsible,
    type,
    period,
    amount,
    description,
    paidDate,
    progress,
    note,
    unit,
    quantity,
    labor,
    sheetTypeId,
    floorLabel,
    pctThisPeriod,
    user.id,
    projectId,
  );

  // Trả amount đã lưu (exact, theo định dạng client chọn) để UI hiển thị đúng số server ghi.
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  return NextResponse.json({
    ok: true,
    id: saved!.id,
    amount: tienTextToWire(saved!.amount, format),
    ...nhanDinhDangTien(format),
  });
}
