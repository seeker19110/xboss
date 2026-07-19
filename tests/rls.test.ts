import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

// ===== Test tích hợp RLS (M51 PR1) — cần Postgres riêng qua TEST_DATABASE_URL =====
// RLS chỉ áp thật khi app chạy bằng role NOBYPASSRLS (không owner/superuser). TEST_DATABASE_URL
// thường trỏ superuser (chạy migration) — superuser BỎ QUA RLS. Vì vậy test mở POOL RIÊNG kết
// nối bằng role `xboss_app` (migration 0069 tạo, NOBYPASSRLS, mật khẩu placeholder) để kiểm RLS
// đúng như production.

// Đổi user/password của connection string sang xboss_app.
function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

test(
  "RLS: nhóm bảng tài chính lọc theo GUC app.project_id (đọc + WITH CHECK ghi)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    // Seed bằng owner (superuser bỏ qua RLS): 2 dự án + mỗi dự án 1 hợp đồng.
    const projA = await insertId(`INSERT INTO projects (name) VALUES ('RLS A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('RLS B')`);
    const suffix = `${projA}_${projB}`;
    const contractA = await insertId(
      `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'HĐ A', ?)`,
      `RLS-A-${suffix}`,
      projA,
    );
    await insertId(
      `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'HĐ B', ?)`,
      `RLS-B-${suffix}`,
      projB,
    );
    // payment_bills cho mỗi dự án (kiểm đọc lọc theo project_id).
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
       VALUES ('A', 'bill', 100, '2026-01-01', ?)`,
      projA,
    );
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
       VALUES ('B', 'bill', 200, '2026-01-01', ?)`,
      projB,
    );

    const appPool = new Pool({ connectionString: appConnString(), max: 3 });
    try {
      // Chạy fn trong transaction có set_config('app.project_id', ...) cục bộ (tự reset khi COMMIT).
      async function withGuc<T>(
        value: string | undefined,
        fn: (c: import("pg").PoolClient) => Promise<T>,
      ): Promise<T> {
        const c = await appPool.connect();
        try {
          await c.query("BEGIN");
          if (value !== undefined)
            await c.query(`SELECT set_config('app.project_id', $1, true)`, [value]);
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

      // (1) GUC = dự án A: SELECT không WHERE chỉ thấy dòng của A, KHÔNG thấy B.
      await withGuc(String(projA), async (c) => {
        const contracts = await c.query<{ project_id: number }>(`SELECT project_id FROM contracts`);
        assert.ok(contracts.rows.length > 0, "phải thấy ít nhất HĐ của A");
        assert.ok(
          contracts.rows.every((r) => r.project_id === projA),
          "GUC dự án A không được thấy hợp đồng dự án khác dù SQL không lọc project_id",
        );
        const bills = await c.query<{ project_id: number }>(`SELECT project_id FROM payment_bills`);
        assert.ok(
          bills.rows.every((r) => r.project_id === projA),
          "GUC dự án A không được thấy payment_bills dự án khác",
        );
      });

      // (2) GUC trống (chưa đặt) — giai đoạn chuyển tiếp PR1: nhánh IS NULL cho qua, đọc được cả 2.
      const allSeen = await appPool.query<{ project_id: number }>(
        `SELECT project_id FROM contracts WHERE project_id IN (${projA}, ${projB})`,
      );
      const seenProjects = new Set(allSeen.rows.map((r) => r.project_id));
      assert.ok(
        seenProjects.has(projA) && seenProjects.has(projB),
        "GUC trống (chưa đặt) phải đọc được cả 2 dự án ở PR1 (nhánh IS NULL)",
      );

      // (3) GUC = '*' — ngữ cảnh cross-project: thấy tất.
      await withGuc("*", async (c) => {
        const rows = await c.query<{ project_id: number }>(
          `SELECT project_id FROM contracts WHERE project_id IN (${projA}, ${projB})`,
        );
        const s = new Set(rows.rows.map((r) => r.project_id));
        assert.ok(s.has(projA) && s.has(projB), "GUC '*' phải thấy mọi dự án");
      });

      // (4a) GUC = A: INSERT payment_bills đúng project_id A → OK (WITH CHECK cho qua).
      await withGuc(String(projA), async (c) => {
        await c.query(
          `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
           VALUES ('A-ok', 'bill', 1, '2026-01-01', $1)`,
          [projA],
        );
      });

      // (4b) GUC = A: INSERT payment_bills SAI project_id (B) → bị WITH CHECK chặn.
      await assert.rejects(
        () =>
          withGuc(String(projA), async (c) => {
            await c.query(
              `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
               VALUES ('sai', 'bill', 1, '2026-01-01', $1)`,
              [projB],
            );
          }),
        /row-level security|row level security|policy/i,
        "WITH CHECK phải chặn INSERT sai project_id so với GUC",
      );

      // Dọn dữ liệu seed (bằng owner để không vướng RLS) — giữ DB test sạch.
      await run(`DELETE FROM payment_bills WHERE project_id IN (?, ?)`, projA, projB);
      await run(`DELETE FROM contracts WHERE id = ? OR project_id = ?`, contractA, projB);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
    } finally {
      await appPool.end();
    }
  },
);

// ===== M62 PR1: withProjectScope đọc-ghi (opts.readOnly) =====
test(
  "withProjectScope: readOnly:false cho phép ghi trong cùng transaction có GUC; mặc định vẫn chặn ghi",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, query, run, insertId } = await import("@/lib/db");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('RLS scope A')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('RLS scope test', ?, 'x', 'admin')`,
      `rls-scope-${projA}@test.local`,
    );
    try {
      // readOnly:false: GUC được set đúng, và ghi vào bảng KHÔNG-RLS (notifications) trong
      // cùng transaction thành công — đúng luồng notifications route (đọc bảng phạm vi RLS
      // rồi INSERT/DELETE notifications).
      const insertedId = await withProjectScope(
        projA,
        async () => {
          const guc = await query<{ v: string }>(
            `SELECT current_setting('app.project_id', true) AS v`,
          );
          assert.equal(guc[0]?.v, String(projA), "GUC app.project_id phải khớp projA");
          return insertId(
            `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', 'test M62')`,
            userId,
          );
        },
        { readOnly: false },
      );
      assert.ok(insertedId > 0, "INSERT trong transaction readOnly:false phải thành công");
      await run(`DELETE FROM notifications WHERE id = ?`, insertedId);

      // Mặc định (readOnly không truyền, tương đương true) — ghi phải bị Postgres chặn
      // bằng "cannot execute ... in a read-only transaction", không liên quan tới RLS.
      await assert.rejects(
        () =>
          withProjectScope(projA, async () => {
            await run(
              `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', 'must fail')`,
              userId,
            );
          }),
        /read-only transaction/i,
        "withProjectScope mặc định (readOnly:true) phải chặn ghi",
      );
    } finally {
      await run(`DELETE FROM users WHERE id = ?`, userId);
      await run(`DELETE FROM projects WHERE id = ?`, projA);
    }
  },
);
