// scripts/check-test-fk-ids.ts — Cổng CI: chặn hằng số nguyên nhỏ gán cứng vào vị trí id khoá
// ngoại tới `users` trong test (`created_by`, `updated_by`, `actorId`...). Lớp lỗi này đã làm
// đỏ bộ test ở CẢ Đợt 4 lẫn Đợt 5 dù đã ghi thành ràng buộc cứng trong PLAN.md — xem lịch sử
// đầy đủ + heuristic trong `scripts/lib/test-fk-ids-scan.ts`.
//
// Chạy: npx tsx scripts/check-test-fk-ids.ts
//  - THOÁT 1 (đỏ) nếu có vi phạm ngoài WHITELIST, hoặc WHITELIST có mục thừa.
import { GOC_MAC_DINH, quetTests } from "./lib/test-fk-ids-scan";

// key = "đường dẫn tệp:số dòng" (tương đối từ gốc repo). Mỗi mục PHẢI kèm lý do cụ thể — đã
// đọc dòng đó trước khi thêm, không whitelist cho tiện. ĐỪNG thêm mục mới với lý do "id này
// không thật sự bị xoá" hay "chạy một mình vẫn xanh" — đó chính xác là lập luận đã gây ra lỗi
// 2 lần (Đợt 4, Đợt 5). Sửa file test (dùng id từ hàm `tao*()`) thay vì whitelist.
const WHITELIST: Record<string, string> = {
  // Hai dòng này nằm TRONG chuỗi fixture của chính ca test chứng minh cổng đỏ — chúng cố ý vi
  // phạm để bộ quét bắt được, không phải mã test thật chạy trên DB. Bộ quét đọc văn bản thô nên
  // không phân biệt được chuỗi với mã. Whitelist báo lỗi khi mục thừa, nên nếu fixture đổi dòng
  // thì cổng sẽ tự nhắc cập nhật chỗ này.
  "tests/check-test-fk-ids.test.ts:106": "fixture cố ý vi phạm trong ca chứng minh cổng đỏ",
  "tests/check-test-fk-ids.test.ts:112": "fixture cố ý vi phạm trong ca chứng minh cổng đỏ",
};

console.log("=== Kiểm id khoá ngoại gán cứng trong test (tests/**/*.test.ts) ===");

const viPham = quetTests(GOC_MAC_DINH);
const conLai = viPham.filter((v) => !(`${v.tep}:${v.dong}` in WHITELIST));

if (conLai.length) {
  console.error(`\n[LỖI] ${conLai.length} chỗ gán hằng số vào vị trí id khoá ngoại tới users:`);
  for (const v of conLai) console.error(`  - ${v.tep}:${v.dong} — ${v.chiTiet}`);
  console.error(
    "\nSửa: dùng id trả về từ hàm tao*() của chính file test (vd taoUser(...).id) thay vì " +
      "hằng số cứng — id cứng XANH khi chạy riêng file nhưng ĐỎ khi chạy cả bộ vì file khác đã " +
      "xoá đúng user đó. Có lý do chính đáng không sửa được thì thêm vào WHITELIST trong " +
      "scripts/check-test-fk-ids.ts kèm lý do cụ thể.",
  );
  process.exit(1);
}

// Whitelist không có mục thừa — vi phạm nào không còn tồn tại thì mục đó phải bị gỡ.
const conViPham = new Set(viPham.map((v) => `${v.tep}:${v.dong}`));
const thua = Object.keys(WHITELIST).filter((key) => !conViPham.has(key));
if (thua.length) {
  console.error(`\n[LỖI] WHITELIST có mục thừa (đã sửa/không còn ứng với vi phạm nào) — gỡ:`);
  for (const k of thua) console.error(`  - ${k}`);
  process.exit(1);
}

console.log(
  `\n[OK] Không có id khoá ngoại gán cứng ngoài WHITELIST (${viPham.length} vi phạm đã ` +
    `whitelist có lý do, ${Object.keys(WHITELIST).length} mục whitelist).`,
);
