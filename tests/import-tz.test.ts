import "./setup"; // phải đứng đầu: trỏ DB sang :memory: trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as XLSX from "xlsx";
import { toISO } from "@/lib/tien-do/import";

// Bất biến múi giờ: đường import THẬT đọc workbook bằng `cellDates: true`
// (app/api/import/excel/route.ts, scripts/seed.ts) nên ô ngày về tới toISO dưới dạng
// `Date` do SheetJS dựng theo GIỜ ĐỊA PHƯƠNG. Ngày ISO ghi xuống DB phải là ngày trên
// lịch của người dùng, KHÔNG phụ thuộc TZ của process — trước đây quy đổi qua
// toISOString() làm mọi ngày lùi 1 hôm ở múi giờ dương, gồm chính giờ VN (UTC+7).
//
// Node đọc lại process.env.TZ ngay khi gán (>= v16) nên đổi được TZ giữa chừng test.
const TZS = ["UTC", "Asia/Ho_Chi_Minh", "Pacific/Kiritimati", "America/New_York"];

function withTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

test("toISO: Date (cellDates) giữ đúng ngày lịch ở mọi múi giờ", () => {
  for (const tz of TZS) {
    withTZ(tz, () => {
      // SheetJS dựng 0h giờ địa phương cho ô ngày.
      assert.equal(toISO(new Date(2026, 11, 13)), "2026-12-13", `TZ=${tz}`);
      assert.equal(toISO(new Date(2026, 0, 1)), "2026-01-01", `TZ=${tz}`);
    });
  }
});

// File tracking gốc trong repo — dữ liệu THẬT, đúng đường đọc của production.
const XLSX_FILE = "attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";
const SHEET = "TRACKING OGTĐ";

test("toISO: trên file thật, đọc kiểu serial và kiểu cellDates cho cùng ngày ở mọi TZ", (t) => {
  if (!existsSync(XLSX_FILE)) return t.skip("không có file Excel gốc");
  const readRows = (cellDates: boolean) =>
    XLSX.utils.sheet_to_json(
      XLSX.readFile(XLSX_FILE, { sheets: [SHEET], cellDates }).Sheets[SHEET],
      { header: 1, defval: null },
    ) as unknown[][];

  for (const tz of TZS) {
    withTZ(tz, () => {
      const num = readRows(false);
      const dat = readRows(true);
      let checked = 0;
      for (let i = 5; i < num.length; i++) {
        for (const c of [4, 6]) {
          const serialISO = toISO(num[i]?.[c]);
          if (serialISO === null) continue;
          assert.equal(toISO(dat[i]?.[c]), serialISO, `TZ=${tz} dòng ${i + 1} cột ${c}`);
          checked++;
        }
      }
      assert.ok(checked > 100, `TZ=${tz}: cần đủ ô ngày để kiểm (được ${checked})`);
    });
  }
});

test("toISO: chuỗi ISO và chuỗi có offset không phụ thuộc TZ", () => {
  for (const tz of TZS) {
    withTZ(tz, () => {
      assert.equal(toISO("2026-06-10"), "2026-06-10", `TZ=${tz}`);
      assert.equal(toISO("2026-06-10T23:00:00Z"), "2026-06-10", `TZ=${tz}`);
      assert.equal(toISO("2026-06-10T23:00:00+07:00"), "2026-06-10", `TZ=${tz}`);
    });
  }
});

test("toISO: chuỗi ngày-giờ không có múi giờ đọc theo lịch địa phương", () => {
  for (const tz of TZS) {
    withTZ(tz, () => {
      assert.equal(toISO("2026-06-10T00:00:00"), "2026-06-10", `TZ=${tz}`);
    });
  }
});

test("toISO: chuỗi ngày kiểu d-m-yyyy không bị hiểu nhầm là có offset múi giờ", () => {
  // Đuôi "-2026" trông giống offset "±hhmm" — nếu nhận nhầm sẽ quy đổi qua UTC và lệch
  // 1 ngày ở múi giờ dương. Phải luôn ra cùng một ngày ở mọi TZ.
  for (const tz of TZS) {
    withTZ(tz, () => {
      assert.equal(toISO("1-2-2026"), "2026-01-02", `TZ=${tz}`);
      assert.equal(toISO("12-25-2026"), "2026-12-25", `TZ=${tz}`);
    });
  }
});
