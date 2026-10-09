import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

// A1-AC04 (GAP-3): withProjectScope/withTransaction lồng nhau KHÔNG được âm thầm đổi ngữ cảnh.
// - Lồng khác dự án / khác '*' / khác actor / nâng readOnly→ghi ⇒ throw, transaction ngoài
//   ROLLBACK; lồng CÙNG scope vẫn chạy.
// - COMMIT/ROLLBACK (kể cả ROLLBACK lỗi) không để GUC app.* rò sang request sau trên cùng
//   connection của pool.
// - ≥20 request đồng thời qua pool nhỏ (max 3) mỗi request chỉ thấy GUC + dữ liệu của chính nó.
// Chạy bằng role ứng dụng `xboss_app` (NOBYPASSRLS) để RLS áp thật như production.

type G = { __xbossPool?: Pool };
const g = globalThis as unknown as G;

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

let ownerPool: Pool | undefined;
let projA = 0;
let projB = 0;
let userA = 0;
let userB = 0;

// Đổi pool của lib/db sang pool xboss_app có `max` cho trước (đóng pool app cũ nếu có).
async function dungPoolApp(max: number): Promise<Pool> {
  const cur = g.__xbossPool;
  if (cur && cur !== ownerPool) await cur.end();
  const pool = new Pool({ connectionString: appConnString(), max, allowExitOnIdle: true });
  g.__xbossPool = pool;
  return pool;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, getPool } = await import("@/lib/db");
  ownerPool = getPool();
  const sfx = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  projA = await insertId(`INSERT INTO projects (name) VALUES (?)`, `NEST A ${sfx}`);
  projB = await insertId(`INSERT INTO projects (name) VALUES (?)`, `NEST B ${sfx}`);
  for (const [p, tag] of [
    [projA, "A"],
    [projB, "B"],
  ] as const) {
    await insertId(
      `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', ?, ?)`,
      `NEST-${tag}-${sfx}`,
      `HĐ ${tag}`,
      p,
    );
  }
  userA = await insertId(
    `INSERT INTO users (email, name, password_hash, role) VALUES (?, 'Nest A', 'x', 'pm')`,
    `nest-a-${sfx}@test.local`,
  );
  userB = await insertId(
    `INSERT INTO users (email, name, password_hash, role) VALUES (?, 'Nest B', 'x', 'pm')`,
    `nest-b-${sfx}@test.local`,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const cur = g.__xbossPool;
  if (cur && cur !== ownerPool) await cur.end();
  g.__xbossPool = ownerPool;
  // Dọn fixture bằng owner — user sót lại (kèm notification do file khác sinh) làm vỡ các test
  // `DELETE FROM users` dùng chung DB.
  const { run } = await import("@/lib/db");
  const users = [userA, userB].filter((id) => id > 0);
  const projects = [projA, projB].filter((id) => id > 0);
  await run(`DELETE FROM notifications WHERE user_id = ANY(?::int[])`, users);
  await run(`DELETE FROM users WHERE id = ANY(?::int[])`, users);
  await run(`DELETE FROM contracts WHERE project_id = ANY(?::int[])`, projects);
  await run(`DELETE FROM projects WHERE id = ANY(?::int[])`, projects);
});

// Đọc GUC của connection "rỗi" (ngoài transaction): '' hoặc NULL đều là sạch.
async function gucNgoaiGiaoDich(pool: Pool): Promise<string[]> {
  const r = await pool.query<{ p: string | null; u: string | null; o: string | null }>(
    `SELECT current_setting('app.project_id', true) AS p, current_setting('app.user_id', true) AS u,
            current_setting('app.org_id', true) AS o`,
  );
  return [r.rows[0].p ?? "", r.rows[0].u ?? "", r.rows[0].o ?? ""];
}

