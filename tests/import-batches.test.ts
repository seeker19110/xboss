import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// C3 §5 — Sổ import + đóng dấu mẫu số (migrations/0093).
//
// Điều đang được bảo vệ: `dimDenominator` quyết định MẪU SỐ khi quy lưới checkbox → %.
// Trước 0093 nó chỉ tồn tại trong bộ nhớ đúng một lần lúc import, nên nhìn một task KHÔNG
// ai trả lời được "vì sao % là con số này". Test kiểm đúng tính TÁI LẬP đó: chế độ nào,
// file nào (băm nội dung), ai chạy, và task nào thuộc lần import nào.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";

const S = { skip: !HAS_TEST_DB };

// Layout đúng file WBS tracking gốc: HEADER_ROW=2, DATA_START=5, cột lưới bắt đầu từ
// DIM_START=9 (xem lib/import.ts). Header đặt nhãn cho 4 cột dimension: index 9..12.
function wbWithGrid(): XLSX.WorkBook {
  const aoa: unknown[][] = [
    [],
    [],
    ["", "", "", "", "", "", "", "", "", "D100", "D200", "D300", "D400"],
    [],
    [],
    ["B1", "1", "Nhóm B1", "", "2026-01-01", 10, "2026-01-10"],
    // Hàng task: chỉ 2/4 ô lưới có dữ liệu, cả 2 đều tick → hai chế độ mẫu số cho ra
    // 4 và 2, khác nhau rõ ràng.
    [
      "B1,01",
      "01",
      "Task lưới",
      "",
      "2026-01-01",
      5,
      "2026-01-05",
      null,
      null,
      "x",
      "x",
      null,
      null,
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return { SheetNames: ["TRACKING OGTĐ"], Sheets: { "TRACKING OGTĐ": ws } };
}

async function cleanup() {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM progress_dimensions WHERE task_id IN (SELECT id FROM tasks WHERE code LIKE 'B1%')`,
  );
  await run(`DELETE FROM tasks WHERE code LIKE 'B1%'`);
  await run(`DELETE FROM work_packages WHERE code LIKE 'B1%'`);
  await run(`DELETE FROM import_batches WHERE source_name LIKE 'test-%'`);
}

test(
  "Import KHÔNG truyền source → không ghi sổ, không đóng dấu (đường gọi cũ giữ nguyên)",
  S,
  async () => {
    const { importWorkbook } = await import("@/lib/tien-do/import");
    const { queryOne } = await import("@/lib/db");
    try {
      const stats = await importWorkbook(wbWithGrid(), { dimDenominator: "row-nonempty" });
      assert.equal(stats.batchId, undefined, "không truyền source thì KHÔNG được tạo batch");
      // Nhưng chế độ đã dùng thật vẫn phải báo ra ngoài.
      assert.equal(stats.dimDenominator, "row-nonempty");

      const t = await queryOne<{ batch: number | null; mode: string | null }>(
        `SELECT import_batch_id AS batch, dim_denominator_mode AS mode FROM tasks WHERE code = 'B1,01'`,
      );
      assert.equal(t?.batch, null, "không có batch thì task không được gán batch giả");
      // Chế độ vẫn đóng dấu được vì nó là sự thật của lần import này.
      assert.equal(t?.mode, "row-nonempty");
    } finally {
      await cleanup();
    }
  },
);

test("Import CÓ source → ghi sổ đủ băm/chế độ/người chạy và đóng dấu lên task", S, async () => {
  const { importWorkbook } = await import("@/lib/tien-do/import");
  const { queryOne, insertId, run } = await import("@/lib/db");
  const userId = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('Người import', ?, 'admin', 'x') RETURNING id`,
    `import-batch-${Date.now()}@test.local`,
  );
  const sha = createHash("sha256").update("noi dung file gia").digest("hex");
  try {
    const stats = await importWorkbook(wbWithGrid(), {
      dimDenominator: "columns",
      source: { name: "test-tracking.xlsx", sha256: sha, bytes: 1234, importedBy: userId },
    });
    assert.ok(stats.batchId && stats.batchId > 0, "phải trả về batchId");

    const b = await queryOne<{
      name: string;
      sha: string;
      bytes: number;
      mode: string;
      by: number;
      stats: { tasks?: number; dimDenominator?: string };
    }>(
      `SELECT source_name AS name, source_sha256 AS sha, source_bytes AS bytes,
              dim_denominator_mode AS mode, imported_by AS by, stats
         FROM import_batches WHERE id = ?`,
      stats.batchId,
    );
    assert.equal(b?.name, "test-tracking.xlsx");
    assert.equal(b?.sha, sha, "băm nội dung phải lưu nguyên — định danh file bền theo nội dung");
    assert.equal(Number(b?.bytes), 1234);
    assert.equal(b?.mode, "columns");
    assert.equal(b?.by, userId);
    // stats chốt ở cuối phải là số liệu THẬT, không phải object rỗng khởi tạo lúc mở sổ.
    assert.ok((b?.stats.tasks ?? 0) > 0, "stats phải được chốt lại sau khi import xong");

    const t = await queryOne<{ batch: number; mode: string }>(
      `SELECT import_batch_id AS batch, dim_denominator_mode AS mode FROM tasks WHERE code = 'B1,01'`,
    );
    assert.equal(t?.batch, stats.batchId, "task phải trỏ đúng batch vừa tạo");
    assert.equal(t?.mode, "columns");
  } finally {
    await cleanup();
    await run(`DELETE FROM users WHERE id = ?`, userId);
  }
});

