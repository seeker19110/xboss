// M7 — Đấu thầu / so sánh báo giá gói giao thầu phụ: danh mục trạng thái, validate
// thuần, bảng so sánh giá theo dòng BOQ × nhà thầu, và trao thầu (sinh hợp đồng
// giao thầu — contracts, M16). Xem docs/nang-cap/M07-dau-thau.md.
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { nextSeqCode } from "@/lib/seqcode";

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

export type BidPriceInput = { boqItemId: number; unitPrice: number };

// Chấp nhận chào thiếu dòng (không bắt buộc đủ 100% dòng mời) — spec §"Điểm cần
// quyết": hiện "—" cho dòng thiếu, tổng ghi chú "chào N/M dòng" (không cộng 0 gây
// hiểu lầm là chào giá 0đ).
export function validateBidPrices(prices: BidPriceInput[]): string | null {
  const seen = new Set<number>();
  for (const [i, p] of prices.entries()) {
    const n = i + 1;
    if (!Number.isInteger(p.boqItemId)) return `Dòng ${n}: thiếu dòng BOQ`;
    if (!Number.isFinite(p.unitPrice) || p.unitPrice < 0) return `Dòng ${n}: đơn giá phải ≥ 0`;
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

export type BidRow = {
  bidId: number;
  supplierId: number;
  supplierName: string;
  lumpSum: number | null;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
  quotedLines: number;
  totalLines: number;
  total: number; // tổng theo dòng đã chào (KHÔNG gồm dòng thiếu) — nếu có lumpSum thì lấy lumpSum
  prices: Record<number, number>; // boqItemId -> unitPrice (chỉ dòng đã chào)
};

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
    lumpSum: number | null;
    note: string | null;
    fileName: string | null;
    originalName: string | null;
  }>(
    `SELECT tb.id AS "bidId", tb.supplier_id AS "supplierId", s.name AS "supplierName",
            tb.lump_sum AS "lumpSum", tb.note, tb.file_name AS "fileName", tb.original_name AS "originalName"
       FROM tender_bids tb JOIN suppliers s ON s.id = tb.supplier_id
      WHERE tb.tender_id = ?
      ORDER BY tb.id`,
    tenderId,
  );

  const result: BidRow[] = [];
  for (const b of bids) {
    const priceRows = await query<{ boqItemId: number; unitPrice: number }>(
      `SELECT boq_item_id AS "boqItemId", unit_price AS "unitPrice" FROM tender_bid_prices WHERE bid_id = ?`,
      b.bidId,
    );
    const prices: Record<number, number> = {};
    for (const p of priceRows) prices[p.boqItemId] = Number(p.unitPrice);

    const lineTotal = items.reduce(
      (sum, it) => sum + (prices[it.boqItemId] != null ? prices[it.boqItemId] * it.qty : 0),
      0,
    );
    result.push({
      ...b,
      lumpSum: b.lumpSum != null ? Number(b.lumpSum) : null,
      quotedLines: priceRows.length,
      totalLines: items.length,
      total: b.lumpSum != null ? Number(b.lumpSum) : lineTotal,
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

    const contractCode = await nextSeqCode(
      "contracts",
      "code",
      `GT-HD-${tender.code.replace("GT-", "")}-`,
      2,
    );
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, party_supplier_id, value, status, created_by, project_id)
       VALUES (?, 'giao_thau', ?, ?, ?, 'active', ?, ?)`,
      contractCode,
      `Trúng thầu — ${tender.name}`,
      chosen.supplierId,
      chosen.total,
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
