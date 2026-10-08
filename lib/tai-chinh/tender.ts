// M7 — Đấu thầu / so sánh báo giá gói giao thầu phụ: danh mục trạng thái, validate
// thuần, bảng so sánh giá theo dòng BOQ × nhà thầu, và trao thầu (sinh hợp đồng
// giao thầu — contracts, M16). Xem docs/nang-cap/M07-dau-thau.md.
import { parseMoneyInput } from "@/lib/nen/money";
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { nextSeqCode } from "@/lib/ha-tang/seqcode";
import {
  fitsNumeric,
  moneyToDecimal,
  moneyToWire,
  parseMoney,
  type MoneyWireFormat,
} from "@/lib/nen/money";

export const TENDER_STATUSES = ["draft", "open", "closed", "awarded", "cancelled"] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];
export const TENDER_STATUS_LABEL: Record<TenderStatus, string> = {
  draft: "Nháp",
  open: "Đang mời thầu",
  closed: "Đã đóng",
  awarded: "Đã trao thầu",
  cancelled: "Đã huỷ",
};

export type TenderItemInput = { boqItemId: number; qty: number };

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null.
export function validateTenderInput(input: {
  name: string;
  items: TenderItemInput[];
}): string | null {
  if (!input.name.trim()) return "Thiếu tên gói thầu";
  if (!Array.isArray(input.items) || input.items.length === 0)
    return "Cần ít nhất 1 dòng BOQ trong phạm vi mời thầu";
  const seen = new Set<number>();
  for (const [i, it] of input.items.entries()) {
    const n = i + 1;
    if (!Number.isInteger(it.boqItemId)) return `Dòng ${n}: thiếu dòng BOQ`;
    if (!Number.isFinite(it.qty) || it.qty <= 0) return `Dòng ${n}: khối lượng mời phải > 0`;
    if (seen.has(it.boqItemId)) return `Dòng ${n}: dòng BOQ trùng lặp`;
    seen.add(it.boqItemId);
  }
  return null;
}

/** unitPrice là chuỗi canonical 2 số lẻ (S10) — ghi thẳng vào NUMERIC(15,2), không qua float. */
export type BidPriceInput = { boqItemId: number; unitPrice: string };

/** Đọc mảng dòng giá từ body; ném MoneyInputError (400/422) khi một đơn giá sai dạng/tràn. */
export function parseBidPrices(raw: unknown[]): BidPriceInput[] {
  return raw.map((r, i) => {
    const p = (r ?? {}) as Record<string, unknown>;
    return {
      boqItemId: Number(p.boqItemId),
      unitPrice: parseMoneyInput(p.unitPrice, { label: `Đơn giá dòng ${i + 1}` }).text,
    };
  });
}

// Chấp nhận chào thiếu dòng (không bắt buộc đủ 100% dòng mời) — spec §"Điểm cần
// quyết": hiện "—" cho dòng thiếu, tổng ghi chú "chào N/M dòng" (không cộng 0 gây
// hiểu lầm là chào giá 0đ).
export function validateBidPrices(prices: BidPriceInput[]): string | null {
  const seen = new Set<number>();
  for (const [i, p] of prices.entries()) {
    const n = i + 1;
    if (!Number.isInteger(p.boqItemId)) return `Dòng ${n}: thiếu dòng BOQ`;
    if (p.unitPrice.startsWith("-")) return `Dòng ${n}: đơn giá phải ≥ 0`;
    if (seen.has(p.boqItemId)) return `Dòng ${n}: dòng BOQ trùng lặp trong cùng báo giá`;
    seen.add(p.boqItemId);
  }
  return null;
}

export async function nextTenderCode(): Promise<string> {
  return nextSeqCode("tender_packages", "code", "GT-", 4);
}

export type TenderRow = {
  id: number;
  code: string;
  name: string;
  scope: string | null;
  dueDate: string | null;
  status: TenderStatus;
  awardedBidId: number | null;
  awardedContractId: number | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  itemCount: number;
  bidCount: number;
};

