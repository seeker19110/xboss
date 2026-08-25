// scripts/check-engineering-danh-tinh.ts — Cổng CI: bảng lớp `engineering_*` KHÔNG được
// tự giữ danh tính đối tác/đối tượng nghiệp vụ bằng chữ tự do mà không tham chiếu bảng gốc.
//
// VÌ SAO (ADR-0011, audit 2026-08-25 §3.3): 119/269 bảng của hệ mang tiền tố
// `engineering_`. Khi một bảng trong lớp đó tự lưu `company_name`/`tax_code`/`vendor_name`
// mà không có FK về `suppliers`, cùng một nhà thầu tồn tại hai bản ghi lệch nhau ở hai lớp
// và không cơ chế nào bắt được — đúng lỗi đã xảy ra với `engineering_subcon_profiles`.
//
// Chạy: npx tsx scripts/check-engineering-danh-tinh.ts
//  - THOÁT 1 (đỏ) nếu có bảng `engineering_*` mang cột danh tính mà cả schema (kể cả các
//    ALTER TABLE sau này) không có FK về bảng gốc tương ứng.
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "migrations");

/** Cột "danh tính" → bảng gốc phải tham chiếu. */
const CỘT_DANH_TÍNH: Record<string, string> = {
  company_name: "suppliers",
  tax_code: "suppliers",
  supplier_name: "suppliers",
  subcontractor_name: "suppliers",
  vendor_name: "suppliers",
  contractor_name: "suppliers",
  contract_code: "contracts",
};

const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

/** Thân CREATE TABLE của từng bảng engineering_*, cộng thêm mọi ALTER TABLE của bảng đó
 *  (cột FK thường được thêm ở migration sau, không nằm trong CREATE gốc). */
const thanBang = new Map<string, string>();
for (const m of sql.matchAll(
  /CREATE TABLE IF NOT EXISTS (engineering_\w+)\s*\(([\s\S]*?)\n\s*\);/g,
)) {
  thanBang.set(m[1], (thanBang.get(m[1]) ?? "") + m[2]);
}
for (const m of sql.matchAll(/ALTER TABLE (engineering_\w+)([^;]*);/g)) {
  if (thanBang.has(m[1])) thanBang.set(m[1], thanBang.get(m[1])! + "\n" + m[2]);
}

const loi: string[] = [];
for (const [bang, than] of thanBang) {
  for (const [cot, bangGoc] of Object.entries(CỘT_DANH_TÍNH)) {
    if (!new RegExp(`(^|\\s)${cot}\\b`, "m").test(than)) continue;
    if (new RegExp(`REFERENCES\\s+${bangGoc}\\b`).test(than)) continue;
    loi.push(`${bang}.${cot} — thiếu FK về ${bangGoc}`);
  }
}

console.log("=== Kiểm danh tính trong lớp engineering_* ===");
console.log(`Bảng engineering_* quét: ${thanBang.size} | vi phạm: ${loi.length}`);

if (loi.length) {
  console.error(
    `\n[LỖI] Bảng lớp engineering giữ danh tính bằng chữ tự do, không nối về bảng gốc:\n  - ${loi.join("\n  - ")}\n\n` +
      "Thêm cột FK về bảng gốc (xem migration 0137/0138 làm mẫu) — hoặc bỏ cột tên tự do " +
      "và đọc tên qua JOIN. Quy tắc: ADR-0011, danh tính chỉ có MỘT nguồn.",
  );
  process.exit(1);
}

console.log("\nOK — mọi bảng engineering_* mang cột danh tính đều nối về bảng gốc.");
