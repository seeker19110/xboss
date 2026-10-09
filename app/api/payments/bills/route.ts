import { NextRequest, NextResponse } from "next/server";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, queryOne, withProjectScope } from "@/lib/db";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyInputErrorBody,
  moneyWireFormat,
  parseMoneyExact,
  parseMoneyInput,
  parseOptionalMoneyInput,
  parseQuantityInput,
  quantityInputErrorBody,
  type MoneyInput,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
  tienTextToWire,
} from "@/lib/nen/money-dto";
import { isValidDateISO, todayISO } from "@/lib/nen/date";
import type { PayStatus } from "@/lib/tai-chinh/payment-bills";

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
  // M129: trạng thái chi — committed (đã duyệt, chưa chi) | paid (đã chi) | void.
  payStatus: PayStatus;
  paidAt: string | null;
  paidBy: number | null;
  paidByName: string | null;
  paidRef: string | null;
  paidNote: string | null;
  paymentCertId: number | null;
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
           pb.created_at      AS "createdAt",
           pb.pay_status      AS "payStatus",
           pb.paid_at         AS "paidAt",
           pb.paid_by         AS "paidBy",
           pu.name            AS "paidByName",
           pb.paid_ref        AS "paidRef",
           pb.paid_note       AS "paidNote",
           pb.payment_cert_id AS "paymentCertId"
      FROM payment_bills pb
      LEFT JOIN users u ON u.id = pb.created_by AND u.org_id = ?
      LEFT JOIN users pu ON pu.id = pb.paid_by AND pu.org_id = ?
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

/** Tỷ lệ NUMERIC dạng chuỗi ("0.9999") → "99.99" — CHỈ để hiển thị trong thông điệp lỗi. */
function phanTramHienThi(tyLe: string | number): string {
  return String(Number((Number(tyLe) * 100).toFixed(2)));
}

type KetQuaGhiBill =
  { ok: true; id: number; amount: string } | { ok: false; status: 400 | 403 | 404; error: string };

