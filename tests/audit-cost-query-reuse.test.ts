import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { CostRow } from "../lib/tai-chinh/cost";

type Costs = typeof import("../lib/tai-chinh/cost");
type Response = { body: Record<string, unknown>; status: number; headers: unknown };
type Route = { GET: (req: { nextUrl: URL }) => Promise<Response> };

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const js = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const evaluated = { exports: {} };
  runInNewContext(js, {
    module: evaluated,
    exports: evaluated.exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(mocks, name), `Dependency chưa được khai báo: ${name}`);
      return mocks[name];
    },
  });
  return evaluated.exports as T;
}

function fixture(options: { projectId?: number | null; auth?: boolean; allow?: boolean } = {}) {
  const projectId = options.projectId === undefined ? 42 : options.projectId;
  let scoped = false;
  const queries: { sql: string; args: unknown[] }[] = [];
  const query = async (sql: string, ...args: unknown[]) => {
    assert.equal(scoped, true, "Mọi query báo cáo phải chạy trong scope đã kiểm");
    queries.push({ sql, args });
    if (sql.includes("FROM systems")) return [{ id: 7, code: "dien", name: "Điện" }];
    if (sql.includes("fc.floor_label AS")) {
      return [{ sheetTypeId: 17, sheetType: "T", floorLabel: "F1", contractValue: 30, actual: 4 }];
    }
    if (sql.includes("FROM boq_items")) return [{ systemId: 7, budget: 100 }];
    if (sql.includes("FROM po_items")) return [{ systemId: 7, committed: 20 }];
    if (sql.includes("FROM floor_contracts")) return [{ systemId: 7, committed: 30 }];
    if (sql.includes("FROM payment_bills")) return [{ systemId: 7, actual: 10 }];
    if (sql.includes("FROM cost_settings")) return [{ warnPct: 90, overPct: 100 }];
    assert.fail(`Query ngoài fixture: ${sql}`);
  };
  const db = {
    query,
    queryOne: async (sql: string, ...args: unknown[]) => (await query(sql, ...args))[0],
    withProjectScope: async (id: number, fn: () => Promise<unknown>) => {
      assert.equal(id, projectId);
      scoped = true;
      try {
        return await fn();
      } finally {
        scoped = false;
      }
    },
  };
  // Test này đo tái sử dụng query/contract, không thay tests tiền exact hoặc PostgreSQL.
  const costs = load<Costs>("lib/tai-chinh/cost.ts", {
    "@/lib/db": db,
    "@/lib/nen/money": {
      parseMoney: (value: number) => BigInt(Math.round(value * 100)),
      moneyToNumber: (value: bigint) => Number(value) / 100,
    },
  });
  const route = load<Route>("app/api/costs/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body: unknown, options?: { status?: number; headers?: unknown }) => ({
          body,
          status: options?.status ?? 200,
          headers: options?.headers,
        }),
      },
    },
    "@/lib/db": db,
    "@/lib/tai-chinh/cost": costs,
    "@/lib/bao-mat/auth": {
      getCurrentUser: async () => (options.auth === false ? null : { role: "pm" }),
      CAN: { viewPayments: () => options.allow !== false },
    },
    "@/lib/ha-tang/projects": { getCurrentProjectId: async () => projectId },
  });
  return { costs, route, queries, db };
}

test("chi phí: nhóm hệ chỉ đọc một bộ tổng hợp, vẫn giữ scope và response", async () => {
  const { route, queries } = fixture();
  const result = await route.GET({ nextUrl: new URL("https://test.invalid/api/costs") });
  assert.equal(result.status, 200);
  assert.equal(queries.length, 6, "5 query dữ liệu hệ + 1 settings, không chạy lại 5 query");
  assert.equal(queries.filter((q) => q.sql.includes("FROM systems")).length, 1);
  const totals = result.body.totals as CostRow;
  assert.equal(totals.budget, 100);
  assert.equal(totals.committed, 50);
  assert.equal(totals.actual, 10);
  assert.equal((result.headers as Record<string, string>)["Cache-Control"], "private, no-store");
});

test("chi phí: nhóm tầng vẫn lấy tổng dự án theo hệ, không dùng tổng proxy tầng", async () => {
  const { route, queries } = fixture();
  const result = await route.GET({
    nextUrl: new URL("https://test.invalid/api/costs?groupBy=floor&includeVo=0"),
  });
  const rows = result.body.rows as CostRow[];
  const totals = result.body.totals as CostRow;
  assert.equal(rows[0].budget, 30);
  assert.equal(totals.budget, 100);
  assert.equal(totals.actual, 10);
  assert.equal(queries.length, 7);
  const budget = queries.find((q) => q.sql.includes("FROM boq_items"));
  assert.ok(budget);
  assert.deepEqual(Array.from(budget.args), [false, 42]);
});

test("chi phí: danh sách hệ rỗng đã đọc không kích hoạt truy vấn lại", async () => {
  const { costs, queries } = fixture();
  const totals = await costs.costTotals(true, 42, Object.freeze([]));
  assert.equal(queries.length, 0);
  assert.equal(totals.budget, 0);
  assert.equal(totals.committed, 0);
  assert.equal(totals.actual, 0);
});

test("chi phí: cộng rows đã đọc không sửa input và giữ cách cộng đơn vị nhỏ", async () => {
  const { costs, queries } = fixture();
  const rows = Object.freeze([
    Object.freeze({ key: "a", label: "A", budget: 0.1, committed: 1, actual: 0 }),
    Object.freeze({ key: "b", label: "B", budget: 0.2, committed: 2, actual: 0 }),
  ]);
  const totals = await costs.costTotals(false, 42, rows);
  assert.equal(totals.budget, 0.3);
  assert.equal(totals.committed, 3);
  assert.equal(rows[0].budget, 0.1);
  assert.equal(queries.length, 0);
});

for (const scenario of [
  { auth: false, status: 401 },
  { projectId: null, status: 403 },
  { projectId: 0, status: 403 },
  { allow: false, status: 403 },
]) {
  test(`chi phí: từ chối trước query (${JSON.stringify(scenario)})`, async () => {
    const { route, queries } = fixture(scenario);
    const result = await route.GET({ nextUrl: new URL("https://test.invalid/api/costs") });
    assert.equal(result.status, scenario.status);
    assert.equal(queries.length, 0);
  });
}

test("chi phí: caller cũ không truyền rows vẫn truy vấn và trả cùng tổng", async () => {
  const { costs, queries, db } = fixture();
  const totals = await db.withProjectScope(42, () => costs.costTotals(true, 42));
  assert.equal((totals as CostRow).budget, 100);
  assert.equal(queries.length, 5);
});
