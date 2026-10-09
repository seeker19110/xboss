import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import type { SheetClient } from "@/lib/vat-tu/google-sheets";
import { SoFixture, goi, jreq } from "./helpers/chuoi-nghiep-vu";

// S16 (RLS 0165) — nợ "đường phụ chưa có ca chạy bằng xboss_app": 2FA bước 2, OIDC upsertSsoUser,
// /api/v1/* (api-key), cron sync-sheets chỉ-secret. Chạy bằng pool `xboss_app` (NOBYPASSRLS, FORCE
// RLS) như production; owner chỉ dựng fixture. KHÔNG mock DB/withOrgScope. Riêng cron: chỉ thay
// lớp mạng Google (getSheetClient) bằng Sheet giả trong bộ nhớ (cùng cách tests/route-vat-tu-sync-
// pham-vi.test.ts).

const S = { skip: !HAS_TEST_DB };
type G = { __xbossPool?: Pool };
const g = globalThis as unknown as G;

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

const sfx = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const MAT_KHAU = `S16-duong-phu-${sfx}`;
type Ben = { org: number; proj: number; user: number; email: string };
let A: Ben;
let B: Ben;
let appPool: Pool;
const fx = new SoFixture();
const emailsSso: string[] = [];
const khoaRateLimit: string[] = [];

// ── Sheet giả (cron) ────────────────────────────────────────────────────────
const HEADER = [
  "ID",
  "Mã BOQ",
  "Tên vật tư",
  "ĐVT",
  "KL BOQ",
  "Định mức",
  "Đã dùng",
  "Tồn kho",
  "Ngưỡng tối thiểu",
  "Trạng thái",
  "Ghi chú",
  "Hệ",
];
let sheet: string[][] = [HEADER];
let soLanDoc = 0;
const sheetGia: SheetClient = {
  tab: "VatTu",
  async readRows() {
    soLanDoc += 1;
    return sheet.map((r) => [...r]);
  },
  async writeRows(_o, out) {
    sheet = out.map((r) => r.map((c) => String(c)));
  },
};

