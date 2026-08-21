import * as XLSX from "xlsx";
import { queryOne, insertId, withTransaction } from "@/lib/db";
import { boqTakenBy } from "@/lib/boq";

// Parser cho Bảng khối lượng BOQ dự toán & kiểm soát đặt hàng:
// Hỗ trợ 2 định dạng:
// 1. Biểu mẫu chuẩn xBOSS (attachments/MAU-KHOI-LUONG-BOQ.xlsx):
//    Sheet 'Data-BOQ' hoặc '02_MAU_BOQ_TRONG': cột A (Mã BOQ duy nhất), B (STT), C (Mô tả),
//    D (Quy cách/vật liệu), E (ĐVT), F (Khối lượng BOQ Tháp A), G (Định mức Shop), I (Ghi chú).
// 2. Định dạng IPC nhà thầu (legacy): tiêu đề 3 dòng gộp ô (STT | DIỄN GIẢI | ĐVT | KL Tháp A | ... | ĐƠN GIÁ TỔNG | GHI CHÚ).

export type ParsedBoqRow = {
  rowIndex: number; // dòng Excel 0-based, để báo lỗi/preview
  code?: string | null; // Mã BOQ có sẵn trong Excel (nếu có, vd: DHKK-A.I.1.1, MA-BOQ-001)
  name: string;
  unit: string;
  qtyContract: number;
  qtyNorm?: number | null; // Khối lượng định mức bóc tách Shop drawing
  unitPrice: number;
  note: string | null;
};

export type BoqParseResult = {
  rows: ParsedBoqRow[];
  detectedSystemCode: string | null;
  warnings: string[];
  skippedTowerBOnly: number; // dòng chỉ thuộc Tháp B (KL Tháp A = 0) — XBoss chỉ quản lý Tháp A
  sheetUsed?: string;
};

// Chỉ phần "I - HẠNG MỤC THEO HỢP ĐỒNG/PLHĐ" là KL hợp đồng gốc. Các phần sau
// (phát sinh/khấu trừ/phạt) không map thẳng vào boq_items — dừng phân tích khi
// gặp 1 trong các tiêu đề này (khớp theo NỘI DUNG, không dùng số La Mã ở cột STT
// vì I/II/III bị dùng lặp lại ở nhiều cấp đề mục lồng nhau trong cùng phần I).
const SECTION_BOUNDARY = [/NGOÀI HỢP ĐỒNG/i, /KHẤU TRỪ/i, /PHẠT THEO QUY/i];

