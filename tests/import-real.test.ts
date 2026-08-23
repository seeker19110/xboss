import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as XLSX from "xlsx";

// Kiểm chứng luồng import trên DỮ LIỆU THẬT (file tracking gốc trong attachments/), đúng
// đường đọc của production (`cellDates: true` như app/api/import/excel/route.ts và
// scripts/seed.ts). Chạy trực tiếp trên DB test — dữ liệu tổng hợp không bắt được các
// lớp lỗi phụ thuộc hình dạng file thật (header gộp ô, hàng không có mã, ô lưới bỏ trống).
const XLSX_FILE = "attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";
const SKIP = !HAS_TEST_DB || !existsSync(XLSX_FILE);

const TABLES = [
  "notifications",
  "progress_dimensions",
  "task_history",
  "tasks",
  "work_packages",
  "sheet_types",
  "towers",
];

async function resetWbs() {
  const { run } = await import("@/lib/db");
  for (const t of TABLES) await run(`DELETE FROM ${t}`);
  await run(`DELETE FROM projects WHERE name = 'TT AVIO Tháp A'`);
}

test(
  "import file thật: lũy đẳng, không lỗi, và cảnh báo đúng các dòng lệch % của file",
  { skip: SKIP },
  async () => {
    const { query } = await import("@/lib/db");
    const { importWorkbook } = await import("@/lib/tien-do/import");
    await resetWbs();

    const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });
    const first = await importWorkbook(wb);
    assert.deepEqual(first.errors, [], "import file gốc không được sinh lỗi dòng nào");
    assert.ok(first.packages > 100 && first.tasks > 2000, `số lượng bất thường: ${first.tasks}`);

    // Cảnh báo = các dòng file tự ghi % khác % XBoss đếm từ lưới (sheet OGHL có nhóm hàng
    // chỉ dùng 4/16 cột). Không tự sửa số, chỉ nêu ra — xem ImportOptions trong lib/import.ts.
    assert.ok(first.warnings.length > 0, "phải nêu được các dòng lệch % của file gốc");
    assert.ok(first.warnings.every((w) => w.includes("TRACKING OGHL")));

    const snapshot = async () =>
      JSON.stringify(
        await query(
          `SELECT t.code, t.progress_percent, t.status, t.start_date, t.end_date,
                  (SELECT COUNT(*) FROM progress_dimensions d WHERE d.task_id = t.id) AS dims
             FROM tasks t ORDER BY t.id`,
        ),
      );

    const before = await snapshot();
    // Lũy đẳng: import lại đúng file đó không được tạo thêm gì, không đổi con số nào.
    const second = await importWorkbook(wb);
    assert.equal(second.packages, 0);
    assert.equal(second.tasks, 0);
    assert.equal(await snapshot(), before, "import lần 2 làm đổi dữ liệu");

    await resetWbs();
  },
);

test(
  "import file thật: ngày BĐ/KT không lệch theo múi giờ của process",
  { skip: SKIP },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { importWorkbook } = await import("@/lib/tien-do/import");
    const wb = XLSX.readFile(XLSX_FILE, { cellDates: true });

    // Cùng file, import ở 2 múi giờ trái dấu → ngày ghi xuống DB phải y hệt. Trước đây
    // toISO quy đổi Date (giờ địa phương của SheetJS) qua toISOString nên mọi ngày lùi
    // 1 hôm ở múi giờ dương — gồm chính giờ VN (UTC+7).
    const prev = process.env.TZ;
    const runAt = async (tz: string) => {
      process.env.TZ = tz;
      await resetWbs();
      await importWorkbook(wb);
      return queryOne<{ minStart: string; maxEnd: string }>(
        `SELECT MIN(start_date)::text AS "minStart", MAX(end_date)::text AS "maxEnd" FROM tasks`,
      );
    };
    try {
      const vn = await runAt("Asia/Ho_Chi_Minh");
      const utc = await runAt("UTC");
      const us = await runAt("America/New_York");
      assert.deepEqual(vn, utc);
      assert.deepEqual(vn, us);
      assert.equal(vn?.minStart, "2025-11-01");
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
      await resetWbs();
    }
  },
);