// projectId (M22): undefined = không lọc dự án (dùng nội bộ/test cũ).
export async function listTenders(projectId?: number): Promise<TenderRow[]> {
  const where = projectId != null ? "WHERE tp.project_id = ?" : "";
  return query<TenderRow>(
    `SELECT tp.id, tp.code, tp.name, tp.scope, tp.due_date AS "dueDate", tp.status,
            tp.awarded_bid_id AS "awardedBidId", tp.awarded_contract_id AS "awardedContractId",
            tp.created_by AS "createdBy", u.name AS "createdByName", tp.created_at AS "createdAt",
            (SELECT COUNT(*) FROM tender_items ti WHERE ti.tender_id = tp.id) AS "itemCount",
            (SELECT COUNT(*) FROM tender_bids tb WHERE tb.tender_id = tp.id) AS "bidCount"
       FROM tender_packages tp
       LEFT JOIN users u ON u.id = tp.created_by
      ${where}
      ORDER BY tp.created_at DESC, tp.id DESC`,
    ...(projectId != null ? [projectId] : []),
  );
}

// projectId khi truyền → trả undefined nếu gói thầu không thuộc dự án đang chọn
// (chặn truy cập chéo dự án qua đoán ID).
export async function getTender(id: number, projectId?: number): Promise<TenderRow | undefined> {
  const rows = await listTenders(projectId);
  return rows.find((r) => r.id === id);
}

export type TenderItemRow = {
  boqItemId: number;
  code: string;
  name: string;
  unit: string;
  qty: number;
};

export async function getTenderItems(tenderId: number): Promise<TenderItemRow[]> {
  return query<TenderItemRow>(
    `SELECT ti.boq_item_id AS "boqItemId", bi.code, bi.name, bi.unit, ti.qty
       FROM tender_items ti JOIN boq_items bi ON bi.id = ti.boq_item_id
      WHERE ti.tender_id = ?
      ORDER BY bi.code`,
    tenderId,
  );
}

// S10c: mọi số tiền là MoneyMinor (bigint đồng×100), đọc `::text` — route đổi sang wire bằng
// `bidsToWire`. `total` dùng XẾP HẠNG và làm giá trị hợp đồng khi trao thầu nên phải exact.
export type BidRow = {
  bidId: number;
  supplierId: number;
  supplierName: string;
  lumpSum: bigint | null;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
  quotedLines: number;
  totalLines: number;
  total: bigint; // tổng theo dòng đã chào (KHÔNG gồm dòng thiếu) — nếu có lumpSum thì lấy lumpSum
  prices: Record<number, bigint>; // boqItemId -> unitPrice (chỉ dòng đã chào)
};

/** Báo giá trên wire: v1 → chuỗi canonical; legacy → number (ngoài biên throw → 422). */
export type BidRowWire = Omit<BidRow, "lumpSum" | "total" | "prices"> & {
  lumpSum: string | number | null;
  total: string | number;
  prices: Record<number, string | number>;
};

export function bidsToWire(bids: readonly BidRow[], format: MoneyWireFormat): BidRowWire[] {
  return bids.map((b) => ({
    ...b,
    lumpSum: b.lumpSum == null ? null : moneyToWire(b.lumpSum, format),
    total: moneyToWire(b.total, format),
    prices: Object.fromEntries(
      Object.entries(b.prices).map(([id, p]) => [id, moneyToWire(p, format)]),
    ),
  }));
}