const SYSTEM_KEYWORDS: { code: string; patterns: RegExp[] }[] = [
  { code: "acmv", patterns: [/điều hòa/i, /thông gió/i, /\bacmv\b/i, /\bhvac\b/i, /\bdhkk\b/i] },
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

const IGNORE_SHEET_PATTERNS = [
  /HUONG_DAN/i,
  /HDSD/i,
  /GUIDE/i,
  /DASHBOARD/i,
  /KIEM_SOAT/i,
  /In phieu/i,
  /Phieu xuat/i,
];

export function parseBoqWorkbook(workbook: XLSX.WorkBook): BoqParseResult {
  const empty: BoqParseResult = {
    rows: [],
    detectedSystemCode: null,
    warnings: [],
    skippedTowerBOnly: 0,
  };

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { ...empty, warnings: ["File không có sheet nào"] };
  }

  // Ưu tiên chọn sheet dữ liệu: 'Data-BOQ', sau đó là các sheet khác không thuộc sheet hướng dẫn
  let candidateSheets = workbook.SheetNames.filter(
    (s) => !IGNORE_SHEET_PATTERNS.some((p) => p.test(s)),
  );
  if (candidateSheets.length === 0) {
    candidateSheets = workbook.SheetNames;
  }
  // Sắp xếp ưu tiên: 'Data-BOQ' trước, rồi '02_MAU_BOQ_TRONG', rồi các sheet khác
  candidateSheets.sort((a, b) => {
    if (a === "Data-BOQ") return -1;
    if (b === "Data-BOQ") return 1;
    if (a.includes("MAU_BOQ")) return 1;
    if (b.includes("MAU_BOQ")) return -1;
    return 0;
  });

  let bestResult: BoqParseResult = {
    rows: [],
    detectedSystemCode: null,
    warnings: [],
    skippedTowerBOnly: 0,
  };

  for (const targetSheetName of candidateSheets) {
    const ws = workbook.Sheets[targetSheetName];
    if (!ws) continue;

    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    // 1. Kiểm tra xem có phải định dạng chuẩn mới xBOSS (MAU-KHOI-LUONG-BOQ) hay không
    let standardHeaderRow = -1;
    let legacyHeaderRow = -1;

    for (let i = 0; i < Math.min(raw.length, 30); i++) {
      const r = raw[i];
      if (!r) continue;
      const c0 = cleanLabel(r[0]);
      const c1 = cleanLabel(r[1]);
      const c2 = cleanLabel(r[2]);
      const c4 = cleanLabel(r[4]);
      const c5 = cleanLabel(r[5]);

      if (
        c0.includes("Mã BOQ") ||
        (c0 === "STT" && c1.includes("MÔ TẢ")) ||
        (c2.includes("MÔ TẢ") && (c4.includes("Đơn vị") || c5.includes("KHỐI LƯỢNG")))
      ) {
        standardHeaderRow = i;
        break;
      }

      if (c0 === "STT" && c1.includes("DIỄN GIẢI")) {
        legacyHeaderRow = i;
        break;
      }
    }

    // Dò tìm hệ từ các dòng đầu trang (dò ngược từ dòng sát header lên để ưu tiên thông tin hệ cụ thể)
    let detectedSystemCode: string | null = null;
    const searchLimit =
      standardHeaderRow >= 0
        ? standardHeaderRow
        : legacyHeaderRow >= 0
          ? legacyHeaderRow
          : Math.min(raw.length, 10);
    for (let i = searchLimit - 1; i >= 0; i--) {
      const r = raw[i];
      if (!r) continue;
      for (const cell of r) {
        const text = cleanLabel(cell);
        if (!text) continue;
        const d = detectSystem(text);
        if (d) {
          detectedSystemCode = d;
          break;
        }
      }
      if (detectedSystemCode) break;
    }

    // Xử lý định dạng chuẩn mới xBOSS
    if (standardHeaderRow >= 0) {
      const rows: ParsedBoqRow[] = [];
      let skippedTowerBOnly = 0;

      for (let i = standardHeaderRow + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r) continue;

        const codeRaw = cleanLabel(r[0]);
        const label = cleanLabel(r[2]) || cleanLabel(r[1]);
        const unit = cleanLabel(r[4]) || cleanLabel(r[3]);

        if (SECTION_BOUNDARY.some((p) => p.test(label))) break;
        if (!label || !unit || label.startsWith("[Nhập")) continue;

        const qtyContract = num(r[5]);
        const qtyNorm = num(r[6]);
        const note = cleanLabel(r[8]) || cleanLabel(r[7]) || null;

        // Nếu số lượng = 0 và là mục tháp B (hoặc dòng mẫu), đếm bỏ qua
        if (qtyContract <= 0) {
          if (codeRaw) {
            skippedTowerBOnly++;
          }
          continue;
        }

        rows.push({
          rowIndex: i,
          code: codeRaw || null,
          name: label,
          unit,
          qtyContract,
          qtyNorm: qtyNorm > 0 ? qtyNorm : null,
          unitPrice: 0,
          note,
        });
      }

      if (rows.length > 0) {
        return {
          rows,
          detectedSystemCode,
          warnings: [],
          skippedTowerBOnly,
          sheetUsed: targetSheetName,
        };
      }
      bestResult = {
        rows,
        detectedSystemCode,
        warnings: ["Không tìm thấy dòng hạng mục hợp lệ nào trong sheet " + targetSheetName],
        skippedTowerBOnly,
        sheetUsed: targetSheetName,
      };
      continue;
    }

    // Xử lý định dạng IPC cũ (legacy)
    if (legacyHeaderRow >= 0) {
      const dataStart = legacyHeaderRow + 3;
      const rows: ParsedBoqRow[] = [];
      let skippedTowerBOnly = 0;

      for (let i = dataStart; i < raw.length; i++) {
        const r = raw[i];
        if (!r) continue;

        const label = cleanLabel(r[1]);
        if (SECTION_BOUNDARY.some((p) => p.test(label))) break;

        const unit = cleanLabel(r[2]);
        if (!unit || !label) continue;

        const qtyContract = num(r[3]);
        if (qtyContract <= 0) {
          skippedTowerBOnly++;
          continue;
        }

        const unitPrice = num(r[8]);
        const note = cleanLabel(r[14]) || null;

        rows.push({ rowIndex: i, code: null, name: label, unit, qtyContract, unitPrice, note });
      }

      if (rows.length > 0) {
        return {
          rows,
          detectedSystemCode,
          warnings: [],
          skippedTowerBOnly,
          sheetUsed: targetSheetName,
        };
      }
      bestResult = {
        rows,
        detectedSystemCode,
        warnings: ["Không tìm thấy dòng hạng mục hợp lệ nào trong phần I"],
        skippedTowerBOnly,
        sheetUsed: targetSheetName,
      };
      continue;
    }
  }

  if (bestResult.warnings.length > 0) return bestResult;

  return {
    ...empty,
    warnings: ["Không tìm thấy dòng tiêu đề (cột STT/DIỄN GIẢI hoặc Mã BOQ / MÔ TẢ)"],
  };
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

