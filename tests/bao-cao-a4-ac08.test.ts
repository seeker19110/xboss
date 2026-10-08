import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { taoDuAnMau, xoaDuAnMau, type CoDuAn } from "../scripts/lib/bao-cao-fixture";

// QUALITY-FINAL-1 A4-AC08 (phần SQL/API bằng nhau + query count; p95 nằm ở scripts/bench-reports.ts).
//  1. Số liệu từ hàm lib == route handler thật == oracle SQL độc lập (nhiều hệ/nhóm/tầng).
//  2. Số câu SQL của báo cáo KHÔNG tăng theo số nhóm (N tầng vs 4N tầng; 1 vs 4 dự án).
// Export Excel/PDF (`/api/export/excel|pdf`) không đọc nguồn chi phí (chỉ KPI/tracking), nên
// không có "export chi phí" để đối chiếu — ghi rõ trong docs/nang-cap/AUDIT-A4-AC08-BENCHMARK.md.

const S = { skip: !HAS_TEST_DB };
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
const RUN = Date.now().toString(36);
let seq = 0;
const tag = (t: string) => `AC08${t}${RUN}${(seq += 1)}`;

const CO_NHO: CoDuAn = {
  sheets: 4,
  packagesPerSheet: 3,
  tasksPerPackage: 4,
  dimsPerTask: 2,
  floorsPerSheet: 5,
  boqItems: 30,
  poCount: 6,
};

const duAnDaTao: number[] = [];
const userDaTao: number[] = [];

async function db() {
  const lib = await import("@/lib/db");
  return { run: lib.run, query: lib.query };
}

async function duAn(t: string, co: CoDuAn): Promise<{ projectId: number; taskCount: number }> {
  const r = await taoDuAnMau(await db(), tag(t), co);
  duAnDaTao.push(r.projectId);
  return r;
}

async function taoPm(projectIds: number[]): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('PM AC08', ?, 'hash-ac08', 'pm', 1)`,
    `ac08-${tag("pm")}@test.local`,
  );
  userDaTao.push(id);
  for (const p of projectIds) {
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, id, p);
  }
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

after(async () => {
  if (!HAS_TEST_DB) return;
  const lib = await import("@/lib/db");
  for (const u of userDaTao) await lib.run(`DELETE FROM user_projects WHERE user_id = ?`, u);
  for (const p of duAnDaTao) await xoaDuAnMau(await db(), p);
  for (const u of userDaTao) await lib.run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

/** Đếm mọi câu SQL gửi tới Postgres (kể cả BEGIN/COMMIT/set_config) trong lúc chạy `fn`. */
async function demQuery<T>(fn: () => Promise<T>): Promise<{ ket: T; soQuery: number }> {
  const proto = Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const goc = proto.query;
  let n = 0;
  proto.query = function (this: unknown, ...a: unknown[]) {
    n += 1;
    return goc.apply(this, a);
  };
  try {
    const ket = await fn();
    return { ket, soQuery: n };
  } finally {
    proto.query = goc;
  }
}

type Body = Record<string, unknown>;
async function goiCosts(query: string): Promise<Body> {
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(
    new NextRequest(`http://localhost/api/costs${query}`, { method: "GET", headers: V1 }),
  );
  assert.equal(res.status, 200);
  return (await res.json()) as Body;
}

/** Bỏ trường chỉ khác giữa hai lần gọi (thời điểm snapshot, cờ định dạng của route). */
function chuanHoa(body: Body): Body {
  const copy = JSON.parse(JSON.stringify(body)) as Body;
  delete copy.moneyFormat;
  const meta = copy.metadata as Record<string, unknown> | undefined;
  if (meta) delete meta.computedAt;
  return copy;
}

test(
  "A4-AC08: báo cáo chi phí — lib == route == oracle SQL (theo hệ và theo tầng)",
  S,
  async () => {
    const { projectId } = await duAn("par", CO_NHO);
    const pm = await taoPm([projectId]);
    await dangNhapDuAn(pm, projectId);
    const { getCostReport, costReportToWire } = await import("@/lib/tai-chinh/cost");
    const { parseFixedDecimalExact } = await import("@/lib/nen/money");
    const { queryOne } = await import("@/lib/db");

    const oracle = await queryOne<{ budget: string; actual: string; floor: string }>(
      `SELECT (SELECT ROUND(COALESCE(SUM(qty_contract * unit_price), 0), 2)::text
               FROM boq_items WHERE project_id = ?) AS budget,
            (SELECT ROUND(COALESCE(SUM(amount), 0), 2)::text
               FROM payment_bills WHERE project_id = ?) AS actual,
            (SELECT ROUND(COALESCE(SUM(fc.contract_value), 0), 2)::text
               FROM floor_contracts fc JOIN sheet_types st ON st.id = fc.sheet_type_id
               JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?) AS floor`,
      projectId,
      projectId,
      projectId,
    );
    assert.ok(oracle);
    const minor = (v: unknown) => parseFixedDecimalExact(String(v), 2);

    for (const groupBy of ["system", "floor"] as const) {
      const lib = costReportToWire(
        await getCostReport({ kind: "project", projectId }, { groupBy, includeVo: true }),
        "decimal-string-v1",
      ) as unknown as Body;
      const route = await goiCosts(`?groupBy=${groupBy}`);
      assert.deepEqual(chuanHoa(route), chuanHoa(lib), `route ≠ lib (${groupBy})`);

      const rows = route.rows as { budget: string; committed: string; actual: string }[];
      const sel = route.selectedTotals as { budget: string; committed: string; actual: string };
      const proj = route.projectTotals as { budget: string; committed: string; actual: string };
      assert.ok(rows.length >= (groupBy === "floor" ? 20 : 6), "fixture phải có nhiều nhóm");
      // selectedTotals = Σ rows (bigint exact).
      for (const k of ["budget", "committed", "actual"] as const) {
        assert.equal(
          rows.reduce((a, r) => a + minor(r[k]), 0n),
          minor(sel[k]),
          `selectedTotals.${k} ≠ Σ rows (${groupBy})`,
        );
      }
      // Oracle SQL độc lập.
      assert.equal(minor(proj.budget), minor(oracle.budget), `projectTotals.budget (${groupBy})`);
      assert.equal(minor(proj.actual), minor(oracle.actual), `projectTotals.actual (${groupBy})`);
      if (groupBy === "floor") {
        assert.equal(minor(sel.budget), minor(oracle.floor), "Σ budget tầng = Σ floor_contracts");
      }
    }
  },
);

