import { test } from "node:test";
import assert from "node:assert/strict";
import { groupDelayedTasks } from "@/lib/delayed-groups";

const T = (over: Partial<Parameters<typeof groupDelayedTasks>[0][number]> = {}) => ({
  sheetType: "A-ODNN-Z1",
  floorLabel: "16",
  endDate: "2026-05-08",
  progressPercent: 0,
  delayReason: null,
  ...over,
});

test("gom theo (sheet, tầng): cùng cặp gộp 1 hạng mục, đếm đúng số công tác", () => {
  const groups = groupDelayedTasks(
    [T({ floorLabel: "16" }), T({ floorLabel: "16" }), T({ floorLabel: "16" })],
    { today: "2026-07-15" },
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].sheetType, "A-ODNN-Z1");
  assert.equal(groups[0].floorLabel, "16");
});

test("khác sheet hoặc khác tầng → tách hạng mục riêng", () => {
  const groups = groupDelayedTasks(
    [
      T({ sheetType: "A-ODNN-Z1", floorLabel: "16" }),
      T({ sheetType: "A-ODNN-Z2", floorLabel: "16" }),
      T({ sheetType: "A-ODNN-Z1", floorLabel: "4" }),
    ],
    { today: "2026-07-15" },
  );
  assert.equal(groups.length, 3);
});

test("hạn sớm nhất + số ngày trễ lớn nhất theo hạn sớm nhất", () => {
  const [g] = groupDelayedTasks(
    [
      T({ endDate: "2026-06-04" }),
      T({ endDate: "2026-05-08" }), // sớm nhất → trễ nhiều nhất
      T({ endDate: "2026-06-09" }),
    ],
    { today: "2026-07-15" },
  );
  assert.equal(g.earliestEndDate, "2026-05-08");
  assert.equal(g.maxDaysOverdue, 68); // 2026-05-08 → 2026-07-15
});

test("tiến độ trung bình = trung bình các công tác (null coi như 0)", () => {
  const [g] = groupDelayedTasks(
    [T({ progressPercent: 0.2 }), T({ progressPercent: 0.6 }), T({ progressPercent: null })],
    { today: "2026-07-15" },
  );
  assert.ok(Math.abs(g.avgProgress - 0.8 / 3) < 1e-9);
});

test("lý do trễ tổng hợp: đếm và sắp giảm dần, null → reason=null", () => {
  const [g] = groupDelayedTasks(
    [
      T({ delayReason: "vat_tu" }),
      T({ delayReason: "vat_tu" }),
      T({ delayReason: "nhan_luc" }),
      T({ delayReason: null }),
    ],
    { today: "2026-07-15" },
  );
  assert.deepEqual(g.reasons, [
    { reason: "vat_tu", count: 2 },
    { reason: "nhan_luc", count: 1 },
    { reason: null, count: 1 },
  ]);
});

test("sheetLabel dùng cho tên hạng mục; không có floor thì bỏ phần tầng", () => {
  const [g] = groupDelayedTasks([T({ sheetType: "A-ODNN-Z1", floorLabel: null })], {
    today: "2026-07-15",
    sheetLabel: (s) => (s === "A-ODNN-Z1" ? "ODNN Zone 1" : s),
  });
  assert.equal(g.name, "Thi công ODNN Zone 1");
  assert.equal(g.floorLabel, "");
});
