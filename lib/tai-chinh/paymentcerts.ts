// M17 — Nghiệm thu khối lượng & thanh toán theo đợt (IPC): danh mục trạng thái,
// validate thuần, gợi ý KL từ tiến độ thực tế (trừ luỹ kế đợt trước), tổng hợp
// giá trị đợt (tạm ứng/giữ lại/đề nghị) và cảnh báo luỹ kế vượt giá trị hợp đồng.
// Xem docs/nang-cap/M17-thanh-toan-kl.md.
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { boqExecutedQty } from "@/lib/khoi-luong/boq";
import {
  parseMoneyExact,
  ipcSumV1,
  moneyToWire,
  mulRatio,
  parseFixedDecimalExact,
  type MoneyWireFormat,
} from "@/lib/nen/money";
import { thapPhanTextToWire } from "@/lib/nen/money-dto";
import { nextSeqCode } from "@/lib/ha-tang/seqcode";
import { daysFromTodayISO } from "@/lib/nen/date";
import { log } from "@/lib/nen/log";

export const PAYMENT_CERT_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type PaymentCertStatus = (typeof PAYMENT_CERT_STATUSES)[number];
export const PAYMENT_CERT_STATUS_LABEL: Record<PaymentCertStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};

// Notification cert_pending: đợt 'submitted' quá N ngày chưa được quyết định.
export const CERT_PENDING_DAYS = 5;

const MAX_QTY_PERIOD = 1e11; // chừa chỗ cho qty_cumulative cộng dồn trong NUMERIC(15,3) (< 1e12)

