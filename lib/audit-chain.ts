// Xác minh chuỗi hash của audit_log (M43 PR3) — dùng chung bởi script CLI
// (scripts/verify-audit-chain.ts, chạy tay/cron ngoài) và cron báo cáo tuần
// (app/api/cron/weekly-report/route.ts, gọi trực tiếp trong process, không spawn
// subprocess trong route Next.js).
//
// Công thức khớp đúng hàm audit_row_change() (migrations/0050_document_hash.sql):
//   row_hash = sha256(prevRowHash || v_id || at || changes)
// LƯU Ý: `v_id` trong trigger là ID CỦA THỰC THỂ gốc (cột entity_id — vd id contract bị
// đổi), KHÔNG PHẢI id tự tăng của chính dòng audit_log (biến được tái dùng từ đoạn code
// build entity_id ở đầu hàm, xem migrations/0049_audit_log.sql) — verify phải dùng đúng
// `entity_id`, không phải `id`, nếu không mọi dòng sẽ báo lệch giả.
//
// `prevRowHash` là row_hash THỰC LƯU của dòng liền trước (không phải giá trị kỳ vọng tính
// lại) — nhờ vậy khi 1 dòng bị sửa tay (UPDATE trực tiếp DB, bỏ qua trigger) thuật toán báo
// đúng dòng lệch mà không lan truyền lỗi giả sang dòng sau, và nếu kẻ tấn công cũng sửa lại
// row_hash của dòng đó để "khớp" nội dung mới thì dòng NGAY SAU sẽ lệch (vì chuỗi thật đã
// được xây trên row_hash gốc, không phải giá trị bị ghi đè).
import { query } from "@/lib/db";
import { createHash } from "node:crypto";

const PAGE_SIZE = 2000;

type AuditChainDbRow = {
  id: number;
  entityId: number; // v_id trong trigger — id của thực thể gốc, KHÔNG phải id của audit_log
  at: string; // ép về text ngay trong SQL (at::text) — khớp đúng now()::text dùng trong trigger
  changesText: string | null; // changes::text — khớp đúng v_changes::text dùng trong trigger
  rowHash: string | null;
};

export type AuditChainError = {
  id: number;
  expected: string;
  actual: string | null;
};

export type AuditChainResult = {
  total: number; // tổng số dòng đã đọc (kể cả dòng ghi trước PR3, row_hash NULL — bỏ qua không tính lỗi)
  checked: number; // số dòng thực sự đối chiếu được (có row_hash để so)
  errors: AuditChainError[];
  ok: boolean;
};

// Đọc audit_log theo trang (id tăng dần) và tính lại hash từng dòng, so với row_hash đã
// lưu. Không dùng OFFSET (chậm dần khi bảng lớn) — cursor theo `id > lastId`.
export async function verifyAuditChain(): Promise<AuditChainResult> {
  let lastId = 0;
  let prevHash = ""; // COALESCE(NULL,'') trong trigger — dòng đầu tiên không có gì trước đó
  let total = 0;
  let checked = 0;
  const errors: AuditChainError[] = [];

  for (;;) {
    const rows = await query<AuditChainDbRow>(
      `SELECT id, entity_id AS "entityId", at::text AS at,
              changes::text AS "changesText", row_hash AS "rowHash"
         FROM audit_log WHERE id > ? ORDER BY id ASC LIMIT ?`,
      lastId,
      PAGE_SIZE,
    );
    if (rows.length === 0) break;

    for (const r of rows) {
      total++;
      lastId = r.id;

      // Dòng ghi trước migration 0050 (row_hash chưa từng tính) — không có gì để so,
      // bỏ qua kiểm tra nhưng vẫn nối chuỗi bằng '' (đúng COALESCE của trigger).
      if (r.rowHash === null) {
        prevHash = "";
        continue;
      }

      const expected = createHash("sha256")
        .update(prevHash + String(r.entityId) + r.at + (r.changesText ?? ""))
        .digest("hex");
      checked++;
      if (expected !== r.rowHash) {
        errors.push({ id: r.id, expected, actual: r.rowHash });
      }
      // Nối chuỗi bằng giá trị THỰC LƯU (không phải `expected`) — xem giải thích ở đầu file.
      prevHash = r.rowHash;
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return { total, checked, errors, ok: errors.length === 0 };
}