function datEnv(vars: Record<string, string | undefined>): () => void {
  const cu = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(cu)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

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

async function taoBen(nhan: string): Promise<Ben> {
  const { insertId, run } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/bao-mat/auth");
  const { encryptTotpSecret, generateNewTotpSecret } = await import("@/lib/bao-mat/totp");
  const org = await insertId(
    `INSERT INTO organizations (name, slug) VALUES (?, ?)`,
    `S16dp ${nhan}`,
    `s16dp-${nhan}-${sfx}`,
  );
  const proj = await fx.duAn(`S16dp ${nhan}`);
  await run(`UPDATE projects SET org_id = ? WHERE id = ?`, org, proj);
  const email = `s16dp-${nhan}-${sfx}@test.local`;
  const secret = generateNewTotpSecret();
  secrets.set(nhan, secret);
  const user = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id, totp_secret, totp_enabled_at)
     VALUES (?, ?, ?, 'pm', ?, ?, now())`,
    `S16dp ${nhan}`,
    email,
    hashPassword(MAT_KHAU),
    org,
    encryptTotpSecret(secret),
  );
  return { org, proj, user, email };
}
const secrets = new Map<string, string>();

before(async () => {
  if (!HAS_TEST_DB) return;
  A = await taoBen("a");
  B = await taoBen("b");
  appPool = new Pool({ connectionString: appConnString(), max: 3, allowExitOnIdle: true });
  // Mock lớp mạng Google trước khi bất kỳ ca nào import route/material-sync.
  const thatSheets = await import("@/lib/vat-tu/google-sheets");
  mock.module("@/lib/vat-tu/google-sheets", {
    namedExports: { ...thatSheets, getSheetClient: async () => sheetGia },
  });
});

after(async () => {
  if (!HAS_TEST_DB) return;
  await appPool?.end();
  const { run } = await import("@/lib/db");
  for (const k of khoaRateLimit) await run(`DELETE FROM login_rate_limits WHERE key LIKE ?`, k);
  for (const b of [A, B]) {
    if (!b) continue;
    await run(
      `DELETE FROM material_sync WHERE material_id IN
      (SELECT id FROM materials WHERE project_id = ?)`,
      b.proj,
    );
    await run(`DELETE FROM materials WHERE project_id = ?`, b.proj);
    await run(`DELETE FROM api_keys WHERE org_id = ?`, b.org);
    await run(`DELETE FROM users WHERE org_id = ?`, b.org);
  }
  for (const e of emailsSso) await run(`DELETE FROM users WHERE email = ?`, e);
  await fx.don();
  for (const b of [A, B]) if (b) await run(`DELETE FROM organizations WHERE id = ?`, b.org);
});

// ── 1. 2FA bước 2 ───────────────────────────────────────────────────────────

test(
  "S16 2FA bước 2 (xboss_app): mã đúng → cấp phiên; sai/dùng lại → 401; đúng org",
  S,
  async () => {
    const { POST: login } = await import("@/app/api/auth/login/route");
    const { POST: buoc2 } = await import("@/app/api/auth/login/2fa/route");
    const { queryOne, withOrgScope } = await import("@/lib/db");
    const ip = `s16dp-2fa-${sfx}`;
    khoaRateLimit.push(`%${ip}%`, `totp-acct|${A.user}`);
    const h = { "x-forwarded-for": ip };
    await voiPoolApp(async () => {
      dangXuat();
      // Bước 1: mật khẩu đúng + đã bật 2FA → need2fa + pending, KHÔNG cookie phiên.
      const r1 = await login(
        jreq("/api/auth/login", { email: A.email, password: MAT_KHAU }, "POST", h),
      );
      assert.equal(r1.status, 200, await r1.clone().text());
      const b1 = (await r1.json()) as { need2fa?: boolean; pending?: string };
      assert.equal(b1.need2fa, true);
      assert.ok(b1.pending);
      assert.ok(!/xboss_session=/.test(r1.headers.get("set-cookie") ?? ""));

      // Mã sai → 401, không cookie.
      const dung = await generate({ secret: secrets.get("a")!, digits: 6, period: 30 });
      const sai = dung === "000000" ? "111111" : "000000";
      const rSai = await buoc2(
        jreq("/api/auth/login/2fa", { pending: b1.pending, code: sai }, "POST", h),
      );
      assert.equal(rSai.status, 401);
      assert.ok(!/xboss_session=/.test(rSai.headers.get("set-cookie") ?? ""));

      // Mã đúng → 200, đúng user của org A, có cookie phiên.
      const r2 = await buoc2(
        jreq("/api/auth/login/2fa", { pending: b1.pending, code: dung }, "POST", h),
      );
      assert.equal(r2.status, 200, await r2.clone().text());
      const b2 = (await r2.json()) as { user: { id: number; email: string } };
      assert.equal(b2.user.id, A.user);
      assert.equal(b2.user.email, A.email);
      assert.match(r2.headers.get("set-cookie") ?? "", /xboss_session=/);

      // Dùng lại đúng mã đó (replay) → 401 (totp_last_step ghi được dưới xboss_app).
      const rLai = await buoc2(
        jreq("/api/auth/login/2fa", { pending: b1.pending, code: dung }, "POST", h),
      );
      assert.equal(rLai.status, 401);
      const buoc = await withOrgScope(A.org, () =>
        queryOne<{ s: number | null }>(
          `SELECT totp_last_step AS s FROM users WHERE id = ?`,
          A.user,
        ),
      );
      assert.ok(buoc?.s != null, "totp_last_step phải được ghi dưới phạm vi org A");

      // Cách ly: trong phạm vi org A không thấy user org B; pending token rác → 401.
      const cheo = await withOrgScope(A.org, () =>
        queryOne(`SELECT id FROM users WHERE id = ?`, B.user),
      );
      assert.ok(cheo == null, "org A không được thấy user org B");
      const rRac = await buoc2(
        jreq("/api/auth/login/2fa", { pending: "x.y.z", code: dung }, "POST", h),
      );
      assert.equal(rRac.status, 401);
    });
  },
);

// ── 2. OIDC upsertSsoUser ───────────────────────────────────────────────────

test(
  "S16 OIDC upsertSsoUser (xboss_app): tạo mới org 1, cập nhật đúng org, không lộ/ghi chéo org",
  S,
  async () => {
    const { upsertSsoUser } = await import("@/lib/bao-mat/oidc");
    const { insertId, queryOne, withOrgScope } = await import("@/lib/db");
    const { hashPassword } = await import("@/lib/bao-mat/auth");
    // Mỗi org đúng 1 admin SSO — nếu đếm "admin cuối" lọt sang org khác sẽ thấy ≥2 và hạ cấp nhầm.
    const emailAdminA = `s16dp-sso-admin-a-${sfx}@test.local`;
    const emailAdminB = `s16dp-sso-admin-b-${sfx}@test.local`;
    const emailMoi = `s16dp-sso-moi-${sfx}@test.local`;
    const emailViewerA = `s16dp-sso-viewer-a-${sfx}@test.local`;
    emailsSso.push(emailAdminA, emailAdminB, emailMoi, emailViewerA);
    for (const [email, org, role] of [
      [emailAdminA, A.org, "admin"],
      [emailAdminB, B.org, "admin"],
      [emailViewerA, A.org, "viewer"],
    ] as const)
      await insertId(
        `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('sso', ?, ?, ?, ?)`,
        email,
        hashPassword("x"),
        role,
        org,
      );
    await voiPoolApp(async () => {
      // Tạo mới: org mặc định 1 (M54 GĐ1), role viewer mặc định.
      const moi = await upsertSsoUser({ email: emailMoi, name: "SSO Mới", roleFromClaim: null });
      assert.equal(moi.org_id, 1);
      assert.equal(moi.email, emailMoi);
      // Đăng nhập lại không tạo trùng.
      const lai = await upsertSsoUser({ email: emailMoi, name: "SSO Mới", roleFromClaim: null });
      assert.equal(lai.id, moi.id);

      // Cập nhật role user org A: ghi được dưới phạm vi org A, giữ org_id A.
      const capNhat = await upsertSsoUser({
        email: emailViewerA,
        name: "x",
        roleFromClaim: "engineer",
      });
      assert.equal(capNhat.org_id, A.org);
      assert.equal(capNhat.role, "engineer");
      const dbRole = await withOrgScope(A.org, () =>
        queryOne<{ role: string }>(`SELECT role FROM users WHERE email = ?`, emailViewerA),
      );
      assert.equal(dbRole?.role, "engineer", "UPDATE role phải thực sự ghi (không lặng lẽ 0 dòng)");

      // Admin cuối cùng của org A không bị hạ cấp dù org B còn admin (đếm trong phạm vi org).
      const giu = await upsertSsoUser({ email: emailAdminA, name: "x", roleFromClaim: "viewer" });
      assert.equal(giu.role, "admin");
      assert.equal(giu.org_id, A.org);

      // Cách ly: phạm vi org A không thấy user SSO org B; org B không thấy org A.
      assert.ok(
        (await withOrgScope(A.org, () =>
          queryOne(`SELECT id FROM users WHERE email = ?`, emailAdminB),
        )) == null,
      );
      assert.ok(
        (await withOrgScope(B.org, () =>
          queryOne(`SELECT id FROM users WHERE email = ?`, emailAdminA),
        )) == null,
      );
    });
  },
);

// ── 3. /api/v1/* (api-key) ──────────────────────────────────────────────────

async function taoKey(b: Ben, projectId: number | null): Promise<string> {
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/bao-mat/api-keys");
  const raw = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, scopes, project_id, created_by, org_id)
     VALUES (?, ?, ARRAY['read'], ?, ?, ?)`,
    `s16dp-${sfx}`,
    hashApiKey(raw),
    projectId,
    b.user,
    b.org,
  );
  return raw;
}
const bearer = (raw: string, q = "") =>
  new NextRequest(`http://localhost/api/v1/materials${q}`, {
    headers: { authorization: `Bearer ${raw}`, "x-forwarded-for": `s16dp-v1-${sfx}` },
  });

