import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers
import { jreq } from "./helpers/chuoi-nghiep-vu";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, Pool } from "pg";

// Q-AC07: GET /api/ready + login/me trả 503 JSON `schema_not_ready` khi schema thiếu/lỗi thời.
// Schema thiếu dựng bằng DB THẬT: `<test>_s16_empty` (không bảng) và `<test>_s16_behind` (có
// schema_migrations nhưng thiếu gần hết migration). Tạo nếu chưa có, KHÔNG drop.

const S = { skip: !HAS_TEST_DB };
type G = { __xbossPool?: Pool; __xbossSchemaCompatible?: Promise<void> };
const g = globalThis as unknown as G;

function urlVoi(db: string): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.pathname = `/${db}`;
  return u.toString();
}

async function damBaoDb(hauTo: "empty" | "behind"): Promise<string> {
  const base = new URL(process.env.TEST_DATABASE_URL as string).pathname.slice(1);
  const ten = `${base}_s16_${hauTo}`;
  assert.match(ten, /^[a-z0-9_]+$/, "tên DB tạm phải an toàn để chèn vào DDL");
  const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  try {
    const co = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [ten]);
    if (co.rowCount === 0) await admin.query(`CREATE DATABASE "${ten}"`);
  } finally {
    await admin.end();
  }
  if (hauTo === "behind") {
    const c = new Client({ connectionString: urlVoi(ten) });
    await c.connect();
    try {
      await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)`);
      await c.query(
        `INSERT INTO schema_migrations (name) VALUES ('0001_init.sql') ON CONFLICT DO NOTHING`,
      );
    } finally {
      await c.end();
    }
  }
  return ten;
}

/** Chạy fn với pool trỏ DB `ten`; ghi mọi câu SQL runtime gửi đi. */
async function voiDb<T>(ten: string, fn: () => Promise<T>): Promise<{ kq: T; sql: string[] }> {
  const { getPool } = await import("@/lib/db");
  const goc = getPool();
  const pool = new Pool({ connectionString: urlVoi(ten), max: 2, allowExitOnIdle: true });
  const sql: string[] = [];
  const q = pool.query.bind(pool) as (...a: unknown[]) => unknown;
  (pool as unknown as { query: unknown }).query = (...a: unknown[]) => {
    const t = typeof a[0] === "string" ? a[0] : (a[0] as { text?: string } | null)?.text;
    if (t) sql.push(t.trim());
    return q(...a);
  };
  g.__xbossSchemaCompatible = undefined;
  g.__xbossPool = pool;
  try {
    return { kq: await fn(), sql };
  } finally {
    g.__xbossPool = goc;
    g.__xbossSchemaCompatible = undefined;
    await pool.end();
  }
}

test("Q-AC07: /api/ready 200 trên DB đã migrate, body đúng, no-store", S, async () => {
  const { GET } = await import("@/app/api/ready/route");
  const { getPool } = await import("@/lib/db");
  g.__xbossSchemaCompatible = undefined;
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const b = (await res.json()) as Record<string, unknown>;
  const dem = await getPool().query<{ n: number; h: string }>(
    `SELECT COUNT(*)::int AS n, MAX(name) AS h FROM schema_migrations`,
  );
  assert.deepEqual(b, {
    ready: true,
    schema: "ok",
    migrationsApplied: dem.rows[0].n,
    appliedHead: dem.rows[0].h,
  });
});

for (const [hauTo, reason] of [
  ["empty", "schema_missing"],
  ["behind", "schema_behind"],
] as const) {
  test(`Q-AC07: /api/ready 503 ${reason}, chỉ SELECT, không lộ kết nối`, S, async () => {
    const { GET } = await import("@/app/api/ready/route");
    const ten = await damBaoDb(hauTo);
    const { kq: res, sql } = await voiDb(ten, () => GET());
    assert.equal(res.status, 503);
    const b = (await res.json()) as { ready: boolean; reason: string; error: string };
    assert.equal(b.ready, false);
    assert.equal(b.reason, reason);
    assert.match(b.error, /migration/);
    assert.doesNotMatch(JSON.stringify(b), /postgres|localhost|ci:ci|5432/i);
    assert.ok(sql.length > 0);
    assert.deepEqual(
      sql.filter((s) => !/^SELECT\b/i.test(s)),
      [],
      "readiness chỉ được SELECT",
    );
  });
}

for (const hauTo of ["empty", "behind"] as const) {
  test(`Q-AC07: login/me 503 JSON schema_not_ready khi schema ${hauTo}`, S, async () => {
    const { POST: login } = await import("@/app/api/auth/login/route");
    const { GET: me } = await import("@/app/api/auth/me/route");
    const ten = await damBaoDb(hauTo);
    const { kq, sql } = await voiDb(ten, async () => {
      const l = await login(
        jreq("/api/auth/login", { email: "q-ac07@test.local", password: "khong-quan-trong" }),
      );
      dangNhap({ id: 987_654, passwordHash: "q-ac07-hash" });
      try {
        return { l, m: await me() };
      } finally {
        dangXuat();
      }
    });
    for (const r of [kq.l, kq.m]) {
      assert.equal(r.status, 503);
      assert.equal(r.headers.get("retry-after"), "30");
      assert.deepEqual(await r.json(), {
        error: "Hệ thống đang bảo trì cơ sở dữ liệu, thử lại sau",
        code: "schema_not_ready",
      });
    }
    assert.deepEqual(
      sql.filter((s) => !/^SELECT\b/i.test(s)),
      [],
      "không ghi (kể cả rate-limit sai mật khẩu) khi schema thiếu",
    );
  });
}

test("Q-AC07: login/me bình thường khi schema đủ (401, không thành 503)", S, async () => {
  const { POST: login } = await import("@/app/api/auth/login/route");
  const { GET: me } = await import("@/app/api/auth/me/route");
  g.__xbossSchemaCompatible = undefined;
  const l = await login(
    jreq("/api/auth/login", { email: "khong-ton-tai-q-ac07@test.local", password: "sai" }),
  );
  assert.equal(l.status, 401);
  dangXuat();
  assert.equal((await me()).status, 401);
});
