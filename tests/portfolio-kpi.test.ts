import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { dangNhapDuAn } from "./helpers/phien";

// QUALITY-FINAL-1 S12 (A4-FR08, A4-AC05..AC07): KPI Portfolio = tổng progress task / số task
// HỢP LỆ của các dự án actor thấy trong org hiện tại — gọi route handler thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;

async function taoOrg(): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org S12 ${uniq("o")}`);
}

async function taoDuAn(orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, `S12 ${uniq("da")}`, orgId);
}

async function taoPm(orgId = 1) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('PM S12', ?, 'h', 'pm', ?)`,
    `s12-${uniq("u")}@test.local`,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId };
}

/** Một nhóm công việc trong dự án; `wpEnd` = ngày KT nhóm để task thiếu ngày kế thừa. */
async function taoNhom(projectId: number, wpEnd: string | null = null): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const tw = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'T')`, projectId);
  const st = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'S', ?)`,
    tw,
    uniq("SH"),
    uniq("s12-"),
  );
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, end_date) VALUES (?, ?, 'N', ?)`,
    st,
    uniq("WP"),
    wpEnd,
  );
}

async function taoTask(
  wpId: number,
  progress: number | null,
  opts: { status?: string; endDate?: string | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status, end_date)
     VALUES (?, ?, 'Task S12', ?, ?, ?)`,
    wpId,
    uniq("C"),
    progress,
    opts.status ?? "dang_thi_cong",
    opts.endDate ?? null,
  );
}

async function goiKpi(qs = "") {
  const { GET } = await import("@/app/api/portfolio/kpi/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`http://localhost/api/portfolio/kpi${qs}`));
  assert.equal(res.status, 200);
  return res.json();
}

async function goiList(qs = "") {
  const { GET } = await import("@/app/api/projects/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`http://localhost/api/projects${qs}`));
  assert.equal(res.status, 200);
  return (await res.json()).projects as { id: number; progressPercent: number }[];
}

test(
  "S12 AC05: 1 task 100% + 9 task 0% → 10% (không 50%); dự án rỗng không đổi mẫu số",
  S,
  async () => {
    const pA = await taoDuAn();
    const pB = await taoDuAn();
    const pRong = await taoDuAn();
    const wpA = await taoNhom(pA);
    const wpB = await taoNhom(pB);
    await taoTask(wpA, 1, { status: "hoan_thanh" });
    for (let i = 0; i < 9; i++) await taoTask(wpB, 0);
    const pm = await taoPm();
    await dangNhapDuAn(pm, pA);
    await dangNhapDuAn(pm, pB);

    const kpi = await goiKpi();
    assert.equal(kpi.totalProjects, 2);
    assert.equal(kpi.taskCount, 10);
    assert.equal(kpi.progressAvailable, true);
    assert.ok(Math.abs(kpi.avgProgress - 0.1) < 1e-9, `avgProgress=${kpi.avgProgress}`);

    await dangNhapDuAn(pm, pRong);
    const kpi2 = await goiKpi();
    assert.equal(kpi2.totalProjects, 3);
    assert.equal(kpi2.taskCount, 10);
    assert.ok(Math.abs(kpi2.avgProgress - 0.1) < 1e-9);
  },
);

test(
  "S12 AC05: toàn bộ dự án không task → avgProgress null, progressAvailable false",
  S,
  async () => {
    const p = await taoDuAn();
    const pm = await taoPm();
    await dangNhapDuAn(pm, p);
    const kpi = await goiKpi();
    assert.equal(kpi.totalProjects, 1);
    assert.equal(kpi.avgProgress, null);
    assert.equal(kpi.progressAvailable, false);
    assert.equal(kpi.taskCount, 0);
  },
);

test(
  "S12 AC07: task nhiều dimension không nhân mẫu số; progress NULL → coverage, không sửa dữ liệu",
  S,
  async () => {
    const { run, queryOne } = await import("@/lib/db");
    const p = await taoDuAn();
    const wp = await taoNhom(p);
    const t1 = await taoTask(wp, 1, { status: "hoan_thanh" });
    await taoTask(wp, 0);
    const tNull = await taoTask(wp, null);
    for (let i = 0; i < 5; i++)
      await run(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, ?, 1)`,
        t1,
        `D${i}`,
      );
    const pm = await taoPm();
    await dangNhapDuAn(pm, p);
    const kpi = await goiKpi();
    assert.equal(kpi.taskCount, 2);
    assert.ok(Math.abs(kpi.avgProgress - 0.5) < 1e-9);
    assert.deepEqual(kpi.coverage, { validTasks: 2, excludedTasks: 1 });
    const row = await queryOne<{ p: number | null }>(
      `SELECT progress_percent AS p FROM tasks WHERE id = ?`,
      tNull,
    );
    assert.equal(row!.p, null);
  },
);

test("S12 AC07: trễ theo ngày VN qua 00:00, task thiếu ngày kế thừa ngày KT nhóm", S, async () => {
  // 2026-10-07T17:30Z = 00:30 ngày 08/10 giờ VN — ngày UTC vẫn là 07/10.
  const now = Date.parse("2026-10-07T17:30:00Z");
  const p = await taoDuAn();
  const wp = await taoNhom(p, "2026-10-07");
  await taoTask(wp, 0.5); // kế thừa 07/10 → trễ
  await taoTask(wp, 0.5, { endDate: "2026-10-08" }); // hạn hôm nay VN → chưa trễ
  await taoTask(wp, 1, { status: "hoan_thanh", endDate: "2026-10-01" }); // xong → không trễ
  await taoTask(wp, 0.99, { status: "nghiem_thu", endDate: "2026-10-01" }); // nghiệm thu → không trễ
  const pm = await taoPm();
  await dangNhapDuAn(pm, p);
  const real = Date.now;
  const m = mock.method(Date, "now", () => now);
  try {
    const kpi = await goiKpi();
    assert.equal(kpi.totalDelayed, 1);
    const list = await goiList();
    assert.equal(list.length, 1);
    assert.equal((list[0] as unknown as { delayedCount: number }).delayedCount, 1);
  } finally {
    m.mock.restore();
    assert.equal(Date.now, real);
  }
});

test(
  "S12 AC06: list và KPI cùng org/visibility — user org khác không thấy dự án org 1",
  S,
  async () => {
    const org2 = await taoOrg();
    const pOrg1 = await taoDuAn(1);
    const pOrg2 = await taoDuAn(org2);
    await taoTask(await taoNhom(pOrg1), 1, { status: "hoan_thanh" });
    await taoTask(await taoNhom(pOrg2), 0);
    const pm2 = await taoPm(org2);
    await dangNhapDuAn(pm2, pOrg2);
    // Cố tình gán thêm dự án org 1 cho user org 2 — vẫn không được thấy.
    const { run } = await import("@/lib/db");
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pm2.id, pOrg1);

    const list = await goiList();
    assert.deepEqual(
      list.map((p) => p.id),
      [pOrg2],
    );
    const kpi = await goiKpi();
    assert.equal(kpi.totalProjects, list.length);
    assert.equal(kpi.taskCount, 1);
    assert.equal(kpi.avgProgress, 0);

    // Lọc org khác org của user → cả list lẫn KPI rỗng.
    assert.deepEqual(await goiList("?org=1"), []);
    const kpiOrg1 = await goiKpi("?org=1");
    assert.equal(kpiOrg1.totalProjects, 0);
    assert.equal(kpiOrg1.avgProgress, null);
  },
);