// POST /api/payments/bills
// Body: { responsible, type, amount, paidDate, period?, description?, note?,
//         sheetTypeId?, floorLabel?, pctThisPeriod?, progressSnapshot?, unit?, quantity?, labor?,
//         payStatus? }
// M129: payStatus mặc định 'paid' (giữ hành vi cũ: phiếu nhập tay = đã chi tại paidDate, ghi
// paid_at/paid_by); 'committed' = cam kết chưa chi (đánh dấu chi sau qua …/:id/pay).
// S10 (A3-FR01/FR02): amount/labor đọc qua `parseMoneyInput` (số JSON hoặc chuỗi thập phân thuần;
// "1.234.567" kiểu vi-VN → 400, vượt NUMERIC(15,2) → 422 `amount_overflow`). Bill theo tầng:
// sheet phải thuộc dự án đang chọn; dòng HĐ tầng khoá FOR UPDATE rồi mới cộng Σ % kỳ (NUMERIC,
// cùng dự án) — lượt ghi đồng thời cùng tầng xếp hàng, không cùng lọt qua mốc 100%.
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
  if (b?.payStatus != null && b.payStatus !== "paid" && b.payStatus !== "committed")
    return NextResponse.json({ error: "Trạng thái chi chỉ nhận paid/committed" }, { status: 400 });
  const daChi = b?.payStatus !== "committed";
  // M129: phiếu nhập tay 'paid' = đã chi tại paidDate → cùng luật ngày chi với /pay (không sau
  // hôm nay); 'committed' cho phép ngày dự kiến tương lai.
  if (daChi && (!isValidDateISO(paidDate) || paidDate > todayISO()))
    return NextResponse.json(
      { error: "Ngày chi không hợp lệ hoặc sau hôm nay", code: "paid_at_invalid" },
      { status: 422 },
    );

  const period = (b?.period ?? "").trim() || null;
  const description = (b?.description ?? "").trim() || null;
  const note = (b?.note ?? "").trim() || null;
  const sheetTypeId = b?.sheetTypeId ? Number(b.sheetTypeId) : null;
  if (sheetTypeId != null && (!Number.isSafeInteger(sheetTypeId) || sheetTypeId <= 0))
    return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 400 });
  const floorLabel = b?.floorLabel ? String(b.floorLabel).trim() : null;
  let pctThisPeriod = Number(b?.pctThisPeriod ?? 0);
  if (!Number.isFinite(pctThisPeriod) || pctThisPeriod < 0) pctThisPeriod = 0;
  if (pctThisPeriod > 1) pctThisPeriod = 1;
  let progress = Number(b?.progressSnapshot ?? 0);
  if (!Number.isFinite(progress) || progress < 0) progress = 0;
  if (progress > 1) progress = 1;

  const unit = (b?.unit ?? "").trim() || (type === "bill" ? "LS" : type === "item" ? "Lô" : null);
  // Khối lượng NUMERIC(15,3): rỗng → null; sai dạng/âm → 400, tràn ≥ 10^12 → 422 (trước đây 500).
  let quantity: string | null;
  try {
    quantity = parseQuantityInput(b?.quantity);
  } catch (err) {
    const loi = quantityInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  // Bill theo tầng: amount = contractValue × pct tính TRONG SQL (S10c) — amount client gửi bị bỏ
  // qua. Loại khác (phát sinh/tạm ứng, bill không gắn tầng): amount nhập tay.
  const theoTang = type === "bill" && sheetTypeId != null && !!floorLabel && pctThisPeriod > 0;
  let labor: MoneyInput | null;
  let amountNhap: MoneyInput | null = null;
  try {
    labor = parseOptionalMoneyInput(b?.labor, { label: "Nhân công" });
    if (!theoTang) amountNhap = parseMoneyInput(b?.amount, { label: "Số tiền" });
  } catch (err) {
    const loi = moneyInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  if (labor && labor.unscaled < 0n)
    return NextResponse.json({ error: "Nhân công phải ≥ 0" }, { status: 400 });
  if (amountNhap && amountNhap.unscaled <= 0n)
    return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });

  // M51 PR1: gắn project_id để RLS lọc đúng dự án (suy từ dự án đang chọn, không tin client).
  // Không có dự án khả kiến → 404 như GET/PATCH, không ghi bill project_id NULL.
  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });

  const kq = await withProjectScope(
    projectId,
    async (): Promise<KetQuaGhiBill> => {
      if (sheetTypeId != null) {
        // Sheet phải thuộc dự án đang chọn (cùng org) — không đọc HĐ tầng / ghi bill trỏ dự án khác.
        const sheet = await queryOne<{ id: number }>(
          `SELECT st.id
             FROM sheet_types st
             JOIN towers tw ON tw.id = st.tower_id
             JOIN projects p ON p.id = tw.project_id
            WHERE st.id = ? AND tw.project_id = ? AND p.org_id = ?
              FOR SHARE OF st`,
          sheetTypeId,
          projectId,
          user.orgId,
        );
        if (!sheet) return { ok: false, status: 404, error: "Không tìm thấy hệ trong dự án" };
      }

      let amount = amountNhap?.text ?? "0";
      if (theoTang) {
        // Khoá dòng HĐ tầng TRƯỚC khi cộng Σ %: lượt ghi đồng thời cùng tầng chờ nhau, lượt sau
        // (READ COMMITTED, câu lệnh mới) thấy bill lượt trước đã commit. pct làm tròn như cột
        // pct_this_period NUMERIC(5,4) để amount đối soát được với % đã lưu (ties xa 0).
        const fc = await queryOne<{ amount: string }>(
          `SELECT ROUND(COALESCE(contract_value, 0) * ROUND(?::numeric, 4), 2)::text AS amount
             FROM floor_contracts
            WHERE sheet_type_id = ? AND floor_label = ?
              FOR UPDATE`,
          pctThisPeriod,
          sheetTypeId,
          floorLabel,
        );
        if (!fc)
          return {
            ok: false,
            status: 400,
            error: `Tầng ${floorLabel} chưa có giá trị hợp đồng — không tính được số tiền`,
          };
        // Σ % so bằng NUMERIC (không dung sai float); chỉ bill của dự án đang chọn — khớp
        // pctPaid mà GET /api/payments/floors hiển thị.
        const da = await queryOne<{ daTra: string; vuot: boolean }>(
          `SELECT COALESCE(SUM(pct_this_period), 0)::text AS "daTra",
                  COALESCE(SUM(pct_this_period), 0) + ROUND(?::numeric, 4) > 1 AS vuot
             FROM payment_bills
            WHERE type = 'bill' AND sheet_type_id = ? AND floor_label = ? AND project_id = ?`,
          pctThisPeriod,
          sheetTypeId,
          floorLabel,
          projectId,
        );
        if (da?.vuot)
          return {
            ok: false,
            status: 400,
            error: `Tầng ${floorLabel} đã thanh toán ${phanTramHienThi(da.daTra)}%, không thể thêm ${phanTramHienThi(pctThisPeriod)}% (vượt 100%)`,
          };
        amount = fc.amount;
      }
      if (parseMoneyExact(amount) <= 0n)
        return { ok: false, status: 400, error: "Số tiền không hợp lệ" };

      // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale). Chạy dưới khoá dòng HĐ tầng, trước lần ghi.
      if (!(await kiemQuyenTaiLucGhi(() => CAN.editStructure(user.role))))
        return { ok: false, status: 403, error: "Chỉ Admin/PM được tạo mục thanh toán" };

      const saved = await queryOne<{ id: number; amount: string }>(
        `
    INSERT INTO payment_bills
           (responsible, type, period, amount, description, paid_date,
            progress_snapshot, note, unit, quantity, labor,
            sheet_type_id, floor_label, pct_this_period, created_by, project_id,
            pay_status, paid_at, paid_by)
    VALUES (?, ?, ?, ?::numeric, ?, ?, ?, ?, ?, ?::numeric, ?::numeric, ?, ?, ?, ?, ?, ?, ?, ?)
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
        labor?.text ?? null,
        sheetTypeId,
        floorLabel,
        pctThisPeriod,
        user.id,
        projectId,
        daChi ? "paid" : "committed",
        daChi ? paidDate : null,
        daChi ? user.id : null,
      );
      return { ok: true, id: saved!.id, amount: saved!.amount };
    },
    { readOnly: false },
  );
  if (!kq.ok) return NextResponse.json({ error: kq.error }, { status: kq.status });

  // Trả amount đã lưu (exact, theo định dạng client chọn) để UI hiển thị đúng số server ghi.
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  return NextResponse.json({
    ok: true,
    id: kq.id,
    amount: tienTextToWire(kq.amount, format),
    ...nhanDinhDangTien(format),
  });
}
