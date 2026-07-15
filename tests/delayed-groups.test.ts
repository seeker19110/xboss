import { test } from "node:test";
import assert from "node:assert/strict";
import { groupDelayedTasks, delayedGroupKey } from "@/lib/delayed-groups";

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

test("không có groupProgress: tiến độ TB tạm suy từ trung bình các công tác trễ (null coi như 0)", () => {
  const [g] = groupDelayedTasks(
    [T({ progressPercent: 0.2 }), T({ progressPercent: 0.6 }), T({ progressPercent: null })],
    { today: "2026-07-15" },
  );
  assert.ok(Math.abs(g.avgProgress - 0.8 / 3) < 1e-9);
});

test("có groupProgress: tiến độ TB lấy từ tiến độ TOÀN BỘ hạng mục, không phải trung bình công tác trễ", () => {
  // Hạng mục thực tế đã xong 70% (kể cả công tác không trễ) dù 2 công tác trễ đưa vào đây
  // đều 0% — nếu lấy avg-of-delayed sẽ cho 0%, sai lệch hoàn toàn thực trạng.
  const groupProgress = new Map([[delayedGroupKey("A-ODNN-Z1", "16"), 0.7]]);
  const [g] = groupDelayedTasks([T({ progressPercent: 0 }), T({ progressPercent: 0 })], {
    today: "2026-07-15",
    groupProgress,
  });
  assert.equal(g.avgProgress, 0.7);
});

test("groupProgress không có khoá khớp → vẫn rơi về trung bình công tác trễ (không crash)", () => {
  const groupProgress = new Map([[delayedGroupKey("KHÁC", "99"), 0.5]]);
  const [g] = groupDelayedTasks([T({ progressPercent: 0.4 })], {
    today: "2026-07-15",
    groupProgress,
  });
  assert.equal(g.avgProgress, 0.4);
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
