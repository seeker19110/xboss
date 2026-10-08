import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 A1-FR06 — `?baseline=` của /api/dashboard/evm và /scurve phải thuộc DỰ ÁN
// ĐANG CHỌN: dự án khác/không tồn tại → 404 (không fallback), sai định dạng → 400, thiếu →
// như cũ. Gọi route handler thật với phiên ký thật.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const ctx = {} as {
  pA: number;
  pB: number;
  blA: number;
  blB: number;
  user: { id: number; passwordHash: string };
};

async function taoWbs(projectId: number, tag: string): Promise<void> {
  const { insertId, daysFromTodayISO } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp BLS ${tag}`,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
    towerId,
    `BLS${RUN}${tag}`,
    `Sheet ${tag}`,
    `bls-${RUN}-${tag}`.toLowerCase(),
  );
  const pkg = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, ?, 'Nhóm BLS', 'T1', ?, ?)`,
    sheetId,
    `PKG-${RUN}-${tag}`,
    daysFromTodayISO(-20),
    daysFromTodayISO(10),
  );
  await insertId(
    `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent, status)
     VALUES (?, ?, ?, ?, ?, 0.3, 'dang_thi_cong')`,
    pkg,
    `T-${RUN}-${tag}`,
    `BLS-TASK-${RUN}-${tag}`,
    daysFromTodayISO(-20),
    daysFromTodayISO(10),
  );
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `BLS A ${RUN}`);
  ctx.pB = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `BLS B ${RUN}`);
  await taoWbs(ctx.pA, "a");
  await taoWbs(ctx.pB, "b");
  ctx.blA = await insertId(
    `INSERT INTO baselines (name, project_id) VALUES (?, ?)`,
    `BLS blA ${RUN}`,
    ctx.pA,
  );
  ctx.blB = await insertId(
    `INSERT INTO baselines (name, project_id) VALUES (?, ?)`,
    `BLS blB ${RUN}`,
    ctx.pB,
  );
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-bls', 'pm', 1)`,
    `BLS ${RUN}`,
    `bls-${RUN}@test.local`,
  );
  ctx.user = { id, passwordHash: "hash-bls" };
});

const goi = async (route: "evm" | "scurve", qs: string) => {
  await dangNhapDuAn(ctx.user, ctx.pA);
  const { GET } =
    route === "evm"
      ? await import("@/app/api/dashboard/evm/route")
      : await import("@/app/api/dashboard/scurve/route");
  return GET(new NextRequest(`http://localhost/api/dashboard/${route}${qs}`));
};

for (const route of ["evm", "scurve"] as const) {
  test(`${route}: baseline của dự án khác → 404, không fallback`, S, async () => {
    const res = await goi(route, `?baseline=${ctx.blB}`);
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /baseline/i);
  });

  test(`${route}: baseline không tồn tại → 404`, S, async () => {
    const res = await goi(route, `?baseline=2147483647`);
    assert.equal(res.status, 404);
  });

  test(`${route}: baseline sai định dạng → 400`, S, async () => {
    for (const v of ["1e3", "abc", "-1", "0", "1.5", "99999999999", "2147483648", "%201"]) {
      const res = await goi(route, `?baseline=${v}`);
      assert.equal(res.status, 400, `baseline=${v}`);
    }
  });

  test(`${route}: baseline thuộc dự án đang chọn và thiếu tham số → 200`, S, async () => {
    assert.equal((await goi(route, `?baseline=${ctx.blA}`)).status, 200);
    assert.equal((await goi(route, "")).status, 200);
  });
}
