import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers
import { jreq } from "./helpers/chuoi-nghiep-vu";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, Pool } from "pg";

// Q-AC07 (GAP-7): runtime chạy bằng app role THẬT (`xboss_app`, không quyền DDL) trên một DB
// CHƯA migrate ⇒ health/login/me báo lỗi đúng mã, KHÔNG tự migrate, KHÔNG chạy DDL/ghi gì.
// - /api/health → 503 { status: "degraded", errorCode: "schema_not_ready" }.
// - /api/auth/login, /api/auth/me → handler ném DatabaseSchemaNotReadyError
//   (code XBOSS_SCHEMA_NOT_READY; Next trả 500) — không 200/401 giả.
// - Sau cùng: DB vẫn trống (không schema_migrations, không bảng nào), mọi câu SQL runtime gửi đi
//   chỉ là SELECT, và app role không có quyền CREATE trên schema public.
// DB trống: `<tên DB test>_empty` — tạo nếu chưa có (KHÔNG drop; CI là container dùng một lần).

const S = { skip: !HAS_TEST_DB };
type G = { __xbossPool?: Pool; __xbossSchemaCompatible?: Promise<void> };
const g = globalThis as unknown as G;

function urlVoi(db: string, user?: { name: string; password: string }): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.pathname = `/${db}`;
  if (user) {
    u.username = user.name;
    u.password = user.password;
  }
  return u.toString();
}

async function damBaoDbTrong(): Promise<string> {
  const base = new URL(process.env.TEST_DATABASE_URL as string).pathname.slice(1);
  const ten = `${base}_empty`;
  assert.match(ten, /^[a-z0-9_]+$/, "tên DB tạm phải an toàn để chèn vào DDL");
  const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  try {
    const co = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [ten]);
    if (co.rowCount === 0) await admin.query(`CREATE DATABASE "${ten}"`);
  } finally {
    await admin.end();
  }
  return ten;
}

async function trangThaiDb(ten: string): Promise<{ bang: number; marker: string | null }> {
  const c = new Client({ connectionString: urlVoi(ten) });
  await c.connect();
  try {
    const r = await c.query<{ bang: number; marker: string | null }>(
      `SELECT (SELECT COUNT(*)::int FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
                WHERE n.nspname = 'public') AS bang,
              to_regclass('public.schema_migrations')::text AS marker`,
    );
    return r.rows[0];
  } finally {
    await c.end();
  }
}

test(
  "Q-AC07: app role trên DB chưa migrate ⇒ health 503 schema_not_ready, login/me lỗi đúng mã, không DDL",
  S,
  async () => {
    const { getPool } = await import("@/lib/db");
    const { GET: health } = await import("@/app/api/health/route");
    const { POST: login } = await import("@/app/api/auth/login/route");
    const { GET: me } = await import("@/app/api/auth/me/route");
    const ownerPool = getPool();
    const ten = await damBaoDbTrong();
    const truoc = await trangThaiDb(ten);
    assert.equal(truoc.marker, null, `${ten} phải là DB CHƯA migrate (đã có schema_migrations)`);

    const appPool = new Pool({
      connectionString: urlVoi(ten, { name: "xboss_app", password: "CHANGE_ME_ON_DEPLOY" }),
      max: 2,
      allowExitOnIdle: true,
    });
    // Ghi mọi câu SQL runtime gửi qua pool (cả pool.query lẫn client mượn qua connect()).
    const sqlDaGui: string[] = [];
    const ghi = (a: unknown) => {
      const text = typeof a === "string" ? a : (a as { text?: string } | null)?.text;
      if (text) sqlDaGui.push(text.trim());
    };
    const poolQuery = appPool.query.bind(appPool) as (...a: unknown[]) => unknown;
    (appPool as unknown as { query: unknown }).query = (...a: unknown[]) => {
      ghi(a[0]);
      return poolQuery(...a);
    };
    const poolConnect = appPool.connect.bind(appPool) as (...a: unknown[]) => Promise<unknown>;
    (appPool as unknown as { connect: unknown }).connect = async (...ca: unknown[]) => {
      if (typeof ca[0] === "function") return poolConnect(...ca);
      const client = (await poolConnect()) as { query: (...a: unknown[]) => unknown };
      const q = client.query.bind(client);
      client.query = (...a: unknown[]) => {
        ghi(a[0]);
        return q(...a);
      };
      return client;
    };

    g.__xbossSchemaCompatible = undefined;
    g.__xbossPool = appPool;
    try {
      const priv = (await poolQuery(
        `SELECT current_user AS u, has_schema_privilege(current_user, 'public', 'CREATE') AS c`,
      )) as { rows: { u: string; c: boolean }[] };
      assert.deepEqual(
        priv.rows[0],
        { u: "xboss_app", c: false },
        "app role không được có quyền DDL",
      );

      const h = await health();
      assert.equal(h.status, 503);
      const hb = (await h.json()) as { status: string; errorCode?: string; db: boolean };
      assert.equal(hb.status, "degraded");
      assert.equal(hb.errorCode, "schema_not_ready");
      assert.equal(hb.db, false);

      await assert.rejects(
        () =>
          login(
            jreq("/api/auth/login", { email: "q-ac07@test.local", password: "khong-quan-trong" }),
          ),
        (err: { code?: string; name?: string }) =>
          err?.code === "XBOSS_SCHEMA_NOT_READY" && err?.name === "DatabaseSchemaNotReadyError",
      );

      // Cookie ký thật để /me buộc phải chạm DB (thiếu cookie thì 401 ngay, không kiểm được gì).
      dangNhap({ id: 987_654, passwordHash: "q-ac07-hash" });
      await assert.rejects(
        () => me(),
        (err: { code?: string }) => err?.code === "XBOSS_SCHEMA_NOT_READY",
      );
    } finally {
      dangXuat();
      g.__xbossPool = ownerPool;
      g.__xbossSchemaCompatible = undefined;
      await appPool.end();
    }

    assert.ok(sqlDaGui.length > 0, "runtime phải thực sự thử đọc DB");
    const khongPhaiDoc = sqlDaGui.filter((s) => !/^SELECT\b/i.test(s));
    assert.deepEqual(khongPhaiDoc, [], "runtime chỉ được SELECT — không DDL/ghi/tự migrate");
    const sau = await trangThaiDb(ten);
    assert.deepEqual(sau, truoc, "DB trống phải giữ nguyên (không bảng/marker nào được tạo)");
  },
);
