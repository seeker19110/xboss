import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool, type PoolClient } from "pg";
import { NextRequest } from "next/server";
import { dangXuat, datCookie } from "./helpers/phien";
import { goi, jreq } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S16 — "khoá cửa" RLS nhóm bảng theo tổ chức/dự án (migration 0165,
// docs/nang-cap/AUDIT-S16-RLS-STRICT.md, AUDIT-S15 mục 6(b)).
// Chạy bằng role ứng dụng `xboss_app` (NOBYPASSRLS) như production; role owner (superuser của
// TEST_DATABASE_URL) CHỈ dùng chuẩn bị fixture — superuser bỏ qua RLS nên không làm bằng chứng.
//   A1-AC06: GUC rỗng (thiếu ngữ cảnh) → 0 dòng trên TỪNG bảng dù có dữ liệu 2 tổ chức/dự án,
//            và không ghi được; GUC = org/dự án A → chỉ thấy A; '*' (server đặt) thấy cả hai.
//   A1-AC04: withOrgScope lồng đổi tổ chức bị từ chối; GUC org không rò sang câu lệnh sau.
//   A1-AC06 (H): đăng nhập, /api/auth/me, route nghiệp vụ và cron CHẠY TRỌN bằng xboss_app sau
//            khi siết vẫn 200 và chỉ thấy dữ liệu đúng tổ chức.

const S = { skip: !HAS_TEST_DB };

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

/** 15 bảng theo tổ chức (policy p_<bảng>_org) + 3 bảng theo dự án (p_<bảng>_project). */
const BANG_TO_CHUC = [
  "users",
  "projects",
  "suppliers",
  "code_lists",
  "role_permissions",
  "custom_field_defs",
  "feature_flags",
  "alert_rules",
  "approval_flows",
  "api_keys",
  "webhooks",
  "integrations",
  "saved_reports",
  "boq_codes",
  "org_cost_settings",
] as const;
const BANG_DU_AN = ["baselines", "floor_stage_fronts", "construction_stages"] as const;

const sfx = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
type Ben = { org: number; proj: number; user: number };
let A: Ben;
let B: Ben;
/** bảng → [id dòng của A, id dòng của B] (org_cost_settings: khoá là org_id). */
const dong = new Map<string, [number, number]>();
let appPool: Pool;

async function taoBen(nhan: string): Promise<Ben> {
  const { insertId } = await import("@/lib/db");
  const org = await insertId(
    `INSERT INTO organizations (name, slug) VALUES (?, ?)`,
    `S16 ${nhan}`,
    `s16-${nhan}-${sfx}`,
  );
  const proj = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `S16 ${nhan} ${sfx}`,
    org,
  );
  const user = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'x', 'pm', ?)`,
    `S16 ${nhan}`,
    `s16-${nhan}-${sfx}@test.local`,
    org,
  );
  return { org, proj, user };
}

/** Chèn 1 dòng/bảng cho một bên (bằng owner) — trả id dòng (khoá để lọc trong SELECT). */
async function seedBen(b: Ben, nhan: string): Promise<Record<string, number>> {
  const { insertId, run } = await import("@/lib/db");
  const k = `${nhan}-${sfx}`;
  const id: Record<string, number> = { users: b.user, projects: b.proj };
  id.suppliers = await insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, k, b.org);
  id.code_lists = await insertId(
    `INSERT INTO code_lists (domain, code, label, org_id) VALUES ('s16_test', ?, ?, ?)`,
    k,
    k,
    b.org,
  );
  id.role_permissions = await insertId(
    `INSERT INTO role_permissions (role, perm_key, allowed, org_id) VALUES ('viewer', ?, TRUE, ?)`,
    `s16_${k}`,
    b.org,
  );
  id.custom_field_defs = await insertId(
    `INSERT INTO custom_field_defs (entity_type, key, label, type, org_id)
     VALUES ('task', ?, ?, 'text', ?)`,
    `s16_${k}`,
    k,
    b.org,
  );
  // feature_flags khoá (module_key, project_id) — không có cột id; lấy project_id làm khoá lọc.
  await run(
    `INSERT INTO feature_flags (module_key, project_id, enabled, org_id) VALUES ('s16', ?, TRUE, ?)`,
    b.proj,
    b.org,
  );
  id.feature_flags = b.proj;
  id.alert_rules = await insertId(
    `INSERT INTO alert_rules (metric, operator, threshold, org_id) VALUES ('s16', '>', 1, ?)`,
    b.org,
  );
  id.approval_flows = await insertId(
    `INSERT INTO approval_flows (entity_type, name, org_id, project_id) VALUES ('s16', ?, ?, ?)`,
    k,
    b.org,
    b.proj,
  );
  id.api_keys = await insertId(
    `INSERT INTO api_keys (name, key_hash, created_by, org_id) VALUES (?, ?, ?, ?)`,
    k,
    `s16-hash-${k}`,
    b.user,
    b.org,
  );
  id.webhooks = await insertId(
    `INSERT INTO webhooks (url, secret, events, created_by, org_id)
     VALUES ('https://example.invalid/s16', 's', ARRAY['s16'], ?, ?)`,
    b.user,
    b.org,
  );
  id.integrations = await insertId(
    `INSERT INTO integrations (provider, project_id, org_id) VALUES (?, ?, ?)`,
    `s16-${k}`,
    b.proj,
    b.org,
  );
  id.saved_reports = await insertId(
    `INSERT INTO saved_reports (owner_id, name, source, org_id) VALUES (?, ?, 'tasks', ?)`,
    b.user,
    k,
    b.org,
  );
  // boq_codes không có cột id — khoá (table_name, row_id); row_id = id user của bên (khác nhau).
  await run(
    `INSERT INTO boq_codes (code, table_name, row_id, org_id) VALUES (?, 's16', ?, ?)`,
    `S16-${k}`,
    b.user,
    b.org,
  );
  id.boq_codes = b.user;
  await run(
    `INSERT INTO org_cost_settings (org_id, warn_pct, over_pct) VALUES (?, 80, 95)
     ON CONFLICT (org_id) DO NOTHING`,
    b.org,
  );
  id.org_cost_settings = b.org;
  id.baselines = await insertId(
    `INSERT INTO baselines (name, project_id) VALUES (?, ?)`,
    k,
    b.proj,
  );
  id.construction_stages = await insertId(
    `INSERT INTO construction_stages (name, project_id) VALUES (?, ?)`,
    k,
    b.proj,
  );
  id.floor_stage_fronts = await insertId(
    `INSERT INTO floor_stage_fronts (floor_label, stage_id, project_id) VALUES ('T1', ?, ?)`,
    id.construction_stages,
    b.proj,
  );
  return id;
}

/** Cột khoá dùng lọc dòng fixture trên từng bảng. */
const COT_KHOA: Record<string, string> = {
  org_cost_settings: "org_id",
  feature_flags: "project_id",
  boq_codes: "row_id",
};
const cotKhoa = (bang: string): string => COT_KHOA[bang] ?? "id";

/** Chạy fn trên 1 connection xboss_app trong transaction có (hoặc không) GUC. */
async function voiGuc<T>(
  guc: { org?: string; project?: string },
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query("BEGIN");
    if (guc.org !== undefined)
      await c.query(`SELECT set_config('app.org_id', $1, true)`, [guc.org]);
    if (guc.project !== undefined)
      await c.query(`SELECT set_config('app.project_id', $1, true)`, [guc.project]);
    const r = await fn(c);
    await c.query("ROLLBACK");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function thay(c: PoolClient, bang: string): Promise<number[]> {
  const [a, b] = dong.get(bang)!;
  const col = cotKhoa(bang);
  const r = await c.query<{ k: number }>(
    `SELECT ${col} AS k FROM ${bang} WHERE ${col} = ANY($1::int[]) ORDER BY 1`,
    [[a, b]],
  );
  return r.rows.map((x) => Number(x.k));
}

before(async () => {
  if (!HAS_TEST_DB) return;
  A = await taoBen("a");
  B = await taoBen("b");
  const idA = await seedBen(A, "a");
  const idB = await seedBen(B, "b");
  for (const bang of [...BANG_TO_CHUC, ...BANG_DU_AN]) dong.set(bang, [idA[bang], idB[bang]]);
  appPool = new Pool({ connectionString: appConnString(), max: 3, allowExitOnIdle: true });
});

after(async () => {
  if (!HAS_TEST_DB) return;
  await appPool?.end();
  const { run } = await import("@/lib/db");
  for (const b of [A, B]) {
    if (!b) continue;
    await run(`DELETE FROM floor_stage_fronts WHERE project_id = ?`, b.proj);
    await run(`DELETE FROM construction_stages WHERE project_id = ?`, b.proj);
    await run(`DELETE FROM baselines WHERE project_id = ?`, b.proj);
    for (const bang of [
      "suppliers",
      "code_lists",
      "role_permissions",
      "custom_field_defs",
      "feature_flags",
      "alert_rules",
      "approval_flows",
      "api_keys",
      "webhooks",
      "integrations",
      "saved_reports",
      "boq_codes",
      "org_cost_settings",
    ])
      await run(`DELETE FROM ${bang} WHERE org_id = ?`, b.org);
    await run(`DELETE FROM users WHERE org_id = ?`, b.org);
    await run(`DELETE FROM projects WHERE org_id = ?`, b.org);
    await run(`DELETE FROM organizations WHERE id = ?`, b.org);
  }
});

test(
  "A1-AC06: fixture có dữ liệu 2 bên trên từng bảng (owner thấy đủ — đối chứng)",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    for (const bang of [...BANG_TO_CHUC, ...BANG_DU_AN]) {
      const [a, b] = dong.get(bang)!;
      const col = cotKhoa(bang);
      const r = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM ${bang} WHERE ${col} = ANY(?::int[])`,
        [a, b],
      );
      assert.equal(r[0].n, 2, `${bang}: owner phải thấy dòng của cả 2 bên`);
    }
  },
);

