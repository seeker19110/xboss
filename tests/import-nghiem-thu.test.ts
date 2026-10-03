import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

// Audit 2026-10-01 (F8) — import Excel đè lên task ĐÃ nghiệm thu. importWorkbook giữ status
// nghiem_thu (deriveStatus giữ) nhưng trước đây vẫn ghi % thấp hơn từ file và dựng lại lưới
// (bỏ tick các ô) → task "nghiem_thu" với % < 100%, phá bất biến L1/L2 (audit 2026-09-22).
// Nay task đó được giữ nguyên + cảnh báo; task chưa nghiệm thu vẫn ghi đè như cũ.

const S = { skip: !HAS_TEST_DB };
const K = `Q${(Date.now() % 1_000_000).toString()}`; // mã nhóm riêng, không đụng dữ liệu test khác

// Layout cột file gốc: [0]=mã, [1]=STT, [2]=tên, [3]=ghi chú, [4]=BĐ, [5]=số ngày, [6]=KT,
// [7]=% tiến độ, [8]="Lắp đặt", [9+]=cột lưới; header ở dòng 3 (HEADER_ROW=2), dữ liệu từ dòng 6.
function workbook(o1: [boolean, boolean], o2: [boolean, boolean]): XLSX.WorkBook {
  const header = [
    "CODE",
    "STT",
    "CHI TIẾT",
    "GHI CHÚ",
    "NGÀY BĐ",
    "SỐ NGÀY",
    "NGÀY KT",
    "% Tiến độ",
    "Lắp đặt",
    "D1",
    "D2",
    "Link Bản vẽ BBNT",
  ];
  const o = (v: boolean) => (v ? true : null);
  const pct = (a: [boolean, boolean]) => a.filter(Boolean).length / 2;
  const aoa: unknown[][] = [
    [],
    [],
    header,
    [],
    [],
    [K, "1", "Nhóm import NT", "", "2026-01-01", 10, "2026-01-10", 0],
    [
      `${K},01`,
      "01",
      "Task đã NT",
      "",
      "2026-01-01",
      5,
      "2026-01-05",
      pct(o1),
      null,
      o(o1[0]),
      o(o1[1]),
    ],
    [
      `${K},02`,
      "02",
      "Task chưa NT",
      "",
      "2026-01-01",
      5,
      "2026-01-05",
      pct(o2),
      null,
      o(o2[0]),
      o(o2[1]),
    ],
  ];
  return {
    SheetNames: ["TRACKING OGTĐ"],
    Sheets: { "TRACKING OGTĐ": XLSX.utils.aoa_to_sheet(aoa) },
  };
}

async function docTask(code: string) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{ id: number; status: string; progress: number; tick: number }>(
    `SELECT t.id, t.status, t.progress_percent AS progress,
            (SELECT COUNT(*)::int FROM progress_dimensions d WHERE d.task_id = t.id AND d.installed = 1) AS tick
       FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
      WHERE wp.code = ? AND t.code = ?`,
    K,
    code,
  );
}

test(
  "import lại file có % thấp hơn: task đã nghiệm thu GIỮ NGUYÊN (+ cảnh báo), task khác ghi đè",
  S,
  async () => {
    const { importWorkbook } = await import("@/lib/tien-do/import");
    const { run } = await import("@/lib/db");
    try {
      await importWorkbook(workbook([true, true], [true, true]));
      const nt = await docTask(`${K},01`);
      assert.equal(nt?.progress, 1);
      // Mô phỏng đã duyệt nghiệm thu (POST /api/tasks/:id/approve) cho task đầu.
      await run(
        `UPDATE tasks SET status = 'nghiem_thu', approval_source = 'task' WHERE id = ?`,
        nt!.id,
      );

      const stats = await importWorkbook(workbook([true, false], [true, false]));
      assert.ok(
        stats.warnings.some((w) => w.includes(`${K},01`) && w.includes("đã nghiệm thu")),
        `thiếu cảnh báo: ${JSON.stringify(stats.warnings)}`,
      );

      const sau = await docTask(`${K},01`);
      assert.equal(sau?.status, "nghiem_thu");
      assert.equal(sau?.progress, 1, "% của task đã nghiệm thu không bị hạ");
      assert.equal(sau?.tick, 2, "lưới của task đã nghiệm thu không bị dựng lại");

      const khac = await docTask(`${K},02`);
      assert.equal(khac?.progress, 0.5, "task chưa nghiệm thu vẫn được ghi đè theo file");
      assert.equal(khac?.tick, 1);
    } finally {
      await run(
        `DELETE FROM progress_dimensions WHERE task_id IN
           (SELECT t.id FROM tasks t JOIN work_packages wp ON wp.id = t.package_id WHERE wp.code = ?)`,
        K,
      );
      await run(
        `DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE code = ?)`,
        K,
      );
      await run(`DELETE FROM work_packages WHERE code = ?`, K);
    }
  },
);
