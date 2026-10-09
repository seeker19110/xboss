import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

// ===== Test tích hợp RLS theo org (M54 GĐ1 PR3, migrations/0080_org_rls.sql) =====
// Cùng phương pháp tests/rls.test.ts (M51 PR1): mở pool riêng bằng role xboss_app
// (NOBYPASSRLS) để kiểm RLS đúng như production — superuser/owner của TEST_DATABASE_URL
// bỏ qua RLS nên không dùng được để kiểm.

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

test(
  "RLS org: bảng suppliers lọc theo GUC app.org_id (đọc + WITH CHECK ghi), GUC rỗng thấy 0 dòng (0165 khoá cửa)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    // Seed bằng owner (superuser bỏ qua RLS): 2 org + mỗi org 1 supplier.
    const orgA = await insertId(
      `INSERT INTO organizations (name, slug) VALUES ('Org RLS A', ?)`,
      `org-rls-a-${Date.now()}`,
    );
    const orgB = await insertId(
      `INSERT INTO organizations (name, slug) VALUES ('Org RLS B', ?)`,
      `org-rls-b-${Date.now()}`,
    );
    const supA = await insertId(
      `INSERT INTO suppliers (name, org_id) VALUES ('NCC org A', ?)`,
      orgA,
    );
    const supB = await insertId(
      `INSERT INTO suppliers (name, org_id) VALUES ('NCC org B', ?)`,
      orgB,
    );

    const appPool = new Pool({ connectionString: appConnString(), max: 3 });
    try {
      async function withGuc<T>(
        value: string | undefined,
        fn: (c: import("pg").PoolClient) => Promise<T>,
      ): Promise<T> {
        const c = await appPool.connect();
        try {
          await c.query("BEGIN");
          if (value !== undefined)
            await c.query(`SELECT set_config('app.org_id', $1, true)`, [value]);
          const r = await fn(c);
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      }

      // (1) GUC = org A: SELECT không WHERE chỉ thấy dòng của A, KHÔNG thấy B.
      await withGuc(String(orgA), async (c) => {
        const rows = await c.query<{ org_id: number }>(
          `SELECT org_id FROM suppliers WHERE id IN ($1, $2)`,
          [supA, supB],
        );
        assert.ok(rows.rows.length > 0, "phải thấy NCC của org A");
        assert.ok(
          rows.rows.every((r) => r.org_id === orgA),
          "GUC org A không được thấy supplier org khác dù SQL không lọc org_id",
        );
      });

      // (2) GUC trống (chưa đặt) — S16 / migration 0165 đã khoá cửa: KHÔNG thấy dòng nào.
      const allSeen = await appPool.query<{ org_id: number }>(
        `SELECT org_id FROM suppliers WHERE id IN ($1, $2)`,
        [supA, supB],
      );
      assert.equal(allSeen.rows.length, 0, "GUC trống không được cho qua sau 0165 (khoá cửa)");

      // (3) GUC = '*' — ngữ cảnh cross-org hợp lệ: thấy tất.
      await withGuc("*", async (c) => {
        const rows = await c.query<{ org_id: number }>(
          `SELECT org_id FROM suppliers WHERE id IN ($1, $2)`,
          [supA, supB],
        );
        const s = new Set(rows.rows.map((r) => r.org_id));
        assert.ok(s.has(orgA) && s.has(orgB), "GUC '*' phải thấy mọi org");
      });

      // (4a) GUC = A: INSERT đúng org A → OK (WITH CHECK cho qua).
      await withGuc(String(orgA), async (c) => {
        await c.query(`INSERT INTO suppliers (name, org_id) VALUES ('NCC A hợp lệ', $1)`, [orgA]);
      });

      // (4b) GUC = A: INSERT SAI org (B) → bị WITH CHECK chặn.
      await assert.rejects(
        () =>
          withGuc(String(orgA), async (c) => {
            await c.query(`INSERT INTO suppliers (name, org_id) VALUES ('NCC sai org', $1)`, [
              orgB,
            ]);
          }),
        /row-level security|row level security|policy/i,
        "WITH CHECK phải chặn INSERT sai org_id so với GUC",
      );

      await run(`DELETE FROM suppliers WHERE org_id IN (?, ?)`, orgA, orgB);
      await run(`DELETE FROM organizations WHERE id IN (?, ?)`, orgA, orgB);
    } finally {
      await appPool.end();
    }
  },
);

test(
  "RLS org (S02e, 0161): org_cost_settings lọc theo GUC app.org_id + WITH CHECK chặn ghi org khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const orgA = await insertId(`INSERT INTO organizations (name) VALUES ('Org RLS cost A')`);
    const orgB = await insertId(`INSERT INTO organizations (name) VALUES ('Org RLS cost B')`);
    const orgC = await insertId(`INSERT INTO organizations (name) VALUES ('Org RLS cost C')`);
    await run(
      `INSERT INTO org_cost_settings (org_id, warn_pct, over_pct) VALUES (?, 80, 95), (?, 50, 60)`,
      orgA,
      orgB,
    );
    const appPool = new Pool({ connectionString: appConnString(), max: 2 });
    try {
      const c = await appPool.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SELECT set_config('app.org_id', $1, true)`, [String(orgA)]);
        const rows = await c.query<{ org_id: number }>(
          `SELECT org_id FROM org_cost_settings WHERE org_id IN ($1, $2)`,
          [orgA, orgB],
        );
        assert.deepEqual(
          rows.rows.map((r) => r.org_id),
          [orgA],
          "GUC org A không được thấy ngưỡng chi phí org B",
        );
        // Dòng org B vô hình → UPDATE không chạm được; INSERT cho org khác (C) bị WITH CHECK chặn.
        const upd = await c.query(`UPDATE org_cost_settings SET warn_pct = 1 WHERE org_id = $1`, [
          orgB,
        ]);
        assert.equal(upd.rowCount, 0, "không sửa được ngưỡng org B");
        await assert.rejects(
          c.query(`INSERT INTO org_cost_settings (org_id, warn_pct, over_pct) VALUES ($1, 1, 2)`, [
            orgC,
          ]),
          /row-level security|row level security|policy/i,
          "WITH CHECK phải chặn ghi ngưỡng của org khác",
        );
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
    } finally {
      await appPool.end();
      await run(`DELETE FROM org_cost_settings WHERE org_id IN (?, ?, ?)`, orgA, orgB, orgC);
      await run(`DELETE FROM organizations WHERE id IN (?, ?, ?)`, orgA, orgB, orgC);
    }
  },
);