test(
  "A4-AC08: portfolio KPI — lib == route == oracle SQL (task-weighted nhiều dự án)",
  S,
  async () => {
    const a = await duAn("pfa", CO_NHO);
    const b = await duAn("pfb", { ...CO_NHO, tasksPerPackage: 7, sheets: 3 });
    const pm = await taoPm([a.projectId, b.projectId]);
    await dangNhapDuAn(pm, a.projectId);
    const { portfolioKpi } = await import("@/lib/ha-tang/projects");
    const { GET } = await import("@/app/api/portfolio/kpi/route");
    const { queryOne } = await import("@/lib/db");

    const lib = await portfolioKpi({ id: pm.id, role: "pm", orgId: 1 });
    const res = await GET(new NextRequest("http://localhost/api/portfolio/kpi"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), lib);

    const o = await queryOne<{ n: number; avg: number; tre: number }>(
      `SELECT COUNT(*) AS n, AVG(t.progress_percent) AS avg,
            COUNT(*) FILTER (WHERE COALESCE(t.end_date, wp.end_date) < CURRENT_DATE
                               AND t.progress_percent < 1
                               AND t.status NOT IN ('hoan_thanh','nghiem_thu')) AS tre
       FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id IN (?, ?)`,
      a.projectId,
      b.projectId,
    );
    assert.ok(o);
    assert.equal(lib.totalProjects, 2);
    assert.equal(lib.taskCount, a.taskCount + b.taskCount);
    assert.equal(lib.taskCount, Number(o.n));
    assert.ok(Math.abs((lib.avgProgress ?? NaN) - Number(o.avg)) < 1e-9, "avgProgress ≠ oracle");
    assert.equal(lib.totalDelayed, Number(o.tre));
  },
);

test("A4-AC08: số query getCostReport không đổi khi số nhóm tăng 4 lần", S, async () => {
  const nho = await duAn("qcn", { ...CO_NHO, floorsPerSheet: 5 });
  const lon = await duAn("qcl", { ...CO_NHO, floorsPerSheet: 20, boqItems: 120, poCount: 24 });
  const { getCostReport } = await import("@/lib/tai-chinh/cost");
  const chay = (projectId: number, groupBy: "system" | "floor") =>
    demQuery(() => getCostReport({ kind: "project", projectId }, { groupBy, includeVo: true }));

  await chay(nho.projectId, "floor"); // làm nóng: kiểm schema đã cache, pool đã mở
  for (const groupBy of ["system", "floor"] as const) {
    const n = await chay(nho.projectId, groupBy);
    const n4 = await chay(lon.projectId, groupBy);
    assert.ok(n.ket.rows.length > 0 && n4.ket.rows.length > 0);
    if (groupBy === "floor") {
      assert.ok(n4.ket.rows.length >= 4 * 5 * CO_NHO.sheets, "4N nhóm tầng thật sự");
      assert.ok(n4.ket.rows.length > n.ket.rows.length * 3);
    }
    assert.equal(n4.soQuery, n.soQuery, `số query tăng theo số nhóm (${groupBy})`);
    assert.ok(n.soQuery > 0 && n.soQuery <= 12, `số query bất thường: ${n.soQuery}`);
  }
});

test("A4-AC08: số query portfolioKpi không đổi khi số dự án tăng 4 lần", S, async () => {
  const nho = [await duAn("pq1", CO_NHO)];
  const lon = [
    await duAn("pq2", CO_NHO),
    await duAn("pq3", CO_NHO),
    await duAn("pq4", CO_NHO),
    await duAn("pq5", CO_NHO),
  ];
  const pmNho = await taoPm(nho.map((x) => x.projectId));
  const pmLon = await taoPm(lon.map((x) => x.projectId));
  const { portfolioKpi } = await import("@/lib/ha-tang/projects");
  const chay = (u: { id: number }) =>
    demQuery(() => portfolioKpi({ id: u.id, role: "pm", orgId: 1 }));

  await chay(pmNho);
  const n = await chay(pmNho);
  const n4 = await chay(pmLon);
  assert.equal(n.ket.totalProjects, 1);
  assert.equal(n4.ket.totalProjects, 4);
  assert.equal(n4.soQuery, n.soQuery, "số query tăng theo số dự án");
});
