import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayISO,
  daysFromTodayISO,
  addDaysISO,
  isValidDateISO,
  daysOverdue,
} from "@/lib/nen/date";

test("todayISO trả đúng định dạng YYYY-MM-DD", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test("daysFromTodayISO(0) === todayISO()", () => {
  assert.equal(daysFromTodayISO(0), todayISO());
});

test("addDaysISO cộng lịch thuần, không phụ thuộc hôm nay", () => {
  assert.equal(addDaysISO("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
});

test("isValidDateISO từ chối ngày tràn lịch", () => {
  assert.equal(isValidDateISO("2026-02-30"), false);
  assert.equal(isValidDateISO("2026-01-15"), true);
});

test("daysOverdue dương khi quá hạn, 0 khi chưa tới hạn", () => {
  const today = todayISO();
  assert.equal(daysOverdue(today, today), 0);
  assert.equal(daysOverdue(daysFromTodayISO(-3), today) > 0, true);
});

// L3 (audit 2026-09-22): TZ phiên Postgres phải khớp Asia/Ho_Chi_Minh (lib/db/index.ts) —
// nếu không, CURRENT_DATE lệch todayISO() vào khung 0h–7h sáng giờ VN. Test tích hợp thật:
// so trực tiếp giá trị Postgres trả về với todayISO() JS.
test("CURRENT_DATE của Postgres khớp todayISO() (TZ pool = Asia/Ho_Chi_Minh)", async () => {
  if (!HAS_TEST_DB) return;
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ hom_nay: string }>("SELECT CURRENT_DATE::text AS hom_nay");
  assert.equal(row?.hom_nay, todayISO());
});