async function soHopDong(projectId: number): Promise<number> {
  const r = await (ownerPool as Pool).query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM contracts WHERE project_id = $1`,
    [projectId],
  );
  return r.rows[0].n;
}

test(
  "A1-AC04: lồng khác dự án / leo thang '*' / thu hẹp từ '*' ⇒ từ chối",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, query } = await import("@/lib/db");
    await dungPoolApp(3);
    await assert.rejects(
      () => withProjectScope(projA, () => withProjectScope(projB, () => query("SELECT 1"))),
      /phạm vi/i,
    );
    await assert.rejects(
      () => withProjectScope(projA, () => withProjectScope("*", () => query("SELECT 1"))),
      /phạm vi/i,
    );
    await assert.rejects(
      () => withProjectScope("*", () => withProjectScope(projA, () => query("SELECT 1"))),
      /phạm vi/i,
    );
  },
);

test(
  "A1-AC04: lồng khác scope trong transaction ghi ⇒ ROLLBACK, không ghi gì",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, run } = await import("@/lib/db");
    await dungPoolApp(3);
    const truoc = await soHopDong(projA);
    await assert.rejects(
      () =>
        withProjectScope(
          projA,
          async () => {
            await run(
              `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'ghi dở', ?)`,
              `NEST-RB-${Date.now()}`,
              projA,
            );
            // Lời gọi lồng sang dự án B: trước bản vá, GUC bị âm thầm đổi sang B.
            await withProjectScope(projB, () => run("SELECT 1"));
          },
          { readOnly: false },
        ),
      /phạm vi/i,
    );
    assert.equal(await soHopDong(projA), truoc, "transaction ngoài phải ROLLBACK");
  },
);

test(
  "A1-AC04: nâng quyền readOnly → ghi trong lời gọi lồng ⇒ từ chối",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, withTransaction, query } = await import("@/lib/db");
    await dungPoolApp(3);
    await assert.rejects(
      () =>
        withProjectScope(projA, () =>
          withProjectScope(projA, () => query("SELECT 1"), { readOnly: false }),
        ),
      /chỉ-đọc/i,
    );
    await assert.rejects(
      () => withProjectScope(projA, () => withTransaction(() => query("SELECT 1"))),
      /chỉ-đọc/i,
    );
    // Hạ quyền (ghi → đọc) vẫn hợp lệ — đã có test db-begin-read-only cho READ ONLY không bị ép.
    const n = await withProjectScope(
      projA,
      () => withProjectScope(projA, () => query("SELECT 1"), { readOnly: true }),
      { readOnly: false },
    );
    assert.equal(n.length, 1);
  },
);

test(
  "A1-AC04: lồng khác actor / khác dự án của request ⇒ từ chối",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withTransaction, withProjectScope, query } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    await dungPoolApp(3);
    await assert.rejects(
      () =>
        runWithRequestContext({ userId: userA, role: "pm", projectId: projA }, () =>
          withTransaction(() =>
            runWithRequestContext({ userId: userB, role: "pm", projectId: projA }, () =>
              withTransaction(() => query("SELECT 1")),
            ),
          ),
        ),
      /actor|ngữ cảnh/i,
    );
    await assert.rejects(
      () =>
        runWithRequestContext({ userId: userA, role: "pm", projectId: projA }, () =>
          withProjectScope(projA, () =>
            runWithRequestContext({ userId: userA, role: "pm", projectId: projB }, () =>
              withProjectScope(projA, () => query("SELECT 1")),
            ),
          ),
        ),
      /actor|ngữ cảnh/i,
    );
  },
);

test("A1-AC04: lồng CÙNG scope vẫn chạy và thấy đúng dữ liệu", { skip: !HAS_TEST_DB }, async () => {
  const { withTransaction, withProjectScope, query } = await import("@/lib/db");
  const { runWithRequestContext } = await import("@/lib/nen/request-context");
  await dungPoolApp(3);
  const rows = await withProjectScope(projA, () =>
    withProjectScope(projA, () =>
      query<{ project_id: number }>(
        `SELECT project_id FROM contracts WHERE project_id IN (?, ?)`,
        projA,
        projB,
      ),
    ),
  );
  assert.ok(rows.length > 0 && rows.every((r) => r.project_id === projA));
  // Transaction mở theo ngữ cảnh request (GUC = dự án A) rồi hàm lib tự bọc withProjectScope(A).
  const rows2 = await runWithRequestContext({ userId: userA, role: "pm", projectId: projA }, () =>
    withTransaction(() =>
      withProjectScope(projA, () =>
        query<{ project_id: number }>(
          `SELECT project_id FROM contracts WHERE project_id IN (?, ?)`,
          projA,
          projB,
        ),
      ),
    ),
  );
  assert.ok(rows2.length > 0 && rows2.every((r) => r.project_id === projA));
  // Transaction chưa gắn dự án (GUC rỗng) được gắn 1 lần; sau đó đổi sang dự án khác bị chặn.
  await assert.rejects(
    () =>
      withTransaction(async () => {
        await withProjectScope(projA, () => query("SELECT 1"));
        await withProjectScope(projB, () => query("SELECT 1"));
      }),
    /phạm vi/i,
  );
});

test(
  "A1-AC04: Promise.all hai scope khác nhau trong 1 transaction ⇒ từ chối",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withTransaction, withProjectScope, query } = await import("@/lib/db");
    await dungPoolApp(3);
    await assert.rejects(
      () =>
        withTransaction(() =>
          Promise.all([
            withProjectScope(projA, () => query("SELECT pg_sleep(0.02)")),
            withProjectScope(projB, () => query("SELECT pg_sleep(0.02)")),
          ]),
        ),
      /phạm vi/i,
    );
  },
);

test(
  "A1-AC04: COMMIT / ROLLBACK / lời gọi lồng bị từ chối đều trả connection sạch GUC",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, withTransaction, query } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    // Pool 1 connection: request sau chắc chắn dùng lại đúng connection của request trước.
    const pool = await dungPoolApp(1);
    const ctx = { userId: userA, role: "pm", orgId: 1, projectId: projA };
    await runWithRequestContext(ctx, () => withProjectScope(projA, () => query("SELECT 1")));
    assert.deepEqual(await gucNgoaiGiaoDich(pool), ["", "", ""], "sau COMMIT");
    await assert.rejects(() =>
      runWithRequestContext(ctx, () =>
        withTransaction(async () => {
          await query("SELECT 1");
          throw new Error("lỗi nghiệp vụ");
        }),
      ),
    );
    assert.deepEqual(await gucNgoaiGiaoDich(pool), ["", "", ""], "sau ROLLBACK");
    await assert.rejects(() =>
      runWithRequestContext(ctx, () =>
        withProjectScope(projA, () => withProjectScope(projB, () => query("SELECT 1"))),
      ),
    );
    assert.deepEqual(await gucNgoaiGiaoDich(pool), ["", "", ""], "sau lời gọi lồng bị từ chối");
  },
);

test(
  "A1-AC04: ROLLBACK lỗi ⇒ connection bị huỷ, không trả về pool còn mở transaction",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, query } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const pool = await dungPoolApp(1);
    const goc = pool.connect.bind(pool) as (...a: unknown[]) => Promise<unknown>;
    let releaseArg: unknown = "chưa gọi";
    (pool as unknown as { connect: unknown }).connect = async (...ca: unknown[]) => {
      if (typeof ca[0] === "function") return goc(...ca);
      const client = (await goc()) as {
        query: (...a: unknown[]) => unknown;
        release: (e?: unknown) => void;
      };
      const q = client.query.bind(client);
      const rel = client.release.bind(client);
      client.query = (...a: unknown[]) => {
        if (a[0] === "ROLLBACK") return Promise.reject(new Error("mất kết nối giả lập"));
        return q(...a);
      };
      client.release = (e?: unknown) => {
        releaseArg = e;
        client.query = q;
        rel(e as Error | undefined);
      };
      return client;
    };
    try {
      await assert.rejects(
        () =>
          runWithRequestContext({ userId: userA, role: "pm", projectId: projA }, () =>
            withProjectScope(projA, async () => {
              await query("SELECT 1");
              throw new Error("lỗi nghiệp vụ gốc");
            }),
          ),
        /lỗi nghiệp vụ gốc/,
      );
    } finally {
      (pool as unknown as { connect: unknown }).connect = goc;
    }
    assert.ok(releaseArg instanceof Error, "release(err) để pool huỷ connection hỏng");
    assert.deepEqual(await gucNgoaiGiaoDich(pool), ["", "", ""]);
  },
);

test(
  "A1-AC04: 24 request đồng thời qua pool max=3 — mỗi request chỉ thấy GUC/dữ liệu của mình",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, withTransaction, query } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const pool = await dungPoolApp(3);
    const N = 24;
    const ketQua = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => {
        const p = i % 2 ? projA : projB;
        const u = i % 3 ? userA : userB;
        return runWithRequestContext(
          { userId: u, role: "pm", orgId: 1, projectId: p, requestId: `r${i}` },
          () => {
            const body = async () => {
              const g1 = await query<{ p: string; u: string; r: string }>(
                `SELECT current_setting('app.project_id', true) AS p, current_setting('app.user_id', true) AS u,
                    current_setting('app.request_id', true) AS r`,
              );
              // Nhường lượt cho request khác chen vào giữa 2 lần đọc.
              await query(`SELECT pg_sleep(?)`, (i % 4) * 0.005);
              const rows = await query<{ project_id: number }>(
                `SELECT project_id FROM contracts WHERE project_id IN (?, ?)`,
                projA,
                projB,
              );
              const g2 = await query<{ p: string; r: string }>(
                `SELECT current_setting('app.project_id', true) AS p, current_setting('app.request_id', true) AS r`,
              );
              if (i % 5 === 0) throw new Error(`rollback-${i}`);
              return {
                i,
                p,
                u,
                g1: g1[0],
                g2: g2[0],
                ids: [...new Set(rows.map((r) => r.project_id))],
              };
            };
            // Trộn 2 đường mở transaction: withProjectScope và withTransaction theo ngữ cảnh request.
            return i % 2 ? withProjectScope(p, body) : withTransaction(body);
          },
        );
      }),
    );
    assert.equal(ketQua.length, N);
    let ok = 0;
    ketQua.forEach((r, i) => {
      if (i % 5 === 0) {
        assert.equal(r.status, "rejected");
        return;
      }
      assert.equal(r.status, "fulfilled", `request ${i} phải thành công`);
      const v = (
        r as PromiseFulfilledResult<{
          p: number;
          u: number;
          g1: { p: string; u: string; r: string };
          g2: { p: string; r: string };
          ids: number[];
        }>
      ).value;
      assert.equal(v.g1.p, String(v.p), `request ${i}: GUC dự án`);
      assert.equal(v.g1.u, String(v.u), `request ${i}: GUC actor`);
      assert.equal(v.g1.r, `r${i}`, `request ${i}: GUC request_id`);
      assert.equal(v.g2.p, String(v.p), `request ${i}: GUC dự án sau khi chen`);
      assert.equal(v.g2.r, `r${i}`, `request ${i}: request_id sau khi chen`);
      assert.deepEqual(v.ids, [v.p], `request ${i}: RLS chỉ trả dòng dự án của chính nó`);
      ok++;
    });
    assert.ok(ok >= 19);
    // Sau cơn đồng thời (có cả ROLLBACK), mọi connection trong pool đều sạch GUC.
    const sach = await Promise.all(Array.from({ length: 3 }, () => gucNgoaiGiaoDich(pool)));
    for (const s of sach) assert.deepEqual(s, ["", "", ""]);
  },
);