test("A1-AC06: GUC rỗng → xboss_app thấy 0 dòng trên TỪNG bảng org/dự án", S, async () => {
  const lo: string[] = [];
  // (a) không đặt GUC (NULL), ngoài transaction; (b) GUC '' trong transaction.
  for (const bang of [...BANG_TO_CHUC, ...BANG_DU_AN]) {
    const [a, b] = dong.get(bang)!;
    const col = cotKhoa(bang);
    const r = await appPool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${bang} WHERE ${col} = ANY($1::int[])`,
      [[a, b]],
    );
    if (r.rows[0].n !== 0) lo.push(`${bang} (GUC NULL thấy ${r.rows[0].n})`);
    const rong = await voiGuc({ org: "", project: "" }, (c) => thay(c, bang));
    if (rong.length !== 0) lo.push(`${bang} (GUC '' thấy ${rong.length})`);
  }
  assert.deepEqual(lo, [], `bảng còn cho qua khi thiếu ngữ cảnh: ${lo.join(", ")}`);
});

test("A1-AC06: GUC rỗng → INSERT bị WITH CHECK chặn (suppliers, baselines)", S, async () => {
  await assert.rejects(
    voiGuc({ org: "" }, (c) =>
      c.query(`INSERT INTO suppliers (name, org_id) VALUES ('S16 lọt', $1)`, [A.org]),
    ),
    /row-level security/i,
  );
  await assert.rejects(
    voiGuc({ project: "" }, (c) =>
      c.query(`INSERT INTO baselines (name, project_id) VALUES ('S16 lọt', $1)`, [A.proj]),
    ),
    /row-level security/i,
  );
});

test("A1-AC01: GUC = org/dự án A → chỉ thấy dòng của A; '*' thấy cả hai", S, async () => {
  for (const bang of BANG_TO_CHUC) {
    const [a, b] = dong.get(bang)!;
    assert.deepEqual(
      await voiGuc({ org: String(A.org) }, (c) => thay(c, bang)),
      [a],
      `${bang}: org A chỉ thấy A`,
    );
    assert.deepEqual(
      (await voiGuc({ org: "*" }, (c) => thay(c, bang))).sort((x, y) => x - y),
      [a, b].sort((x, y) => x - y),
      `${bang}: '*' thấy cả hai`,
    );
  }
  for (const bang of BANG_DU_AN) {
    const [a, b] = dong.get(bang)!;
    assert.deepEqual(
      await voiGuc({ project: String(A.proj) }, (c) => thay(c, bang)),
      [a],
      `${bang}: dự án A chỉ thấy A`,
    );
    assert.deepEqual(
      (await voiGuc({ project: "*" }, (c) => thay(c, bang))).sort((x, y) => x - y),
      [a, b].sort((x, y) => x - y),
      `${bang}: '*' thấy cả hai`,
    );
  }
});

test(
  "A1-AC06: construction_stages dùng chung (project_id NULL) vẫn đọc được khi thiếu GUC",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const id = await insertId(
      `INSERT INTO construction_stages (name) VALUES (?)`,
      `S16 chung ${sfx}`,
    );
    try {
      const r = await appPool.query(`SELECT id FROM construction_stages WHERE id = $1`, [id]);
      assert.equal(r.rowCount, 1, "danh mục dùng chung (D1 M123) không phải nhánh thiếu ngữ cảnh");
    } finally {
      await run(`DELETE FROM construction_stages WHERE id = ?`, id);
    }
  },
);

test(
  'A1-AC06: không policy nào còn nhánh "GUC rỗng → cho qua" (trừ ghi bộ CAD toàn cục)',
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const rows = await query<{ t: string; p: string; qual: string | null; chk: string | null }>(
      `SELECT tablename AS t, policyname AS p, qual, with_check AS chk FROM pg_policies
      WHERE schemaname = 'public'`,
    );
    const choQua = /NULLIF\(current_setting\('app\.\w+'::text, true\), ''::text\) IS NULL/;
    const lo = rows
      .filter(
        (r) =>
          choQua.test(r.qual ?? "") ||
          // cad_block_libs (0145): WITH CHECK chỉ cho GHI dòng bộ TOÀN CỤC (project_id NULL) khi
          // phiên ở phạm vi toàn cục — không phải nhánh đọc; USING của bảng này không có nhánh rỗng.
          (r.t !== "cad_block_libs" && choQua.test(r.chk ?? "")),
      )
      .map((r) => `${r.t}.${r.p}`);
    assert.deepEqual(lo, [], `policy còn nhánh cho qua khi thiếu ngữ cảnh: ${lo.join(", ")}`);
  },
);

type G = { __xbossPool?: Pool };
const g = globalThis as unknown as G;

/** Chạy fn với pool của lib/db là pool xboss_app (như production), trả lại pool owner sau đó. */
async function voiPoolApp<T>(fn: () => Promise<T>): Promise<T> {
  const { getPool } = await import("@/lib/db");
  const owner = getPool();
  g.__xbossPool = appPool;
  try {
    return await fn();
  } finally {
    g.__xbossPool = owner;
  }
}

test(
  "A1-AC04: lib/db — câu lệnh ngoài transaction mang org của ngữ cảnh; withOrgScope lồng đổi org bị từ chối",
  S,
  async () => {
    const { query, withOrgScope } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const [supA, supB] = dong.get("suppliers")!;
    const sql = `SELECT id FROM suppliers WHERE id = ANY(?::int[]) ORDER BY id`;
    const ids = (rows: { id: number }[]) => rows.map((r) => Number(r.id)).sort((x, y) => x - y);
    await voiPoolApp(async () => {
      // Ngữ cảnh request đã xác thực (orgId) → tự gắn app.org_id cho câu lệnh ngoài transaction.
      assert.deepEqual(
        ids(
          await runWithRequestContext({ orgId: A.org }, () =>
            query<{ id: number }>(sql, [supA, supB]),
          ),
        ),
        [supA],
      );
      // Không ngữ cảnh → GUC rỗng → 0 dòng (GUC org của câu trước không rò qua connection pool).
      assert.deepEqual(
        ids(await runWithRequestContext({}, () => query<{ id: number }>(sql, [supA, supB]))),
        [],
      );
      assert.deepEqual(
        ids(await withOrgScope(B.org, () => query<{ id: number }>(sql, [supA, supB]))),
        [supB],
      );
      assert.deepEqual(
        ids(await withOrgScope("*", () => query<{ id: number }>(sql, [supA, supB]))),
        [supA, supB].sort((x, y) => x - y),
      );
      // Lồng: cùng org chạy; đổi org / nâng lên '*' → throw (transaction ngoài rollback).
      assert.deepEqual(
        ids(
          await withOrgScope(A.org, () =>
            withOrgScope(A.org, () => query<{ id: number }>(sql, [supA, supB])),
          ),
        ),
        [supA],
      );
      await assert.rejects(
        withOrgScope(A.org, () => withOrgScope("*", () => query(sql, [supA, supB]))),
        /đổi phạm vi tổ chức/,
      );
      await assert.rejects(
        runWithRequestContext({ orgId: A.org }, () =>
          withOrgScope(A.org, () => withOrgScope(B.org, () => query(sql, [supA, supB]))),
        ),
        /đổi phạm vi tổ chức/,
      );
      await assert.rejects(
        withOrgScope(0, async () => 1),
        /tổ chức không hợp lệ/,
      );
    });
  },
);

test(
  "A1-AC06 (H): đăng nhập + /api/auth/me + GET /api/suppliers + cron chạy bằng xboss_app sau siết",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { hashPassword } = await import("@/lib/bao-mat/auth");
    const { POST: login } = await import("@/app/api/auth/login/route");
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { GET: suppliers } = await import("@/app/api/suppliers/route");
    const { GET: dailyReport } = await import("@/app/api/cron/daily-report/route");
    const matKhau = `S16-mat-khau-${sfx}`;
    const email = `s16-login-${sfx}@test.local`;
    const uid = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('S16 login', ?, ?, 'pm', ?)`,
      email,
      hashPassword(matKhau),
      A.org,
    );
    const cronCu = process.env.CRON_SECRET;
    process.env.CRON_SECRET = `s16-cron-secret-${sfx}-dai-du-32-ky-tu`;
    try {
      await voiPoolApp(async () => {
        dangXuat();
        // Đăng nhập: tra users theo email trong phạm vi '*' (chưa biết org) → 200 + cookie phiên.
        const res = await login(jreq("/api/auth/login", { email, password: matKhau }));
        assert.equal(res.status, 200, await res.clone().text());
        const cookie = /xboss_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
        assert.ok(cookie, "login phải đặt cookie phiên");
        datCookie("xboss_session", cookie[1]);
        // Sai mật khẩu vẫn 401 (không phải 500/404 vì RLS).
        assert.equal(
          (await login(jreq("/api/auth/login", { email, password: "sai-mat-khau-hoan-toan" })))
            .status,
          401,
        );

        const r = await goi(me());
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal((r.body?.user as { id: number }).id, uid);

        // Route nghiệp vụ đọc bảng theo tổ chức NGOÀI transaction: chỉ thấy NCC của org A.
        const [supA, supB] = dong.get("suppliers")!;
        const ds = await goi(suppliers());
        assert.equal(ds.status, 200, JSON.stringify(ds.body));
        const idNcc = ((ds.body?.suppliers ?? []) as { id: number }[]).map((x) => Number(x.id));
        assert.ok(idNcc.includes(supA), "phải thấy NCC org A");
        assert.ok(!idNcc.includes(supB), "không được thấy NCC org B");

        // Cron chỉ-secret (không phiên): chạy lần lượt từng tổ chức, thấy dự án của CẢ hai org.
        dangXuat();
        const cron = await goi(
          dailyReport(
            new NextRequest("http://localhost/api/cron/daily-report", {
              headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
            }),
          ),
        );
        assert.equal(cron.status, 200, JSON.stringify(cron.body));
        const duAn = ((cron.body?.projects ?? []) as { projectId: number }[]).map(
          (x) => x.projectId,
        );
        assert.ok(duAn.includes(A.proj) && duAn.includes(B.proj), `cron thiếu dự án: ${duAn}`);
        // Không secret, không phiên → 401.
        assert.equal(
          (await dailyReport(new NextRequest("http://localhost/api/cron/daily-report"))).status,
          401,
        );
      });
    } finally {
      dangXuat();
      if (cronCu === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = cronCu;
      await run(`DELETE FROM login_rate_limits WHERE key LIKE ?`, `%${email}%`).catch(() => {});
      await run(`DELETE FROM users WHERE id = ?`, uid);
    }
  },
);

test(
  "A1-AC06: script membership:dry-run chạy bằng xboss_app vẫn thấy mọi tổ chức (phạm vi '*' tường minh)",
  S,
  async () => {
    const { thuThapMembershipDryRun } = await import("../scripts/lib/membership-dry-run");
    const kq = await voiPoolApp(() => thuThapMembershipDryRun());
    const orgIds = kq.orgs.map((o) => Number(o.id));
    assert.ok(orgIds.includes(A.org) && orgIds.includes(B.org), JSON.stringify(orgIds));
  },
);
