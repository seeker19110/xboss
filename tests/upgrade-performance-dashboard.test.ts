import "./setup";
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const calls = { budget: 0, kpi: 0, history: 0, query: 0 };
const currentKpi = [
  { sheetId: 1, sheetType: "A", sheetSlug: "a", total: 9, avgProgress: 0.8 },
  { sheetId: 2, sheetType: "B", sheetSlug: "b", total: 1, avgProgress: 0.2 },
];
const previousRows = [
  { taskId: 1, sheetId: 1, sheetType: "A", progress: 0.6 },
  { taskId: 2, sheetId: 2, sheetType: "B", progress: 0.6 },
];

mock.module("@/lib/db", {
  namedExports: {
    query: async (sql: string) => {
      calls.query += 1;
      if (sql.includes("AVG(t.progress_percent)"))
        return [{ systemId: 1, progressPct: 40, delayedCount: 2 }];
      if (sql.includes("FROM ncrs")) return [];
      if (sql.includes("FROM systems"))
        return [{ id: 1, code: "acmv", name: "Điều hòa", color: null }];
      throw new Error(`Query ngoài dự kiến: ${sql}`);
    },
    queryOne: async () => null,
    todayISO: () => "2026-10-23",
    daysFromTodayISO: () => "2026-10-16",
  },
});
mock.module("@/lib/tai-chinh/cost", {
  namedExports: {
    getCostReport: async () => {
      calls.budget += 1;
      return { rows: [{ key: "acmv", systemCode: "acmv", usageBasisPoints: 1234 }] };
    },
  },
});
mock.module("@/lib/tien-do/due-soon", {
  namedExports: {
    DUE_SOON_COND: "TRUE",
    dueSoonParams: () => [],
    loadDueSoonThresholds: async () => ({ days: 3 }),
  },
});
mock.module("@/lib/tien-do/kpi", {
  namedExports: {
    sheetProgressKpi: async () => {
      calls.kpi += 1;
      return currentKpi;
    },
  },
});
mock.module("@/lib/tien-do/report", {
  namedExports: {
    progressAtDate: async () => {
      calls.history += 1;
      return previousRows;
    },
  },
});

beforeEach(() => {
  Object.assign(calls, { budget: 0, kpi: 0, history: 0, query: 0 });
});

test("dashboard không đọc tài chính khi không dùng ngân sách", async () => {
  const { bySystemBlock } = await import("@/lib/tien-do/dashboardext");
  const rows = await bySystemBlock(12, { includeBudget: false });
  assert.equal(calls.budget, 0);
  assert.equal(calls.query, 3);
  assert.equal(rows[0].progressPct, 40);
  assert.equal(rows[0].delayedCount, 2);
});

test("caller mặc định vẫn nhận tỷ lệ ngân sách exact hiện có", async () => {
  const { bySystemBlock } = await import("@/lib/tien-do/dashboardext");
  const rows = await bySystemBlock(12);
  assert.equal(calls.budget, 1);
  assert.equal(rows[0].budgetUsedPct, 12.34);
});

test("thiếu dự án không đọc báo cáo tài chính", async () => {
  const { bySystemBlock } = await import("@/lib/tien-do/dashboardext");
  await bySystemBlock(null);
  assert.equal(calls.budget, 0);
});

test("delta tuần dùng dữ liệu cùng request, giữ đúng trọng số", async () => {
  const { weekDeltaBlock } = await import("@/lib/tien-do/dashboardext");
  const delta = await weekDeltaBlock(
    { projectId: 12, systemId: 1 },
    { kpi: currentKpi, previousRows },
  );
  assert.ok(Math.abs(delta! - 0.14) < 1e-12);
  assert.equal(calls.kpi, 0);
  assert.equal(calls.history, 0);
});

test("snapshot KPI rỗng không phát sinh truy vấn fallback", async () => {
  const { weekDeltaBlock } = await import("@/lib/tien-do/dashboardext");
  assert.equal(await weekDeltaBlock({ projectId: 12 }, { kpi: [], previousRows: [] }), null);
  assert.equal(calls.kpi, 0);
  assert.equal(calls.history, 0);
});

test("caller không có snapshot giữ kết quả và đường đọc cũ", async () => {
  const { weekDeltaBlock } = await import("@/lib/tien-do/dashboardext");
  assert.ok(Math.abs((await weekDeltaBlock({ projectId: 12 }))! - 0.14) < 1e-12);
  assert.equal(calls.kpi, 1);
  assert.equal(calls.history, 1);
});
