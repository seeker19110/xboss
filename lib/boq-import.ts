import * as XLSX from "xlsx";
import { queryOne, insertId, withTransaction } from "@/lib/db";
import { boqTakenBy } from "@/lib/boq";

// Parser cho "Bảng khối lượng thanh toán" (BOQ dự toán/IPC) — định dạng thật của
// nhà thầu (không phải file WBS tracking OGTĐ/OGHL của lib/import.ts): tiêu đề
// 3 dòng gộp ô (STT | DIỄN GIẢI | ĐVT | KL Tháp A/Tháp B/Tổng | VẬT TƯ | NHÂN CÔNG |
// ĐƠN GIÁ TỔNG | THÀNH TIỀN THÁP A/B | Thực hiện kỳ này | GHI CHÚ), dữ liệu phân cấp
// bằng cột STT (đề mục La Mã/chữ/số lồng nhau) không có cột mã riêng.

export type ParsedBoqRow = {
  rowIndex: number; // dòng Excel 0-based, để báo lỗi/preview
  name: string;
  unit: string;
  qtyContract: number;
  unitPrice: number;
  note: string | null;
};

export type BoqParseResult = {
  rows: ParsedBoqRow[];
  detectedSystemCode: string | null;
  warnings: string[];
  skippedTowerBOnly: number; // dòng chỉ thuộc Tháp B (KL Tháp A = 0) — XBoss chỉ quản lý Tháp A
};

// Chỉ phần "I - HẠNG MỤC THEO HỢP ĐỒNG/PLHĐ" là KL hợp đồng gốc. Các phần sau
// (phát sinh/khấu trừ/phạt) không map thẳng vào boq_items — dừng phân tích khi
// gặp 1 trong các tiêu đề này (khớp theo NỘI DUNG, không dùng số La Mã ở cột STT
// vì I/II/III bị dùng lặp lại ở nhiều cấp đề mục lồng nhau trong cùng phần I).
const SECTION_BOUNDARY = [/NGOÀI HỢP ĐỒNG/i, /KHẤU TRỪ/i, /PHẠT THEO QUY/i];

const SYSTEM_KEYWORDS: { code: string; patterns: RegExp[] }[] = [
  { code: "acmv", patterns: [/điều hòa/i, /thông gió/i, /\bacmv\b/i, /\bhvac\b/i] },
  { code: "dien", patterns: [/hệ thống điện/i, /\belectric/i] },
  { code: "nuoc", patterns: [/cấp thoát nước/i, /\bnước\b/i] },
  { code: "pccc", patterns: [/pccc/i, /phòng cháy/i] },
  { code: "ket_cau", patterns: [/kết cấu/i] },
  { code: "xay_to", patterns: [/xây tô/i, /xây dựng/i] },
];

function detectSystem(text: string): string | null {
  for (const d of SYSTEM_KEYWORDS) {
    if (d.patterns.some((p) => p.test(text))) return d.code;
  }
  return null;
}

function cleanLabel(v: unknown): string {
  return String(v ?? "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export function parseBoqWorkbook(workbook: XLSX.WorkBook): BoqParseResult {
  const empty: BoqParseResult = {
    rows: [],
    detectedSystemCode: null,
    warnings: [],
    skippedTowerBOnly: 0,
  };

  const sheetName = workbook.SheetNames[0];
  const ws = sheetName ? workbook.Sheets[sheetName] : null;
  if (!ws) return { ...empty, warnings: ["File không có sheet nào"] };

  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Dò dòng tiêu đề: ô đầu = "STT" và ô kế = có chữ "DIỄN GIẢI" — không hardcode
  // số dòng cố định vì các file thật có thể chèn thêm/bớt dòng thông tin đầu trang.
  let headerRow = -1;
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const r = raw[i];
    if (
      r?.[0] != null &&
      cleanLabel(r[0]) === "STT" &&
      r[1] != null &&
      cleanLabel(r[1]).includes("DIỄN GIẢI")
    ) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) {
    return { ...empty, warnings: ["Không tìm thấy dòng tiêu đề (cột STT/DIỄN GIẢI)"] };
  }

  // Dò tên gói thầu ở các dòng trước tiêu đề để tự nhận diện hệ (best-effort — người
  // dùng vẫn xác nhận/chỉnh lại hệ trước khi ghi DB, xem UI import).
  let detectedSystemCode: string | null = null;
  for (let i = 0; i < headerRow; i++) {
    const text = cleanLabel(raw[i]?.[0]);
    if (!text) continue;
    const d = detectSystem(text);
    if (d) {
      detectedSystemCode = d;
      break;
    }
  }

  const dataStart = headerRow + 3; // tiêu đề gộp 3 dòng (STT/ĐVT/KL Tháp — Tháp A/B/Tổng — Thực hiện...)
  const rows: ParsedBoqRow[] = [];
  let skippedTowerBOnly = 0;

  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;

    const label = cleanLabel(r[1]);
    if (SECTION_BOUNDARY.some((p) => p.test(label))) break; // hết phần I, các phần sau luôn ở cuối file

    const unit = cleanLabel(r[2]);
    if (!unit) continue; // dòng đề mục nhóm (STT La Mã/chữ/số), không phải dòng hạng mục có KL/đơn giá
    if (!label) continue;

    const qtyContract = num(r[3]); // cột KL Tháp A
    if (qtyContract <= 0) {
      skippedTowerBOnly++; // KL Tháp A = 0 → chỉ thuộc Tháp B, ngoài phạm vi XBoss
      continue;
    }

    const unitPrice = num(r[8]); // ĐƠN GIÁ TỔNG (đã gồm vật tư + nhân công)
    const note = cleanLabel(r[14]) || null;

    rows.push({ rowIndex: i, name: label, unit, qtyContract, unitPrice, note });
  }

  const warnings: string[] = [];
  if (rows.length === 0) warnings.push("Không tìm thấy dòng hạng mục hợp lệ nào trong phần I");

  return { rows, detectedSystemCode, warnings, skippedTowerBOnly };
}

