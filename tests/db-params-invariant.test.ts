import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// W1 (đợt "nâng tầm dự án" GĐ2) — Test bất biến chặn lớp lỗi "truyền MẢNG cho helper lib/db".
//
// `lib/db` khai `query(sql, ...params)` / `queryOne` / `run` / `insertId` nhận tham số BIẾN
// THIÊN. Gọi kiểu `query(sql, [projectId])` làm `pg` nhận `[[projectId]]` → Postgres thấy
// `{"1"}` thay vì `1` và chết ngay câu truy vấn đầu tiên:
//   invalid input syntax for type bigint: "{"1"}"   (SQLSTATE 22P02)
// Lỗi này từng sống sót nhiều tháng ở 101 lời gọi trong 43 file (toàn bộ nhóm route/lib
// engineering + contracts-fidic) vì không ai chạy thử các module đó.
//
// Heuristic TĨNH (đọc source, không cần DB): tìm lời gọi `query|queryOne|run|insertId(` mà
// tham số đầu là chuỗi SQL và tham số CUỐI CÙNG là một mảng literal `[...]`. Bỏ qua lời gọi
// dạng thành viên (`client.query(...)`, `pool.query(...)`) — đó là API `pg` thô, vốn nhận
// mảng values nên hoàn toàn hợp lệ (xem `lib/db/index.ts`, `lib/db/migrate.ts`).
//
// Hàm `timLoiGoiSaiKieu()` được export để cổng CI `check:db-params` (việc W2.3) dùng lại,
// không chép logic quét sang chỗ thứ hai.

const GOC = join(import.meta.dirname, "..");
const THU_MUC_QUET = ["app/api", "lib"];

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
export function timLoiGoiSaiKieu(goc = GOC, thuMuc = THU_MUC_QUET): LoiGoiSaiKieu[] {
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

test("không lời gọi lib/db nào truyền mảng thay cho tham số rời", () => {
  const viPham = timLoiGoiSaiKieu();
  assert.deepEqual(
    viPham,
    [],
    "Helper lib/db nhận tham số biến thiên — bỏ dấu ngoặc vuông, truyền rời " +
      "(GIỮ NGUYÊN placeholder $1/$2 trong SQL):\n" +
      viPham.map((v) => `  - ${v.tep}:${v.dong} ${v.ham}(sql, [...])`).join("\n"),
  );
});

test("bộ quét bắt được mẫu sai (tự kiểm chứng trên fixture trong bộ nhớ)", () => {
  // Kiểm chứng heuristic không bị mù: chạy chính bộ quét trên một thư mục fixture tạm chứa
  // đủ 3 ca — mẫu sai, mẫu đúng (tham số rời), và lời gọi `pg` thô (mảng values hợp lệ).
  const goc = mkdtempSync(join(tmpdir(), "xboss-dbparams-"));
  try {
    mkdirSync(join(goc, "lib"));
    writeFileSync(
      join(goc, "lib", "sai.ts"),
      "const a = await query(`SELECT 1 FROM t WHERE id = $1`, [projectId]);\n" +
        "const b = await run(`UPDATE t SET x = ? WHERE id = ?`, x, id);\n" +
        "const c = await client.query(`SELECT 1`, [id]);\n" +
        "const d = await query(\n  // chú thích chen giữa\n  `SELECT 2 FROM t WHERE id = $1`,\n  [id],\n);\n",
    );
    const viPham = timLoiGoiSaiKieu(goc, ["lib"]);
    assert.equal(viPham.length, 2, "phải bắt đúng 2 vi phạm (kể cả lời gọi có comment chen giữa)");
    assert.equal(viPham[0].tep, join("lib", "sai.ts"));
    assert.equal(viPham[0].ham, "query");
  } finally {
    rmSync(goc, { recursive: true, force: true });
  }
});
