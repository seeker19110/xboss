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
  "RLS org: bảng suppliers lọc theo GUC app.org_id (đọc + WITH CHECK ghi), GUC rỗng cho qua (giai đoạn chuyển tiếp PR3)",
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

      // (2) GUC trống (chưa đặt) — giai đoạn chuyển tiếp PR3: vẫn cho qua (chưa khoá cửa).
      const allSeen = await appPool.query<{ org_id: number }>(
        `SELECT org_id FROM suppliers WHERE id IN ($1, $2)`,
        [supA, supB],
      );
      assert.equal(
        allSeen.rows.length,
        2,
        "GUC trống phải cho qua ở giai đoạn chuyển tiếp PR3 (chưa khoá cửa)",
      );

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