// Bảng so sánh: dòng BOQ mời thầu × nhà thầu đã chào. Dòng NCC chào thiếu vẫn
// hiện trong bảng (giá "—" ở UI) — total chỉ cộng dòng đã chào, kèm quotedLines/
// totalLines để UI ghi chú "chào N/M dòng" (không cộng 0 gây hiểu lầm).
export async function comparisonTable(
  tenderId: number,
): Promise<{ items: TenderItemRow[]; bids: BidRow[] }> {
  const items = await getTenderItems(tenderId);
  const bids = await query<{
    bidId: number;
    supplierId: number;
    supplierName: string;
    lumpSum: string | null;
    note: string | null;
    fileName: string | null;
    originalName: string | null;
  }>(
    `SELECT tb.id AS "bidId", tb.supplier_id AS "supplierId", s.name AS "supplierName",
            tb.lump_sum::text AS "lumpSum", tb.note, tb.file_name AS "fileName", tb.original_name AS "originalName"
       FROM tender_bids tb JOIN suppliers s ON s.id = tb.supplier_id
      WHERE tb.tender_id = ?
      ORDER BY tb.id`,
    tenderId,
  );

  const result: BidRow[] = [];
  for (const b of bids) {
    const priceRows = await query<{ boqItemId: number; unitPrice: string }>(
      `SELECT boq_item_id AS "boqItemId", unit_price::text AS "unitPrice" FROM tender_bid_prices WHERE bid_id = ?`,
      b.bidId,
    );
    const prices: Record<number, bigint> = {};
    for (const p of priceRows) prices[p.boqItemId] = parseMoney(p.unitPrice);

    // Tổng tiền chào tính TRONG SQL (M45 PR1: NUMERIC về JS là float, cấm nhân/cộng tiền
    // trên float). Con số này dùng để XẾP HẠNG nhà thầu — sai lệch nhỏ đủ đảo thứ hạng khi
    // 2 giá sát nhau. Chỉ cộng dòng đã chào, đúng như trước (JOIN loại dòng thiếu giá).
    const lineTotalRow = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(bp.unit_price * ti.qty), 0)::text AS total
         FROM tender_bid_prices bp
         JOIN tender_items ti
           ON ti.tender_id = ? AND ti.boq_item_id = bp.boq_item_id
        WHERE bp.bid_id = ?`,
      tenderId,
      b.bidId,
    );
    // SUM(đơn giá × KL) có 5 chữ số lẻ → làm tròn tới xu bằng parseMoney (exact, half-up).
    const lineTotal = parseMoney(lineTotalRow?.total ?? "0");
    const lumpSum = b.lumpSum != null ? parseMoney(b.lumpSum) : null;
    result.push({
      ...b,
      lumpSum,
      quotedLines: priceRows.length,
      totalLines: items.length,
      total: lumpSum ?? lineTotal,
      prices,
    });
  }
  return { items, bids: result };
}

// Trao thầu: chốt awarded_bid_id + sinh 1 hợp đồng giao thầu (contracts, M16) cho
// NCC trúng thầu (giá trị = total của bid đã chọn) → contracts.id gán vào
// awarded_contract_id. Khoá sửa giá sau khi trao (status chuyển 'awarded').
// projectId (M22): gói thầu phải thuộc đúng dự án đang chọn (bắt buộc — route gọi
// hàm này luôn resolve trước, undefined chỉ dùng nội bộ/test cũ); hợp đồng sinh ra
// gán project_id theo gói thầu.
export async function awardTender(
  tenderId: number,
  bidId: number,
  userId: number,
  projectId?: number,
): Promise<{ contractId: number }> {
  return withTransaction(async () => {
    const conds = ["id = ?"];
    const args: unknown[] = [tenderId];
    if (projectId != null) {
      conds.push("project_id = ?");
      args.push(projectId);
    }
    const tender = await queryOne<{ status: string; code: string; name: string }>(
      `SELECT status, code, name FROM tender_packages WHERE ${conds.join(" AND ")} FOR UPDATE`,
      ...args,
    );
    if (!tender) throw Object.assign(new Error("Không tìm thấy gói thầu"), { status: 404 });
    if (tender.status === "awarded")
      throw Object.assign(new Error("Gói thầu đã được trao thầu rồi"), { status: 409 });

    const bid = await queryOne<{ supplierId: number }>(
      `SELECT supplier_id AS "supplierId" FROM tender_bids WHERE id = ? AND tender_id = ?`,
      bidId,
      tenderId,
    );
    if (!bid) throw Object.assign(new Error("Báo giá không thuộc gói thầu này"), { status: 422 });

    const { bids } = await comparisonTable(tenderId);
    const chosen = bids.find((b) => b.bidId === bidId);
    if (!chosen) throw Object.assign(new Error("Không tìm thấy báo giá"), { status: 404 });
    // S10c: giá trị HĐ ghi chuỗi exact (không qua float). Tổng chào vượt NUMERIC(15,2) của
    // contracts.value → 422 có chủ đích (trước đây lỗi tràn của PG thành 500 sau khi đã khoá gói).
    if (!fitsNumeric(chosen.total, 15))
      throw Object.assign(
        new Error(
          "Giá trị báo giá vượt giới hạn lưu trữ hợp đồng (tối đa 13 chữ số phần nguyên) — không thể trao thầu",
        ),
        { status: 422, code: "amount_overflow" },
      );

    const contractCode = await nextSeqCode(
      "contracts",
      "code",
      `GT-HD-${tender.code.replace("GT-", "")}-`,
      2,
    );
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, party_supplier_id, value, status, created_by, project_id)
       VALUES (?, 'giao_thau', ?, ?, ?::numeric, 'active', ?, ?)`,
      contractCode,
      `Trúng thầu — ${tender.name}`,
      chosen.supplierId,
      moneyToDecimal(chosen.total),
      userId,
      projectId ?? null,
    );

    await run(
      `UPDATE tender_packages SET status = 'awarded', awarded_bid_id = ?, awarded_contract_id = ? WHERE id = ?`,
      bidId,
      contractId,
      tenderId,
    );

    return { contractId };
  });
}