export type CertLineInput = { boqItemId: number; qtyPeriod: number };

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null.
export function validateCertItems(items: CertLineInput[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return "Cần ít nhất 1 dòng khối lượng";
  const seen = new Set<number>();
  for (const [i, it] of items.entries()) {
    const n = i + 1;
    if (!Number.isInteger(it.boqItemId)) return `Dòng ${n}: thiếu dòng BOQ`;
    if (!Number.isFinite(it.qtyPeriod) || it.qtyPeriod < 0)
      return `Dòng ${n}: khối lượng đợt này phải ≥ 0`;
    // qty_period NUMERIC(15,3): vượt cận → INSERT tràn sau khi đã DELETE dòng cũ (500).
    if (it.qtyPeriod >= MAX_QTY_PERIOD) return `Dòng ${n}: khối lượng đợt này quá lớn`;
    if (seen.has(it.boqItemId)) return `Dòng ${n}: dòng BOQ trùng lặp trong cùng đợt`;
    seen.add(it.boqItemId);
  }
  return null;
}

export type CertItemRow = {
  id: number;
  boqItemId: number;
  boqCode: string;
  boqName: string;
  boqUnit: string;
  boqQtyContract: number;
  qtyPeriod: number;
  qtyCumulative: number;
  unitPrice: number;
};

export type PaymentCertRow = {
  id: number;
  code: string;
  contractId: number;
  contractCode: string;
  contractTitle: string;
  periodNo: number;
  periodLabel: string | null;
  status: PaymentCertStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Người quyết định bước cuối (SoD M129: người này không được tự đánh dấu đã chi). */
  decidedBy: number | null;
  rejectReason: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  items: CertItemRow[];
  /** M129: phiếu thanh toán sinh khi duyệt (type='bill') + trạng thái chi; null khi chưa duyệt. */
  bill: CertBill | null;
};

export type CertBill = {
  id: number;
  payStatus: "committed" | "paid" | "void";
  paidAt: string | null;
  paidRef: string | null;
};

async function fetchCerts(where: string, ...params: unknown[]): Promise<PaymentCertRow[]> {
  const rows = await query<PaymentCertRow>(
    `SELECT c.id, c.code, c.contract_id AS "contractId", ct.code AS "contractCode",
            ct.title AS "contractTitle", c.period_no AS "periodNo", c.period_label AS "periodLabel",
            c.status, c.submitted_at AS "submittedAt", c.decided_at AS "decidedAt",
            c.decided_by AS "decidedBy", c.reject_reason AS "rejectReason",
            c.created_by AS "createdBy", u.name AS "createdByName", c.created_at AS "createdAt",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id, 'boqItemId', i.boq_item_id, 'boqCode', bi.code, 'boqName', bi.name,
                  'boqUnit', bi.unit, 'boqQtyContract', bi.qty_contract,
                  'qtyPeriod', i.qty_period, 'qtyCumulative', i.qty_cumulative,
                  'unitPrice', i.unit_price
                ) ORDER BY bi.code
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) AS items,
            (SELECT json_build_object('id', pb.id, 'payStatus', pb.pay_status,
                                      'paidAt', pb.paid_at, 'paidRef', pb.paid_ref)
               FROM payment_bills pb
              WHERE pb.payment_cert_id = c.id AND pb.type = 'bill'
              ORDER BY pb.id DESC LIMIT 1) AS bill
       FROM payment_certs c
       JOIN contracts ct ON ct.id = c.contract_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN payment_cert_items i ON i.cert_id = c.id
       LEFT JOIN boq_items bi ON bi.id = i.boq_item_id
      ${where}
      GROUP BY c.id, ct.code, ct.title, u.name
      ORDER BY c.contract_id, c.period_no`,
    ...params,
  );
  return rows;
}

export async function listCertsByContract(contractId: number): Promise<PaymentCertRow[]> {
  return fetchCerts("WHERE c.contract_id = ?", contractId);
}

export async function getCert(id: number): Promise<PaymentCertRow | undefined> {
  return (await fetchCerts("WHERE c.id = ?", id))[0];
}

/** Đọc một đợt IPC trong đúng dự án đang chọn; projectId rỗng luôn fail-closed. */
export async function getCertForProject(
  id: number,
  projectId: number | null,
): Promise<PaymentCertRow | undefined> {
  if (projectId == null) return undefined;
  return (await fetchCerts("WHERE c.id = ? AND ct.project_id = ?", id, projectId))[0];
}

export async function nextPeriodNo(contractId: number): Promise<number> {
  const row = await queryOne<{ maxNo: number }>(
    `SELECT COALESCE(MAX(period_no), 0) AS "maxNo" FROM payment_certs WHERE contract_id = ?`,
    contractId,
  );
  return (row?.maxNo ?? 0) + 1;
}

export async function nextCertCode(): Promise<string> {
  return nextSeqCode("payment_certs", "code", "IPC-", 4);
}

// KL gợi ý cho đợt mới của 1 hợp đồng: với mỗi dòng BOQ thuộc contract_id, lấy KL
// thực hiện luỹ kế theo tiến độ (boqExecutedQty, M1) trừ qty_cumulative của đợt
// 'approved' gần nhất cùng dòng (đợt draft/rejected không tính) — không âm.
export async function suggestQtyForContract(contractId: number): Promise<
  {
    boqItemId: number;
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
    qtySuggested: number;
  }[]
> {
  const items = await query<{
    id: number;
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
  }>(
    `SELECT id, code, name, unit, unit_price AS "unitPrice" FROM boq_items WHERE contract_id = ? ORDER BY code`,
    contractId,
  );

  const lastCumulative = await query<{ boqItemId: number; qtyCumulative: number }>(
    `SELECT DISTINCT ON (i.boq_item_id) i.boq_item_id AS "boqItemId", i.qty_cumulative AS "qtyCumulative"
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
      WHERE c.contract_id = ? AND c.status = 'approved'
      ORDER BY i.boq_item_id, c.period_no DESC`,
    contractId,
  );
  const cumMap = new Map(lastCumulative.map((r) => [r.boqItemId, Number(r.qtyCumulative)]));

  const result = [];
  for (const it of items) {
    const executed = await boqExecutedQty(it.id);
    const already = cumMap.get(it.id) ?? 0;
    result.push({
      boqItemId: it.id,
      code: it.code,
      name: it.name,
      unit: it.unit,
      unitPrice: Number(it.unitPrice),
      qtySuggested: Math.max(0, executed - already),
    });
  }
  return result;
}

// Chặn nhầm hợp đồng: mọi boqItemId gửi lên phải có contract_id = contractId của cert.
// Trả thông điệp lỗi dòng đầu tiên sai, hoặc null nếu tất cả đều đúng.
export async function checkCertLinesBelongToContract(
  contractId: number,
  boqItemIds: number[],
): Promise<string | null> {
  if (boqItemIds.length === 0) return null;
  const rows = await query<{ id: number }>(
    `SELECT id FROM boq_items WHERE id = ANY(?) AND contract_id = ?`,
    boqItemIds,
    contractId,
  );
  const ok = new Set(rows.map((r) => r.id));
  const bad = boqItemIds.find((id) => !ok.has(id));
  return bad != null ? `Dòng BOQ #${bad} không thuộc hợp đồng này` : null;
}

// Xoá dòng cũ + ghi lại toàn bộ dòng KL của đợt (dùng cho tạo mới và PATCH khi
// draft) — snapshot lại unit_price từ boq_items hiện tại + tự tính qty_cumulative
// = luỹ kế đợt 'approved' gần nhất cùng dòng (chưa tính đợt draft/rejected khác) + qty_period.
// S13d: tự bọc `withTransaction` — DELETE + INSERT luôn atomic kể cả khi caller quên mở
// transaction (lỗi giữa chừng không để đợt mất dòng KL); trong transaction của caller (PATCH/POST,
// cùng khoá HĐ → đợt + cập nhật header) thì dùng lại chính transaction đó.
export async function saveCertItems(
  certId: number,
  contractId: number,
  lines: CertLineInput[],
): Promise<void> {
  await withTransaction(() => ghiDongKlDot(certId, contractId, lines));
}

async function ghiDongKlDot(
  certId: number,
  contractId: number,
  lines: CertLineInput[],
): Promise<void> {
  const lastCumulative = await query<{ boqItemId: number; qtyCumulative: number }>(
    `SELECT DISTINCT ON (i.boq_item_id) i.boq_item_id AS "boqItemId", i.qty_cumulative AS "qtyCumulative"
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
      WHERE c.contract_id = ? AND c.status = 'approved' AND c.id <> ?
      ORDER BY i.boq_item_id, c.period_no DESC`,
    contractId,
    certId,
  );
  const cumMap = new Map(lastCumulative.map((r) => [r.boqItemId, Number(r.qtyCumulative)]));

  const boqItems = await query<{ id: number; unitPrice: number }>(
    `SELECT id, unit_price AS "unitPrice" FROM boq_items WHERE id = ANY(?)`,
    lines.map((l) => l.boqItemId),
  );
  const priceMap = new Map(boqItems.map((b) => [b.id, Number(b.unitPrice)]));

  await run(`DELETE FROM payment_cert_items WHERE cert_id = ?`, certId);
  for (const line of lines) {
    const already = cumMap.get(line.boqItemId) ?? 0;
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, ?, ?, ?)`,
      certId,
      line.boqItemId,
      line.qtyPeriod,
      already + line.qtyPeriod,
      priceMap.get(line.boqItemId) ?? 0,
    );
  }
}

/** Một dòng IPC có khối lượng luỹ kế vượt khối lượng hợp đồng của chính dòng BOQ đó. */
export type DongVuotHopDong = {
  boqItemId: number;
  code: string;
  name: string;
  unit: string;
  qtyContract: number;
  qtyCumulative: number;
};

/**
 * Các dòng của một đợt IPC có luỹ kế vượt khối lượng hợp đồng.
 *
 * CẢNH BÁO, KHÔNG CHẶN (quyết định người dùng 2026-09-04): vượt khối lượng là tình huống
 * nghiệp vụ THẬT — nhà thầu thi công vượt trong khi VO/phụ lục còn đang chờ duyệt — nên chặn
 * cứng sẽ cản quy trình. Nhưng im lặng cho qua thì người ký duyệt IPC không có cách nào biết,
 * và đây là tiền thật. Vì vậy route trả kèm danh sách này để UI nêu rõ từng dòng.
 *
 * Trước đợt này KHÔNG có lớp nào so khối lượng với hợp đồng: `validateCertItems` chỉ kiểm
 * qty >= 0 và không trùng dòng; `saveCertItems` ghi thẳng; `overContractCerts` chỉ so GIÁ TRỊ
 * TIỀN của cả hợp đồng và không được route gọi. Nhập gấp 10 lần khối lượng hợp đồng vẫn lưu
 * được, không một dấu hiệu nào.
 */
export async function dongVuotHopDong(certId: number): Promise<DongVuotHopDong[]> {
  return dongVuotTu(await dongLuyKeHieuLuc(certId));
}

/** Lọc dòng vượt HĐ từ luỹ kế hiệu lực → dạng cảnh báo trả API (dùng chung GET/PATCH/decide). */
export function dongVuotTu(dong: readonly DongLuyKe[]): DongVuotHopDong[] {
  return dong
    .filter((d) => d.vuot)
    .map((d) => ({
      boqItemId: d.boqItemId,
      code: d.code,
      name: d.name,
      unit: d.unit,
      // Khối lượng (không phải tiền) — giữ kiểu number như API cũ; nguồn exact ở dongLuyKeHieuLuc.
      qtyContract: Number(d.qtyContract),
      qtyCumulative: Number(d.qtyCumulative),
    }));
}

/** Một dòng KL của đợt kèm luỹ kế HIỆU LỰC — mọi số là chuỗi NUMERIC exact (`::text`). */
export type DongLuyKe = {
  boqItemId: number;
  code: string;
  name: string;
  unit: string;
  qtyContract: string;
  qtyPeriod: string;
  qtyCumulative: string;
  unitPrice: string;
  vuot: boolean;
};

// Luỹ kế của một dòng tính lại từ tập đợt ĐÃ DUYỆT có kỳ NHỎ HƠN kỳ đang xét (A5-FR06): luỹ kế
// của đợt approved gần nhất có dòng BOQ đó + KL kỳ này. Không SUM các luỹ kế snapshot (đếm lặp),
// không tin luỹ kế lưu từ lúc nháp (đợt legacy mở song song từng lưu 90 + 10 = 100 thay vì 120).
const LUY_KE_KY_TRUOC_SQL = `COALESCE((
       SELECT pi.qty_cumulative
         FROM payment_cert_items pi
         JOIN payment_certs pc ON pc.id = pi.cert_id
        WHERE pc.contract_id = c.contract_id AND pc.status = 'approved'
          AND pc.period_no < c.period_no AND pi.boq_item_id = i.boq_item_id
        ORDER BY pc.period_no DESC
        LIMIT 1), 0)`;

/**
 * Dòng KL + luỹ kế hiệu lực của một đợt. Đợt còn mở (nháp/đã trình) → luỹ kế tính lại theo
 * `LUY_KE_KY_TRUOC_SQL` (đúng con số mà quyết định sẽ chốt); đợt đã duyệt/từ chối → snapshot đã
 * lưu, không tính lại bằng dữ liệu hôm nay. Cảnh báo vượt HĐ (`vuot`) so trong SQL bằng NUMERIC.
 */
export async function dongLuyKeHieuLuc(certId: number): Promise<DongLuyKe[]> {
  return query<DongLuyKe>(
    `SELECT i.boq_item_id AS "boqItemId", b.code, b.name, b.unit,
            b.qty_contract::text AS "qtyContract", i.qty_period::text AS "qtyPeriod",
            lk.cum::text AS "qtyCumulative", i.unit_price::text AS "unitPrice",
            lk.cum > b.qty_contract AS vuot
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
       JOIN boq_items b ON b.id = i.boq_item_id
       CROSS JOIN LATERAL (
         SELECT CASE WHEN c.status IN ('draft', 'submitted')
                     THEN i.qty_period + ${LUY_KE_KY_TRUOC_SQL}
                     ELSE i.qty_cumulative END AS cum
       ) lk
      WHERE i.cert_id = ?
      ORDER BY b.code, i.boq_item_id`,
    certId,
  );
}

/**
 * Ghi lại `qty_cumulative` của một đợt CÒN MỞ theo luỹ kế hiệu lực (A5-FR06). Gọi DƯỚI khoá
 * hợp đồng → đợt (submit/decide) để không lấy luỹ kế cũ khi kỳ trước vừa được duyệt. Đợt đã
 * duyệt/từ chối không bao giờ bị sửa (điều kiện status trong chính câu UPDATE).
 */
export async function tinhLaiLuyKeDot(certId: number): Promise<void> {
  await run(
    `UPDATE payment_cert_items i
        SET qty_cumulative = i.qty_period + ${LUY_KE_KY_TRUOC_SQL}
       FROM payment_certs c
      WHERE c.id = i.cert_id AND i.cert_id = ? AND c.status IN ('draft', 'submitted')`,
    certId,
  );
}

/** Tổng giá trị một đợt IPC — mọi khoản là MoneyMinor (bigint đồng×100), không qua float. */
export type CertTotals = {
  periodValue: bigint;
  cumulativeValue: bigint;
  advanceDeduct: bigint;
  retentionDeduct: bigint;
  approvedValue: bigint;
};

const ZERO_TOTALS: CertTotals = {
  periodValue: 0n,
  cumulativeValue: 0n,
  advanceDeduct: 0n,
  retentionDeduct: 0n,
  approvedValue: 0n,
};

/** Dòng KL của đợt ở dạng exact (`::text` ngay trong SQL) — nguồn cho tính tiền và export. */
export type CertLineExact = {
  id: number;
  qtyPeriod: string;
  qtyCumulative: string;
  unitPrice: string;
};

export async function certLinesExact(certId: number): Promise<CertLineExact[]> {
  return query<CertLineExact>(
    `SELECT id, qty_period::text AS "qtyPeriod", qty_cumulative::text AS "qtyCumulative",
            unit_price::text AS "unitPrice"
       FROM payment_cert_items WHERE cert_id = ? ORDER BY id`,
    certId,
  );
}

// Giá trị đợt theo quy tắc chứng từ ipc-sum-v1 (A3-FR05, `ipcSumV1`): periodValue =
// round(Σ qty_period×unit_price, 2) — không round từng dòng; tạm ứng/giữ lại = round(periodValue
// × % hợp đồng) từng khoản, tỷ lệ là phân số exact (10,25% = 1025/10000), không nhân float;
// approvedValue = periodValue − tạm ứng − giữ lại. cumulativeValue = round(Σ qty_cumulative ×
// unit_price, 2) cộng trong SQL. Mọi số đọc về bằng `::text` (parser NUMERIC toàn cục là float).
export async function certTotals(certId: number): Promise<CertTotals> {
  const cert = await queryOne<{ advancePct: string | null; retentionPct: string | null }>(
    `SELECT ct.advance_pct::text AS "advancePct", ct.retention_pct::text AS "retentionPct"
       FROM payment_certs c LEFT JOIN contracts ct ON ct.id = c.contract_id
      WHERE c.id = ?`,
    certId,
  );
  if (!cert) return { ...ZERO_TOTALS };
  // Cột tỷ lệ NOT NULL DEFAULT 0 → null CHỈ khi không đọc được dòng hợp đồng (vd RLS che,
  // dữ liệu hỏng). Không lặng lẽ coi là 0% — tạm ứng/giữ lại sai là tiền thật: fail-fast (500).
  if (cert.advancePct == null || cert.retentionPct == null) {
    log.error("certTotals: không đọc được tỷ lệ hợp đồng của đợt IPC", { certId });
    throw new Error("certTotals: thiếu dòng hợp đồng của đợt IPC");
  }

  const lines = await certLinesExact(certId);
  const agg = await queryOne<{ cumulative: string }>(
    `SELECT COALESCE(SUM(qty_cumulative * unit_price), 0)::text AS cumulative
       FROM payment_cert_items WHERE cert_id = ?`,
    certId,
  );
  const v1 = ipcSumV1(lines, { advancePct: cert.advancePct, retentionPct: cert.retentionPct });
  return { ...v1, cumulativeValue: parseMoneyExact(agg?.cumulative ?? "0") };
}

/**
 * Thành tiền một dòng làm tròn tới ĐỒNG nguyên (ties xa 0) — chỉ để HIỂN THỊ (PDF). qty scale 3
 * × đơn giá scale 2 = scale 5, nhân bigint rồi chia 10^5; không nhân float (1,005 × 100,00 =
 * 100,5 → 101 đ, float cho 100,4999… → 100 đ). Tổng đợt vẫn theo ipc-sum-v1, không cộng số này.
 */
export function certLineDong(line: { qtyPeriod: string; unitPrice: string }): bigint {
  const product =
    parseFixedDecimalExact(line.qtyPeriod, 3) * parseFixedDecimalExact(line.unitPrice, 2);
  return mulRatio(product, 1n, 100000n);
}

/** Đồng nguyên (bigint) → "1.234.567 đ" kiểu vi-VN, không qua Number. */
export function formatDongVi(dong: bigint): string {
  return `${dong.toLocaleString("vi-VN")} đ`;
}

/** Tên các trường tiền của `CertTotals` — dùng chung cho adapter wire và test. */
export const CERT_TOTALS_FIELDS = [
  "periodValue",
  "cumulativeValue",
  "advanceDeduct",
  "retentionDeduct",
  "approvedValue",
] as const satisfies readonly (keyof CertTotals)[];

/** `CertTotals` sau khi che quyền: trường bị che là null (không bao giờ thành 0). */
export type CertTotalsMasked = { [K in keyof CertTotals]: bigint | null };
export type CertTotalsWire = { [K in keyof CertTotals]: string | number | null };

/**
 * Adapter DTO (A3-FR06): decimal-string-v1 → chuỗi canonical 2 số lẻ; legacy → JSON number qua
 * `moneyToNumberSafe` (ngoài biên throw RangeError "money_precision_unsupported" — route trả 422,
 * không clamp). Trường đã che (null) giữ null. Gọi SAU khi che để lỗi 422 không lộ độ lớn số
 * tiền cho người thiếu quyền xem.
 */
export function certTotalsToWire(
  totals: CertTotalsMasked,
  format: MoneyWireFormat,
): CertTotalsWire {
  const out = {} as CertTotalsWire;
  for (const field of CERT_TOTALS_FIELDS) {
    const minor = totals[field];
    out[field] = minor == null ? null : moneyToWire(minor, format);
  }
  return out;
}

/** Dòng KL của đợt cho DTO chi tiết (S10a): mọi cột NUMERIC đọc `::text` ngay trong SQL. */
export type CertItemExact = CertLineExact & { boqQtyContract: string };

export async function certItemsExact(certId: number): Promise<CertItemExact[]> {
  return query<CertItemExact>(
    `SELECT i.id, i.qty_period::text AS "qtyPeriod", i.qty_cumulative::text AS "qtyCumulative",
            i.unit_price::text AS "unitPrice", bi.qty_contract::text AS "boqQtyContract"
       FROM payment_cert_items i JOIN boq_items bi ON bi.id = i.boq_item_id
      WHERE i.cert_id = ? ORDER BY i.id`,
    certId,
  );
}

/**
 * Dòng KL exact của MỌI đợt thuộc một hợp đồng, gom theo `certId` — nguồn cho DTO danh sách
 * `GET /api/payment-certs?contractId=` (S13d, cùng adapter `certItemsToWire` với chi tiết).
 */
export async function certItemsExactByContract(
  contractId: number,
): Promise<Map<number, CertItemExact[]>> {
  const rows = await query<CertItemExact & { certId: number }>(
    `SELECT i.cert_id AS "certId", i.id, i.qty_period::text AS "qtyPeriod",
            i.qty_cumulative::text AS "qtyCumulative", i.unit_price::text AS "unitPrice",
            bi.qty_contract::text AS "boqQtyContract"
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
       JOIN boq_items bi ON bi.id = i.boq_item_id
      WHERE c.contract_id = ? ORDER BY i.id`,
    contractId,
  );
  const out = new Map<number, CertItemExact[]>();
  for (const { certId, ...dong } of rows) out.set(certId, [...(out.get(certId) ?? []), dong]);
  return out;
}

/** Scale nguồn: qty NUMERIC(15,3) (cả boq_items.qty_contract), unit_price NUMERIC(15,2). */
const CERT_ITEM_DECIMAL_SCALE = {
  unitPrice: 2,
  qtyPeriod: 3,
  qtyCumulative: 3,
  boqQtyContract: 3,
} as const;
type CertItemDecimalField = keyof typeof CERT_ITEM_DECIMAL_SCALE;

/** Dòng KL trên wire: v1 → chuỗi canonical; legacy → number; trường đã che giữ null. */
export type CertItemWire = Omit<CertItemRow, CertItemDecimalField> & {
  [K in CertItemDecimalField]: string | number | null;
};

/**
 * Adapter DTO dòng KL (S10a, A3-FR06): giá trị lấy từ `exact` (`certItemsExact`, `::text`) theo
 * id dòng, KHÔNG từ số float của `json_agg`. Gọi SAU `stripSensitive` — trường đã che (null)
 * giữ null ở cả hai định dạng. Thiếu dòng exact → throw (không fallback float im lặng).
 */
export function certItemsToWire(
  items: readonly CertItemRow[],
  exact: readonly CertItemExact[],
  format: MoneyWireFormat,
): CertItemWire[] {
  const byId = new Map(exact.map((e) => [e.id, e]));
  return items.map((item) => {
    const src = byId.get(item.id);
    if (!src) throw new Error(`certItemsToWire: thiếu dòng exact cho dòng KL ${item.id}`);
    const out: CertItemWire = { ...item };
    for (const field of Object.keys(CERT_ITEM_DECIMAL_SCALE) as CertItemDecimalField[]) {
      if (item[field] == null) {
        out[field] = null;
        continue;
      }
      out[field] = thapPhanTextToWire(src[field], CERT_ITEM_DECIMAL_SCALE[field], format);
    }
    return out;
  });
}

// Giá trị luỹ kế đã nghiệm thu của 1 hợp đồng (biểu thức SQL theo `contractIdExpr` — hằng `?`
// hoặc cột `c.id`, không bao giờ là giá trị người dùng) = Σ qty_cumulative × unit_price của đợt
// 'approved' mới nhất mỗi dòng BOQ, cộng NUMERIC trong SQL rồi làm tròn 2 số lẻ SAU khi cộng (như
// ipc-sum-v1) — không qua float JS (S13d, M45).
function luyKeHopDongSql(contractIdExpr: string): string {
  return `ROUND(COALESCE((
       SELECT SUM(v) FROM (
         SELECT DISTINCT ON (i.boq_item_id) i.qty_cumulative * i.unit_price AS v
           FROM payment_cert_items i
           JOIN payment_certs pc ON pc.id = i.cert_id
          WHERE pc.contract_id = ${contractIdExpr} AND pc.status = 'approved'
          ORDER BY i.boq_item_id, pc.period_no DESC
       ) t), 0), 2)`;
}

/** Luỹ kế nghiệm thu của 1 hợp đồng — MoneyMinor (bigint đồng×100), đọc `::text`. */
export async function contractCumulativeValue(contractId: number): Promise<bigint> {
  const row = await queryOne<{ total: string }>(
    `SELECT ${luyKeHopDongSql("?")}::text AS total`,
    contractId,
  );
  return parseMoneyExact(row?.total ?? "0");
}

export type OverContractCert = {
  contractId: number;
  contractCode: string;
  contractTitle: string;
  /** MoneyMinor (bigint đồng×100). */
  cumulativeValue: bigint;
  /** Giá trị HĐ gồm phụ lục — MoneyMinor. */
  contractValue: bigint;
  /** % luỹ kế / giá trị HĐ làm tròn tới số nguyên (ties xa 0); null khi giá trị HĐ ≤ 0. */
  percent: bigint | null;
};

// HĐ có đợt đã duyệt mà luỹ kế nghiệm thu vượt giá trị HĐ (gồm phụ lục) — nguồn
// notification cert_over_contract (dedup theo contract_id, cùng cơ chế cost_over).
// So sánh NUMERIC exact ngay trong SQL (một câu, không N+1); số trả về đọc `::text` → bigint.
// projectId (M22): undefined = không lọc.
export async function overContractCerts(projectId?: number): Promise<OverContractCert[]> {
  const conds = [
    "EXISTS (SELECT 1 FROM payment_certs pc WHERE pc.contract_id = c.id AND pc.status = 'approved')",
  ];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    contractId: number;
    contractCode: string;
    contractTitle: string;
    cumulativeValue: string;
    contractValue: string;
  }>(
    `SELECT c.id AS "contractId", c.code AS "contractCode", c.title AS "contractTitle",
            lk.cum::text AS "cumulativeValue", gt.v::text AS "contractValue"
       FROM contracts c
       CROSS JOIN LATERAL (
         SELECT c.value + COALESCE(
                  (SELECT SUM(value_delta) FROM contract_addenda WHERE contract_id = c.id), 0) AS v
       ) gt
       CROSS JOIN LATERAL (SELECT ${luyKeHopDongSql("c.id")} AS cum) lk
      WHERE ${conds.join(" AND ")} AND lk.cum > gt.v
      ORDER BY c.id`,
    ...args,
  );
  return rows.map((r) => {
    const cumulativeValue = parseMoneyExact(r.cumulativeValue);
    const contractValue = parseMoneyExact(r.contractValue);
    return {
      contractId: r.contractId,
      contractCode: r.contractCode,
      contractTitle: r.contractTitle,
      cumulativeValue,
      contractValue,
      percent: contractValue > 0n ? mulRatio(cumulativeValue, 100n, contractValue) : null,
    };
  });
}

// Đợt 'submitted' quá CERT_PENDING_DAYS ngày chưa được quyết định → nhắc Admin/PM.
// projectId (M22): undefined = không lọc.
export async function pendingCerts(
  days = CERT_PENDING_DAYS,
  projectId?: number,
): Promise<{ id: number; code: string; contractCode: string; submittedAt: string }[]> {
  const limit = daysFromTodayISO(-days);
  const conds = ["c.status = 'submitted'", "c.submitted_at IS NOT NULL", "c.submitted_at <= ?"];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("ct.project_id = ?");
    args.push(projectId);
  }
  return query(
    `SELECT c.id, c.code, ct.code AS "contractCode", c.submitted_at AS "submittedAt"
       FROM payment_certs c
       JOIN contracts ct ON ct.id = c.contract_id
      WHERE ${conds.join(" AND ")}
      ORDER BY c.submitted_at`,
    ...args,
  );
}