// File không có cột mã (BOQCODE) — tự sinh mã tuần tự "<PREFIX>-NNNN" theo mã lớn
// nhất hiện có trong boq_items cho prefix đó (giống lib/seqcode.ts nhưng pad rộng
// hơn vì 1 lần import có thể tới hàng trăm dòng).
async function nextBoqSeq(prefix: string): Promise<number> {
  const last = await queryOne<{ code: string }>(
    `SELECT code FROM boq_items WHERE code LIKE ? ORDER BY code DESC LIMIT 1`,
    `${prefix}%`,
  );
  return last?.code ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
}

export type BoqImportPreviewRow = ParsedBoqRow & {
  code: string;
  action: "add" | "error";
  reason?: string;
};

// Dry-run: sinh trước mã sẽ dùng + báo trùng (nếu có) để người dùng xem trước khi ghi.
// Mã sinh ra ở bước preview chỉ mang tính minh hoạ — commit tự sinh lại từ đầu để
// tránh lệch nếu có import khác chen giữa lúc preview và lúc xác nhận ghi.
export async function previewBoqImport(
  rows: ParsedBoqRow[],
  systemCode: string,
): Promise<BoqImportPreviewRow[]> {
  const prefix = `${systemCode.toUpperCase()}-`;
  let seq = await nextBoqSeq(prefix);
  const out: BoqImportPreviewRow[] = [];
  for (const row of rows) {
    const code = `${prefix}${String(seq).padStart(4, "0")}`;
    seq++;
    const takenBy = await boqTakenBy(code);
    out.push(
      takenBy
        ? { ...row, code, action: "error", reason: `Mã "${code}" đã được dùng bởi ${takenBy}` }
        : { ...row, code, action: "add" },
    );
  }
  return out;
}

export type BoqImportResult = { inserted: number; skipped: number; errors: string[] };

// Ghi thật vào boq_items trong 1 transaction (tất cả hoặc không gì cả — tránh import
// dở dang khi lỗi giữa chừng). Dòng trùng mã (hiếm — xem previewBoqImport) bị bỏ qua
// và ghi vào errors thay vì làm hỏng cả transaction.
export async function commitBoqImport(
  rows: ParsedBoqRow[],
  systemId: number,
  systemCode: string,
  projectId: number,
): Promise<BoqImportResult> {
  const prefix = `${systemCode.toUpperCase()}-`;
  return withTransaction(async () => {
    let seq = await nextBoqSeq(prefix);
    let inserted = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const code = `${prefix}${String(seq).padStart(4, "0")}`;
      seq++;
      const takenBy = await boqTakenBy(code);
      if (takenBy) {
        errors.push(`Bỏ qua "${row.name}" — mã "${code}" đã được dùng bởi ${takenBy}`);
        continue;
      }
      await insertId(
        `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, note, sort_order, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        code,
        row.name,
        row.unit,
        systemId,
        row.qtyContract,
        row.unitPrice,
        row.note,
        row.rowIndex,
        projectId,
      );
      inserted++;
    }
    return { inserted, skipped: errors.length, errors };
  });
}