test(
  "Import ĐÈ bằng chế độ khác → dấu trên task đổi theo lần MỚI NHẤT, sổ giữ đủ 2 lần",
  S,
  async () => {
    const { importWorkbook } = await import("@/lib/tien-do/import");
    const { queryOne, query } = await import("@/lib/db");
    try {
      const first = await importWorkbook(wbWithGrid(), {
        dimDenominator: "columns",
        source: { name: "test-lan-1.xlsx", sha256: "a".repeat(64) },
      });
      const second = await importWorkbook(wbWithGrid(), {
        dimDenominator: "row-nonempty",
        source: { name: "test-lan-2.xlsx", sha256: "b".repeat(64) },
      });
      assert.notEqual(first.batchId, second.batchId);

      const t = await queryOne<{ batch: number; mode: string }>(
        `SELECT import_batch_id AS batch, dim_denominator_mode AS mode FROM tasks WHERE code = 'B1,01'`,
      );
      assert.equal(t?.mode, "row-nonempty", "dấu phải là chế độ của lần import mới nhất");
      assert.equal(t?.batch, second.batchId);

      // Lịch sử KHÔNG bị ghi đè — đó là điểm của cuốn sổ.
      const rows = await query<{ id: number }>(
        `SELECT id FROM import_batches WHERE source_name IN ('test-lan-1.xlsx','test-lan-2.xlsx')`,
      );
      assert.equal(rows.length, 2, "cả 2 lần import phải còn nguyên trong sổ");
    } finally {
      await cleanup();
    }
  },
);

test("Mẫu số đổi thật sự đổi số ô lưới — đúng thứ mà dấu đang ghi lại", S, async () => {
  const { importWorkbook } = await import("@/lib/tien-do/import");
  const { queryOne } = await import("@/lib/db");
  try {
    await importWorkbook(wbWithGrid(), {
      dimDenominator: "columns",
      source: { name: "test-cols.xlsx", sha256: "c".repeat(64) },
    });
    const asColumns = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM progress_dimensions d
         JOIN tasks t ON t.id = d.task_id WHERE t.code = 'B1,01'`,
    );

    await importWorkbook(wbWithGrid(), {
      dimDenominator: "row-nonempty",
      source: { name: "test-rows.xlsx", sha256: "d".repeat(64) },
    });
    const asRowNonEmpty = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM progress_dimensions d
         JOIN tasks t ON t.id = d.task_id WHERE t.code = 'B1,01'`,
    );

    // 4 cột lưới khai báo, hàng chỉ có 2 ô có dữ liệu.
    assert.equal(asColumns?.n, 4, "chế độ 'columns' lấy toàn bộ cột lưới làm mẫu số");
    assert.equal(asRowNonEmpty?.n, 2, "chế độ 'row-nonempty' chỉ lấy ô có dữ liệu của hàng");
    assert.notEqual(
      asColumns?.n,
      asRowNonEmpty?.n,
      "hai chế độ phải cho mẫu số KHÁC nhau — nếu bằng nhau thì test không chứng minh được gì",
    );
  } finally {
    await cleanup();
  }
});
