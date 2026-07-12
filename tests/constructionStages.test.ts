import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load (constructionStages import lib/db)
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysISO } from "@/lib/date";
import {
  computePlannedDates,
  type StageRow,
  type FloorStageFrontRow,
} from "@/lib/constructionStages";

test("addDaysISO: cộng/trừ ngày thuần, không phụ thuộc hôm nay", () => {
  assert.equal(addDaysISO("2026-07-01", 5), "2026-07-06");
  assert.equal(addDaysISO("2026-07-01", 0), "2026-07-01");
  assert.equal(addDaysISO("2026-07-10", -5), "2026-07-05");
  // Qua tháng/năm.
  assert.equal(addDaysISO("2026-01-30", 3), "2026-02-02");
  assert.equal(addDaysISO("2025-12-30", 3), "2026-01-02");
});

function mkStage(id: number, sortOrder: number, durationDays: number): StageRow {
  return { id, name: `Stage ${id}`, sortOrder, active: true, durationDays };
}
function mkFront(
  id: number,
  floorLabel: string,
  stageId: number,
  plannedReceivedAt: string | null,
): FloorStageFrontRow {
  return {
    id,
    floorLabel,
    stageId,
    handedOverAt: null,
    receivedAt: null,
    plannedReceivedAt,
    note: null,
    outgoingSupplierId: null,
    incomingSupplierId: null,
    transitionStageId: null,
    outgoingRepName: null,
    incomingRepName: null,
    updatedAt: "",
  };
}

test("computePlannedDates: nối tiếp từ ngày bắt đầu kế hoạch của công tác đầu tiên", () => {
  const stages = [mkStage(1, 1, 2), mkStage(2, 2, 3), mkStage(3, 3, 5)];
  const fronts = [
    mkFront(101, "10F", 1, "2026-07-01"),
    mkFront(102, "10F", 2, null),
    mkFront(103, "10F", 3, null),
  ];

  const planned = computePlannedDates(stages, fronts, "10F");

  assert.deepEqual(planned.get(1), {
    plannedReceivedAt: "2026-07-01",
    plannedHandedOverAt: "2026-07-03",
  });
  assert.deepEqual(planned.get(2), {
    plannedReceivedAt: "2026-07-03",
    plannedHandedOverAt: "2026-07-06",
  });
  assert.deepEqual(planned.get(3), {
    plannedReceivedAt: "2026-07-06",
    plannedHandedOverAt: "2026-07-11",
  });
});

test("computePlannedDates: chưa đặt ngày bắt đầu kế hoạch → toàn bộ chuỗi null", () => {
  const stages = [mkStage(1, 1, 2), mkStage(2, 2, 3)];
  const fronts = [mkFront(101, "10F", 1, null), mkFront(102, "10F", 2, null)];

  const planned = computePlannedDates(stages, fronts, "10F");

  assert.deepEqual(planned.get(1), { plannedReceivedAt: null, plannedHandedOverAt: null });
  assert.deepEqual(planned.get(2), { plannedReceivedAt: null, plannedHandedOverAt: null });
});

test("computePlannedDates: chỉ tính cho tầng được yêu cầu, không lẫn dữ liệu tầng khác", () => {
  const stages = [mkStage(1, 1, 2)];
  const fronts = [mkFront(101, "10F", 1, "2026-07-01"), mkFront(102, "11F", 1, "2026-08-01")];

  const planned10F = computePlannedDates(stages, fronts, "10F");
  assert.equal(planned10F.get(1)?.plannedReceivedAt, "2026-07-01");

  const planned11F = computePlannedDates(stages, fronts, "11F");
  assert.equal(planned11F.get(1)?.plannedReceivedAt, "2026-08-01");
});
