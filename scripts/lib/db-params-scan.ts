// scripts/lib/db-params-scan.ts — Hàm quét dùng chung cho lớp lỗi "truyền MẢNG cho helper lib/db".
//
// LỊCH SỬ: hàm này được viết lần đầu ở W1 (đợt "nâng tầm dự án" GĐ2) trong
// `tests/db-params-invariant.test.ts` để vá 101 lời gọi query/run truyền mảng thay vì tham số
// rời — lỗi khiến 43 file (nhóm route/lib engineering + contracts-fidic) chưa từng chạy được.
// W2.3 (cổng CI `check:db-params`) cần đúng logic đó nhưng W1 chưa được tích hợp vào nhánh này
// lúc code (worktree riêng, brief cấm sửa file của việc khác) — nên hàm được TÁCH ra đây làm
// module dùng chung, y hệt logic của W1, để cả `check-db-params.ts` (cổng CI) lẫn
// `tests/db-params-invariant.test.ts` (khi tích hợp) đều import lại thay vì chép 2 lần (DRY).
//
// GHI CHÚ TÍCH HỢP: khi gộp nhánh W1 vào, sửa `tests/db-params-invariant.test.ts` để import
// `timLoiGoiSaiKieu`/`LoiGoiSaiKieu` từ file này thay vì giữ bản sao riêng của nó.
//
// `lib/db` khai `query(sql, ...params)` / `queryOne` / `run` / `insertId` nhận tham số BIẾN
// THIÊN. Gọi kiểu `query(sql, [projectId])` làm `pg` nhận `[[projectId]]` → Postgres thấy
// `{"1"}` thay vì `1` và chết ngay câu truy vấn đầu tiên:
//   invalid input syntax for type bigint: "{"1"}"   (SQLSTATE 22P02)
//
// Heuristic TĨNH (đọc source, không cần DB): tìm lời gọi `query|queryOne|run|insertId(` mà
// tham số đầu là chuỗi SQL và tham số CUỐI CÙNG là một mảng literal `[...]`. Bỏ qua lời gọi
// dạng thành viên (`client.query(...)`, `pool.query(...)`) — đó là API `pg` thô, vốn nhận
// mảng values nên hoàn toàn hợp lệ (xem `lib/db/index.ts`, `lib/db/migrate.ts`).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const GOC_MAC_DINH = join(import.meta.dirname, "..", "..");
export const THU_MUC_QUET_MAC_DINH = ["app/api", "lib"];

function duyetTepTs(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) duyetTepTs(p, out);
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

// Tìm vị trí dấu đóng khớp với dấu mở tại `batDau`, bỏ qua nội dung trong chuỗi/comment.
function timDauDong(src: string, batDau: number): number {
  const cap: Record<string, string> = { "[": "]", "{": "}", "(": ")" };
  const ngan: string[] = [src[batDau]];
  let i = batDau + 1;
  while (i < src.length && ngan.length > 0) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === q) {
          i++;
          break;
        } else i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i) + 2;
      continue;
    }
    if (cap[c]) {
      ngan.push(c);
      i++;
      continue;
    }
    if (c === "]" || c === "}" || c === ")") {
      if (cap[ngan[ngan.length - 1]] !== c) return -1;
      ngan.pop();
      i++;
      continue;
    }
    i++;
  }
  return ngan.length > 0 ? -1 : i - 1;
}

// `[^.\w$]` phía trước: loại `client.query(`, `pool.query(`, `this.run(`...
const MAU_GOI = /(^|[^.\w$])(query|queryOne|run|insertId)\s*(<[^<>]*>)?\s*\(/g;

export type LoiGoiSaiKieu = { tep: string; dong: number; ham: string };

/** Quét source tìm lời gọi helper lib/db truyền mảng thay vì tham số rời. */
export function timLoiGoiSaiKieu(
  goc: string = GOC_MAC_DINH,
  thuMuc: string[] = THU_MUC_QUET_MAC_DINH,
): LoiGoiSaiKieu[] {
  const viPham: LoiGoiSaiKieu[] = [];
  for (const tm of thuMuc) {
    for (const tep of duyetTepTs(join(goc, tm))) {
      const src = readFileSync(tep, "utf8");
      MAU_GOI.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MAU_GOI.exec(src)) !== null) {
        const mo = m.index + m[0].length - 1;
        const dong = timDauDong(src, mo);
        if (dong < 0) continue;
        const ben = src.slice(mo + 1, dong);
        // Bỏ khoảng trắng VÀ comment mở đầu (nhiều lời gọi có comment giải thích ngay trước
        // chuỗi SQL) — không bỏ thì bộ quét mù đúng với những chỗ đó.
        let dau = ben;
        for (;;) {
          const truoc = dau;
          dau = dau.trimStart();
          if (dau.startsWith("//")) dau = dau.slice(dau.indexOf("\n") + 1);
          else if (dau.startsWith("/*")) dau = dau.slice(dau.indexOf("*/") + 2);
          if (dau === truoc) break;
        }
        // Tham số đầu phải là SQL dạng literal — loại các hàm trùng tên nhận đối tượng/biến.
        if (!dau.startsWith("`") && !dau.startsWith('"') && !dau.startsWith("'")) continue;
        // Nhảy qua literal SQL để tìm dấu phẩy ngăn tham số thứ hai.
        let i = mo + 1 + (ben.length - dau.length);
        const q = src[i];
        i++;
        while (i < src.length) {
          if (src[i] === "\\") i += 2;
          else if (src[i] === q) {
            i++;
            break;
          } else i++;
        }
        while (i < dong && /\s/.test(src[i])) i++;
        if (src[i] !== ",") continue;
        i++;
        while (i < dong && /\s/.test(src[i])) i++;
        if (src[i] !== "[") continue;
        const dongMang = timDauDong(src, i);
        if (dongMang < 0 || dongMang > dong) continue;
        // Mảng phải là tham số CUỐI (sau nó chỉ còn khoảng trắng/dấu phẩy) — nếu còn tham số
        // khác thì đây là mảng dữ liệu thật, không phải mẫu bọc params.
        let j = dongMang + 1;
        while (j < dong && /[\s,]/.test(src[j])) j++;
        if (j !== dong) continue;
        viPham.push({
          tep: relative(goc, tep),
          dong: src.slice(0, m.index).split("\n").length,
          ham: m[2],
        });
      }
    }
  }
  return viPham;
}
