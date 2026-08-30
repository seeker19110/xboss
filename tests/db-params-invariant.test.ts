import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timLoiGoiSaiKieu } from "../scripts/lib/db-params-scan";

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
// Bộ quét dùng chung nằm ở `scripts/lib/db-params-scan.ts` — cổng CI `check:db-params`
// (việc W2.3) và test này DÙNG CHUNG một cài đặt, không giữ hai bản sao (gộp lúc tích hợp
// GĐ2: W1 viết bộ quét trong test, W2 tách sang scripts/lib cho cổng CI dùng).

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
