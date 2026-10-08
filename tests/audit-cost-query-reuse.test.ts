import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as money from "../lib/nen/money";

type Costs = typeof import("../lib/tai-chinh/cost");
type Response = { body: Record<string, unknown>; status: number; headers: unknown };
type Route = { GET: (req: { nextUrl: URL; headers: Headers }) => Promise<Response> };

// Object tạo trong VM context khác prototype → so sau khi về JSON thuần.
const plain = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

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
  let depth = 0;
  const queries: { sql: string; args: unknown[] }[] = [];
  // S11: toàn bộ báo cáo là MỘT câu SQL trả 1 dòng (rows hệ/tầng + settings + coverage dạng JSON,
  // tiền là chuỗi). Fixture trả đúng hình dạng đó.
  const so0 = { boq: 0, purchaseOrders: 0, floorContracts: 0, payments: 0 };
  const query = async (sql: string, ...args: unknown[]) => {
    assert.ok(depth > 0, "Mọi query báo cáo phải chạy trong scope đã kiểm");
    queries.push({ sql, args });
    if (sql.includes("WITH prm AS")) {
      return [
        {
          systemRows: [
            {
              systemId: 7,
              code: "dien",
              name: "Điện",
              budget: "100.00",
              committed: "95.00",
              actual: "10.00",
            },
            {
              systemId: 8,
              code: "nuoc",
              name: "Nước",
              budget: "0.00",
              committed: "5.00",
              actual: "0.00",
            },
          ],
          systemUnassigned: { budget: "1.00", committed: "0.00", actual: "2.00" },
          floorRows: [
            {
              sheetTypeId: 17,
              sheetCode: "T",
              towerName: "A",
              floorLabel: "F1",
              budget: "30.00",
              actual: "4.00",
            },
          ],
          floorUnassignedActual: "8.00",
          settings: { warnPct: "90.00", overPct: "100.00" },
          coverage: {
            conflicts: so0,
            missingDirectScope: { payments: 0 },
            unassigned: so0,
            unassignedFloorPayments: 1,
            poQuantityNonFinite: 0,
            floorContractsWithoutValue: 0,
          },
          computedAt: "2026-10-08T00:00:00.000Z",
        },
      ];
    }
    assert.fail(`Query ngoài fixture: ${sql}`);
  };
  const db = {
    query,
    queryOne: async (sql: string, ...args: unknown[]) => (await query(sql, ...args))[0],
    run: async () => assert.fail("Báo cáo không được ghi"),
    withProjectScope: async (id: number, fn: () => Promise<unknown>) => {
      assert.equal(id, projectId);
      depth++;
      try {
        return await fn();
      } finally {
        depth--;
      }
    },
  };
  // Test này đo tái sử dụng query/contract, không thay tests tiền exact hoặc PostgreSQL.
  const costs = load<Costs>("lib/tai-chinh/cost.ts", {
    "@/lib/db": db,
    "@/lib/nen/money": money,
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
    "@/lib/nen/money": money,
  });
  return { costs, route, queries, db };
}

test("chi phí: nhóm hệ đọc đúng 1 câu SQL, giữ scope, totals = projectTotals gồm unassigned", async () => {
  const { route, queries } = fixture();
  const result = await route.GET({
    nextUrl: new URL("https://test.invalid/api/costs"),
    headers: new Headers(),
  });
  assert.equal(result.status, 200);
  assert.equal(queries.length, 1, "rows + totals + settings + coverage trong 1 câu (A4-FR06)");
  assert.deepEqual(Array.from(queries[0].args), [42, true]);
  const totals = result.body.totals as Record<string, unknown>;
  assert.deepEqual(plain(totals), { budget: 101, committed: 100, actual: 12 });
  assert.deepEqual(plain(result.body.selectedTotals), plain(totals));
  const rows = result.body.rows as Record<string, unknown>[];
  assert.equal(rows.length, 3);
  assert.equal(rows[2].unassigned, true);
  assert.equal(rows[2].systemId, null);
  // Ngân sách 0 + cam kết dương (nước) không cảnh báo; điện 95% ≥ 90% cảnh báo, chưa vượt.
  assert.deepEqual(plain(result.body.alerts), [
    { key: "dien", label: "Điện", pct: 95, over: false },
  ]);
  assert.equal((result.headers as Record<string, string>)["Cache-Control"], "private, no-store");
});

test("chi phí: nhóm tầng — selectedTotals theo rows proxy, totals/projectTotals giữ tổng dự án", async () => {
  const { route, queries } = fixture();
  const result = await route.GET({
    nextUrl: new URL("https://test.invalid/api/costs?groupBy=floor&includeVo=0"),
    headers: new Headers(),
  });
  const rows = result.body.rows as Record<string, unknown>[];
  assert.equal(rows[0].key, "17:F1");
  assert.equal(rows[0].budget, 30);
  assert.equal(rows[1].unassigned, true);
  assert.deepEqual(plain(result.body.selectedTotals), { budget: 30, committed: 30, actual: 12 });
  assert.deepEqual(plain(result.body.totals), { budget: 101, committed: 100, actual: 12 });
  assert.equal(queries.length, 1);
  assert.deepEqual(Array.from(queries[0].args), [42, false]);
  const metadata = result.body.metadata as Record<string, unknown>;
  assert.equal(metadata.budgetBasis, "floor-contract-proxy");
  assert.equal(metadata.moneyFormat, "legacy-number");
});

test("chi phí: sumCostAmounts cộng bigint, không sửa input", async () => {
  const { costs, queries } = fixture();
  const rong = costs.sumCostAmounts([]);
  assert.equal(rong.budget + rong.committed + rong.actual, 0n);
  const rows = Object.freeze([
    Object.freeze({ budget: 10n, committed: 100n, actual: 0n }),
    Object.freeze({ budget: 20n, committed: 200n, actual: 0n }),
  ]);
  const totals = costs.sumCostAmounts(rows);
  assert.equal(totals.budget, 30n);
  assert.equal(totals.committed, 300n);
  assert.equal(rows[0].budget, 10n);
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
    const result = await route.GET({
      nextUrl: new URL("https://test.invalid/api/costs"),
      headers: new Headers(),
    });
    assert.equal(result.status, scenario.status);
    assert.equal(queries.length, 0);
  });
}

test("chi phí: getCostReport từ chối projectId không hợp lệ trước mọi query", async () => {
  const { costs, queries } = fixture();
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(costs.getCostReport(bad, { groupBy: "system", includeVo: true }));
  }
  assert.equal(queries.length, 0);
});
