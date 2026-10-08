import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { oExcelTheoCot, ghiChuCotText } from "@/lib/tai-chinh/excel-exact";

// ===== L5 (S10a): chọn kiểu ô Excel theo cột =====

test("oExcelTheoCot: cột toàn số nhỏ → toàn number", () => {
  const r = oExcelTheoCot([
    { unscaled: 123456n, scale: 2 },
    { unscaled: -500n, scale: 3 },
    { unscaled: 0n, scale: 2 },
  ]);
  assert.equal(r.laText, false);
  assert.deepEqual(r.cells, [1234.56, -0.5, 0]);
});

test("oExcelTheoCot: một giá trị > 15 chữ số có nghĩa → cả cột text canonical", () => {
  const r = oExcelTheoCot([
    { unscaled: 123456n, scale: 2 },
    { unscaled: 1234567890123456n, scale: 5 }, // 16 chữ số có nghĩa
  ]);
  assert.equal(r.laText, true);
  assert.deepEqual(r.cells, ["1234.56", "12345678901.23456"]);
});

test("oExcelTheoCot: nhóm 4 dòng tổng — một dòng vượt ngưỡng kéo cả nhóm thành text", () => {
  const nho = oExcelTheoCot([
    { unscaled: 100000n, scale: 2 },
    { unscaled: -10000n, scale: 2 },
    { unscaled: -5000n, scale: 2 },
    { unscaled: 85000n, scale: 2 },
  ]);
  assert.equal(nho.laText, false);
  assert.ok(nho.cells.every((c) => typeof c === "number"));
  const lon = oExcelTheoCot([
    { unscaled: 1234567890123456789n, scale: 2 },
    { unscaled: -10000n, scale: 2 },
    { unscaled: -5000n, scale: 2 },
    { unscaled: 1234567890123441789n, scale: 2 },
  ]);
  assert.equal(lon.laText, true);
  assert.ok(lon.cells.every((c) => typeof c === "string"));
  assert.equal(lon.cells[1], "-100.00");
});

test("ghiChuCotText: chỉ có ghi chú khi có cột text", () => {
  assert.equal(ghiChuCotText([]), null);
  const g = ghiChuCotText(["Thành tiền đợt", "Luỹ kế"]);
  assert.ok(g?.startsWith("Lưu ý: cột Thành tiền đợt, Luỹ kế ghi dạng văn bản"));
  assert.ok(g?.includes("không dùng hàm SUM"));
});

// ===== M4 (S10a): withTransaction REPEATABLE READ (cần TEST_DATABASE_URL) =====

test(
  "withTransaction repeatable_read: câu đọc thứ 2 không thấy commit của connection khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withTransaction, query, getPool } = await import("@/lib/db");
    const pool = getPool();
    await pool.query("CREATE TABLE IF NOT EXISTS _tmp_rr_test (v INT)");
    await pool.query("DELETE FROM _tmp_rr_test");
    await pool.query("INSERT INTO _tmp_rr_test (v) VALUES (1)");
    try {
      const [dau, sau] = await withTransaction(
        async () => {
          const a = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM _tmp_rr_test");
          // Connection khác (ngoài transaction) ghi + commit giữa chừng.
          await pool.query("INSERT INTO _tmp_rr_test (v) VALUES (2)");
          const b = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM _tmp_rr_test");
          return [a[0].n, b[0].n];
        },
        { isolation: "repeatable_read" },
      );
      assert.equal(dau, 1);
      assert.equal(sau, 1, "snapshot cố định: không thấy dòng commit giữa chừng");
      const sauCung = await pool.query("SELECT COUNT(*)::int AS n FROM _tmp_rr_test");
      assert.equal(sauCung.rows[0].n, 2);
    } finally {
      await pool.query("DROP TABLE IF EXISTS _tmp_rr_test");
    }
  },
);

test(
  "withTransaction/withProjectScope repeatable_read lồng trong transaction có sẵn → throw",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withTransaction, withProjectScope } = await import("@/lib/db");
    await assert.rejects(
      () => withTransaction(() => withTransaction(async () => 1, { isolation: "repeatable_read" })),
      /REPEATABLE READ/,
    );
    await assert.rejects(
      () =>
        withTransaction(() =>
          withProjectScope("*", async () => 1, { isolation: "repeatable_read" }),
        ),
      /REPEATABLE READ/,
    );
    // Mở mới qua withProjectScope (read-only + RR) vẫn chạy bình thường.
    assert.equal(await withProjectScope("*", async () => 7, { isolation: "repeatable_read" }), 7);
  },
);