// Dry-run: dùng mã có sẵn trong file hoặc sinh trước mã sẽ dùng + báo trùng (nếu có)
export async function previewBoqImport(
  rows: ParsedBoqRow[],
  systemCode: string,
  orgId: number,
): Promise<BoqImportPreviewRow[]> {
  const prefix = `${systemCode.toUpperCase()}-`;
  let seq = await nextBoqSeq(prefix);
  const out: BoqImportPreviewRow[] = [];
  const seenCodes = new Set<string>();

  for (const row of rows) {
    let code = row.code?.trim();
    if (!code) {
      code = `${prefix}${String(seq).padStart(4, "0")}`;
      seq++;
    }

    const upperCode = code.toUpperCase();
    if (seenCodes.has(upperCode)) {
      out.push({
        ...row,
        code,
        action: "error",
        reason: `Mã "${code}" bị trùng lặp trong chính file import`,
      });
      continue;
    }
    seenCodes.add(upperCode);

    const takenBy = await boqTakenBy(code, orgId);
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
// dở dang khi lỗi giữa chừng). Dòng trùng mã bị bỏ qua và ghi vào errors.
export async function commitBoqImport(
  rows: ParsedBoqRow[],
  systemId: number,
  systemCode: string,
  projectId: number,
  orgId: number,
): Promise<BoqImportResult> {
  const prefix = `${systemCode.toUpperCase()}-`;
  return withTransaction(async () => {
    let seq = await nextBoqSeq(prefix);
    let inserted = 0;
    const errors: string[] = [];
    const seenCodes = new Set<string>();

    for (const row of rows) {
      let code = row.code?.trim();
      if (!code) {
        code = `${prefix}${String(seq).padStart(4, "0")}`;
        seq++;
      }

      const upperCode = code.toUpperCase();
      if (seenCodes.has(upperCode)) {
        errors.push(`Bỏ qua "${row.name}" — mã "${code}" bị trùng lặp trong file`);
        continue;
      }
      seenCodes.add(upperCode);

      const takenBy = await boqTakenBy(code, orgId);
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
        row.unitPrice ?? 0,
        row.note ?? null,
        row.rowIndex,
        projectId,
      );
      inserted++;
    }
    return { inserted, skipped: errors.length, errors };
  });
}