test(
  "S16 /api/v1 (xboss_app): key org A chỉ thấy dữ liệu A; key sai → 401; key toàn cục không vươn sang org B",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const { GET: vatTu } = await import("@/app/api/v1/materials/route");
    const { GET: tasks } = await import("@/app/api/v1/tasks/route");
    khoaRateLimit.push(`api-fail:s16dp-v1-${sfx}`);
    const mA = await insertId(
      `INSERT INTO materials (name, project_id) VALUES (?, ?)`,
      `VT-A-${sfx}`,
      A.proj,
    );
    await insertId(`INSERT INTO materials (name, project_id) VALUES (?, ?)`, `VT-B-${sfx}`, B.proj);
    const cayA = await fx.wbs(A.proj, { soO: 1 });
    await fx.wbs(B.proj, { soO: 1 });
    const keyA = await taoKey(A, A.proj);
    const keyToanCucB = await taoKey(B, null);
    await voiPoolApp(async () => {
      const r = await goi(vatTu(bearer(keyA)));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const ten = (r.body?.data as { id: number; name: string }[]).map((x) => x.name);
      assert.deepEqual(ten, [`VT-A-${sfx}`]);
      assert.equal((r.body?.data as { id: number }[])[0].id, mA);

      const t = await goi(tasks(bearer(keyA)));
      assert.equal(t.status, 200, JSON.stringify(t.body));
      assert.deepEqual(
        (t.body?.data as { id: number }[]).map((x) => x.id),
        [cayA.taskId],
        "chỉ task của dự án A",
      );

      // Key sai / thiếu header → 401.
      assert.equal((await goi(vatTu(bearer(`xbk_${"0".repeat(64)}`)))).status, 401);
      assert.equal(
        (await goi(vatTu(new NextRequest("http://localhost/api/v1/materials")))).status,
        401,
      );

      // Key toàn cục của org B: dự án B thấy vật tư B; dự án A (org khác) → 404, không lộ.
      const rB = await goi(vatTu(bearer(keyToanCucB, `?project=${B.proj}`)));
      assert.equal(rB.status, 200, JSON.stringify(rB.body));
      assert.deepEqual(
        (rB.body?.data as { name: string }[]).map((x) => x.name),
        [`VT-B-${sfx}`],
      );
      assert.equal((await goi(vatTu(bearer(keyToanCucB, `?project=${A.proj}`)))).status, 404);
    });
    // last_used_at ghi được dưới phạm vi org của key (UPDATE không lặng lẽ 0 dòng).
    const dung = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM api_keys WHERE org_id = ? AND last_used_at IS NOT NULL`,
      A.org,
    );
    assert.equal(dung?.n, 1);
  },
);

// ── 4. Cron sync-sheets chỉ-secret ──────────────────────────────────────────

test(
  "S16 cron sync-sheets (xboss_app): thiếu GOOGLE_SHEET_PROJECT_ID → 503; có → chạy trong org, không chạm dự án khác",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const { GET } = await import("@/app/api/cron/sync-sheets/route");
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM materials WHERE project_id IN (?, ?)`, A.proj, B.proj); // bỏ vật tư ca v1
    const secret = `s16dp-cron-${sfx}-dai-du-32-ky-tu-nhe`;
    const mA = await insertId(
      `INSERT INTO materials (name, unit, project_id, qty_boq, qty_planned, status, sort_order)
     VALUES (?, 'm', ?, 10, 10, 'dat_hang', 1)`,
      `CRON-A-${sfx}`,
      A.proj,
    );
    const mB = await insertId(
      `INSERT INTO materials (name, unit, project_id, qty_boq, qty_planned, status, sort_order)
     VALUES (?, 'm', ?, 10, 10, 'dat_hang', 1)`,
      `CRON-B-${sfx}`,
      B.proj,
    );
    const req = () =>
      new NextRequest("http://localhost/api/cron/sync-sheets", {
        headers: { authorization: `Bearer ${secret}` },
      });
    const envBase = { CRON_SECRET: secret };
    await voiPoolApp(async () => {
      dangXuat();
      // Thiếu GOOGLE_SHEET_PROJECT_ID → 503 như hiện hành, chưa đọc Sheet.
      let khoiPhuc = datEnv({ ...envBase, GOOGLE_SHEET_PROJECT_ID: undefined });
      try {
        sheet = [HEADER];
        soLanDoc = 0;
        const r = await goi(GET(req()));
        assert.equal(r.status, 503, JSON.stringify(r.body));
        assert.equal(soLanDoc, 0);
      } finally {
        khoiPhuc();
      }
      // Không secret, không phiên → 401.
      khoiPhuc = datEnv({ ...envBase, GOOGLE_SHEET_PROJECT_ID: String(A.proj) });
      try {
        assert.equal(
          (await goi(GET(new NextRequest("http://localhost/api/cron/sync-sheets")))).status,
          401,
        );
        // Lần 1: DB → Sheet — chỉ vật tư dự án A lên Sheet.
        sheet = [HEADER];
        const r = await goi(GET(req()));
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body?.projectId, A.proj);
        const ten = sheet.slice(1).map((row) => row[2]);
        assert.deepEqual(ten, [`CRON-A-${sfx}`], "Sheet chỉ chứa vật tư dự án A");

        // Lần 2: Sheet → DB — sửa tên vật tư A (ghi được dưới xboss_app) + dòng mang ID vật tư B bị bỏ qua.
        const dongA = sheet.find((row) => row[0] === String(mA))!;
        dongA[2] = `CRON-A-SUA-${sfx}`;
        sheet = [
          HEADER,
          dongA,
          [String(mB), "", "HACK-B", "m", "10", "10", "", "", "", "dat_hang", "", ""],
        ];
        const r2 = await goi(GET(req()));
        assert.equal(r2.status, 200, JSON.stringify(r2.body));
        const a = await queryOne<{ name: string }>(`SELECT name FROM materials WHERE id = ?`, mA);
        const b = await queryOne<{ name: string }>(`SELECT name FROM materials WHERE id = ?`, mB);
        assert.equal(a?.name, `CRON-A-SUA-${sfx}`, "đường Sheet→DB phải ghi được dưới xboss_app");
        assert.equal(b?.name, `CRON-B-${sfx}`, "vật tư dự án khác không bị chạm");
      } finally {
        khoiPhuc();
      }
    });
  },
);

test(
  "S16 code-lists: đọc rỗng ngoài phạm vi tổ chức không nhiễm cache — require_2fa_roles không fail-open",
  S,
  async () => {
    const { run, withOrgScope } = await import("@/lib/db");
    const { getList, bumpCodeListVersion } = await import("@/lib/ha-tang/code-lists");
    await run(
      `INSERT INTO code_lists (org_id, domain, code, label) VALUES (?, 'require_2fa_roles', 'pm', 'PM')`,
      A.org,
    );
    bumpCodeListVersion();
    try {
      await voiPoolApp(async () => {
        // Lời gọi quên gắn phạm vi (không request, không withOrgScope): RLS trả 0 dòng.
        assert.equal((await getList("require_2fa_roles", A.org)).length, 0);
        // Lời gọi đúng phạm vi ngay sau đó phải thấy cấu hình thật, không lấy rỗng từ cache.
        const dung = await withOrgScope(A.org, () => getList("require_2fa_roles", A.org));
        assert.deepEqual(
          dung.map((r) => r.code),
          ["pm"],
        );
      });
    } finally {
      await run(`DELETE FROM code_lists WHERE org_id = ? AND domain = 'require_2fa_roles'`, A.org);
      bumpCodeListVersion();
    }
  },
);
