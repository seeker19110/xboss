// scripts/check-db-params.ts — Cổng CI: chặn tái phát lỗi "truyền MẢNG cho helper lib/db"
// (W1 đã vá 101 lời gọi sai kiểu ở 43 file — module engineering/contracts-fidic chưa từng
// chạy được vì lỗi này). Logic quét dùng chung với `tests/db-params-invariant.test.ts` qua
// `scripts/lib/db-params-scan.ts` (xem ghi chú DRY trong file đó).
//
// Chạy: npx tsx scripts/check-db-params.ts
//  - THOÁT 1 (đỏ) nếu có lời gọi query/queryOne/run/insertId truyền mảng làm tham số cuối.
import { timLoiGoiSaiKieu } from "./lib/db-params-scan";

console.log("=== Kiểm tham số lib/db (chặn query(sql, [a, b])) ===");

const viPham = timLoiGoiSaiKieu();

if (viPham.length) {
  console.error(`\n[LỖI] ${viPham.length} lời gọi lib/db truyền mảng thay vì tham số rời:`);
  for (const v of viPham) console.error(`  - ${v.tep}:${v.dong} ${v.ham}(sql, [...])`);
  console.error(
    "\nSửa: bỏ dấu ngoặc vuông, truyền tham số rời — query(sql, a, b) thay vì " +
      "query(sql, [a, b]). GIỮ NGUYÊN placeholder $1/$2 trong chuỗi SQL (xem CLAUDE.md).",
  );
  process.exit(1);
}

console.log(`\n[OK] Không có lời gọi lib/db nào truyền mảng làm tham số cuối.`);
