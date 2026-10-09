import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as money from "../lib/nen/money";
import * as ngay from "../lib/nen/date";

// Hợp đồng truy vấn của báo cáo chi phí chuẩn (S11, A4-FR06/AC08): một snapshot REPEATABLE READ
// READ ONLY, số query cố định không theo số nhóm/dòng (không N+1), mọi query trong scope đã kiểm.
// Dùng DB giả — tiền exact và PostgreSQL thật kiểm ở tests/cost-report.test.ts.

type Costs = typeof import("../lib/tai-chinh/cost");
type Response = { body: Record<string, unknown>; status: number; headers: unknown };
type Route = { GET: (req: { nextUrl: URL; headers: Headers }) => Promise<Response> };

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

function fixture(
  options: { projectId?: number | null; auth?: boolean; allow?: boolean; systems?: number } = {},
) {
  const projectId = options.projectId === undefined ? 42 : options.projectId;
  const systemCount = options.systems ?? 1;
  let scoped = false;
  const scopeCalls: unknown[] = [];
  const queries: { sql: string; args: unknown[] }[] = [];
  const systems = Array.from({ length: systemCount }, (_, i) => ({
    id: i + 1,
    code: `he${i + 1}`,
    name: `Hệ ${i + 1}`,
  }));
  const query = async (sql: string, ...args: unknown[]) => {
    assert.equal(scoped, true, "Mọi query báo cáo phải chạy trong scope đã kiểm");
    queries.push({ sql, args });
    if (sql.includes("FROM systems")) return systems;
    if (sql.includes("JOIN org_cost_settings"))
      return [{ computedAt: new Date(0), warnPct: "90.00", overPct: "100.00" }];
    if (sql.includes("boq_items bi"))
      return systems.map((s) => ({ systemId: s.id, state: "ok", n: 3, amount: "100.00" }));
    if (sql.includes("po_items poi"))
      return systems.map((s) => ({ systemId: s.id, state: "ok", n: 2, amount: "20.00" }));
    if (sql.includes("floor_contracts fc"))
      return [
        {
          sheetTypeId: 17,
          sheetCode: "T",
          floorLabel: "F1",
          systemId: 1,
          state: "ok",
          amount: "30.00",
        },
      ];
    if (sql.includes("payment_bills pb"))
      return [
        {
          sheetTypeId: 17,
          sheetCode: "T",
          floorLabel: "F1",
          systemId: 1,
          state: "ok",
          n: 2,
          amount: "10.00",
          unpaid: "7.00",
        },
      ];
    assert.fail(`Query ngoài fixture: ${sql}`);
  };
  const db = {
    query,
    queryOne: async (sql: string, ...args: unknown[]) => (await query(sql, ...args))[0],
    run: async () => assert.fail("Báo cáo không được ghi"),
    withProjectScope: async (id: number, fn: () => Promise<unknown>, opts?: unknown) => {
      assert.equal(id, projectId);
      scopeCalls.push(opts);
      scoped = true;
      try {
        return await fn();
      } finally {
        scoped = false;
      }
    },
  };
  // M129: cost.ts dùng chung điều kiện phạm vi phiếu (PB_TONG_HOP_*) với finance — nạp module thật
  // qua cùng DB giả để hợp đồng "số query cố định" vẫn đo trên đúng SQL production.
  const phieu = load("lib/tai-chinh/payment-bills.ts", { "@/lib/db": db, "@/lib/nen/date": ngay });
  const costs = load<Costs>("lib/tai-chinh/cost.ts", {
    "@/lib/db": db,
    "@/lib/nen/money": money,
    "@/lib/tai-chinh/payment-bills": phieu,
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
    "@/lib/tai-chinh/cost": costs,
    "@/lib/nen/money": money,
    "@/lib/bao-mat/auth": {
      getCurrentUser: async () => (options.auth === false ? null : { role: "pm" }),
      CAN: { viewPayments: () => options.allow !== false },
    },
    "@/lib/ha-tang/projects": { getCurrentProjectId: async () => projectId },
  });
  return { costs, route, queries, scopeCalls };
}

const get = (route: Route, qs = "", headers: Record<string, string> = {}) =>
  route.GET({
    nextUrl: new URL(`https://test.invalid/api/costs${qs}`),
    headers: new Headers(headers),
  });

test("chi phí: nhóm hệ = 6 query trong MỘT snapshot REPEATABLE READ READ ONLY", async () => {
  const { route, queries, scopeCalls } = fixture();
  const result = await get(route);
  assert.equal(result.status, 200);
  assert.equal(queries.length, 6, "ngưỡng + hệ + 4 nguồn, không chạy lại bộ tổng");
  // Object từ vm context khác realm → so theo giá trị JSON.
  assert.equal(
    JSON.stringify(scopeCalls),
    JSON.stringify([{ readOnly: true, isolation: "repeatable_read" }]),
  );
  assert.match(
    queries[0].sql,
    /org_cost_settings/,
    "câu đầu đọc ngưỡng (theo org) + thời điểm snapshot",
  );
  const j = (v: unknown) => JSON.stringify(v);
  const totals = result.body.totals;
  // M129: phiếu đã duyệt chưa chi là cột riêng, không cộng vào actual/committed.
  assert.equal(j(totals), j({ budget: 100, committed: 50, actual: 10, approvedUnpaid: 7 }));
  assert.equal(j(result.body.projectTotals), j(totals));
  assert.equal(j(result.body.selectedTotals), j(totals));
  const headers = result.headers as Record<string, string>;
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers.Vary, "X-XBoss-Money-Format");
});

test("chi phí: số query không tăng theo số hệ/dòng (không N+1)", async () => {
  const one = fixture({ systems: 1 });
  const many = fixture({ systems: 40 });
  await get(one.route);
  const result = await get(many.route);
  assert.equal(many.queries.length, one.queries.length);
  assert.equal((result.body.rows as unknown[]).length, 40);
});

test("chi phí: nhóm tầng = 5 query, tổng dự án vẫn theo BOQ, không dùng proxy tầng", async () => {
  const { route, queries } = fixture();
  const result = await get(route, "?groupBy=floor&includeVo=0", {
    "X-XBoss-Money-Format": "decimal-string-v1",
  });
  const rows = result.body.rows as { budget: string; actual: string }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].budget, "30.00");
  assert.equal((result.body.selectedTotals as Record<string, string>).budget, "30.00");
  assert.equal((result.body.projectTotals as Record<string, string>).budget, "100.00");
  assert.equal((result.body.totals as Record<string, string>).budget, "100.00");
  assert.equal(result.body.moneyFormat, "decimal-string-v1");
  assert.equal(queries.length, 5);
  const budget = queries.find((q) => q.sql.includes("boq_items bi"));
  assert.ok(budget);
  assert.ok(Array.from(budget.args).includes(false), "includeVo=0 đi vào SQL dạng tham số");
});

for (const scenario of [
  { auth: false, status: 401 },
  { projectId: null, status: 403 },
  { projectId: 0, status: 403 },
  { allow: false, status: 403 },
]) {
  test(`chi phí: từ chối trước query (${JSON.stringify(scenario)})`, async () => {
    const { route, queries } = fixture(scenario);
    const result = await get(route);
    assert.equal(result.status, scenario.status);
    assert.equal(queries.length, 0);
  });
}

test("chi phí: costSummary legacy thiếu dự án trả rỗng, không mở query toàn hệ", async () => {
  const { costs, queries } = fixture();
  assert.equal((await costs.costSummary("system", true)).length, 0);
  assert.equal(await costs.systemBudget(1, true), null);
  assert.equal(queries.length, 0);
});
