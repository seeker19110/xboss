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

      // (2) GUC trống (chưa đặt) — M62 PR2 "khoá cửa": nhánh cho-qua đã bị bỏ, không có GUC
      // thì RLS trả RỖNG (không lộ dòng nào của cả 2 dự án).
      const allSeen = await appPool.query<{ project_id: number }>(
        `SELECT project_id FROM contracts WHERE project_id IN (${projA}, ${projB})`,
      );
      assert.equal(
        allSeen.rows.length,
        0,
        "GUC trống (chưa đặt) phải trả 0 dòng sau khi khoá cửa (M62 PR2)",
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

// ===== C3 §3 (PR2): RLS + bất biến chéo dự án cho nhóm engineering_* =====
// Hai lớp phòng thủ ĐỘC LẬP, test riêng từng lớp:
//   - migrations/0091: composite FK chặn tham chiếu chéo dự án ngay ở tầng DB (áp cho MỌI
//     role, kể cả superuser) — kiểm bằng pool owner;
//   - migrations/0092: policy RLS lọc theo GUC app.project_id — chỉ có hiệu lực với role
//     NOBYPASSRLS, nên BẮT BUỘC kiểm bằng pool `xboss_app` (superuser bỏ qua RLS hoàn toàn).
test(
  "Engineering: composite FK (0091) chặn mọi tham chiếu chéo dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, queryOne, insertId } = await import("@/lib/db");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('ENG RLS A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('ENG RLS B')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('ENG RLS', ?, 'x', 'admin')`,
      `eng-rls-${projA}@test.local`,
    );
    try {
      // Dự án A: source + revision + object.
      const srcA = await queryOne<{ id: string }>(
        `INSERT INTO engineering_sources (project_id, source_type, title, created_by)
         VALUES (?, 'drawing', 'A', ?) RETURNING id`,
        projA,
        userId,
      );
      const revA = await queryOne<{ id: string }>(
        `INSERT INTO engineering_source_revisions (source_id, project_id, revision_no, created_by)
         VALUES (?, ?, 1, ?) RETURNING id`,
        srcA!.id,
        projA,
        userId,
      );
      const objA = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, object_type, created_by, updated_by)
         VALUES (?, 'component', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );

      // Dự án B: package + suggestion (cha của evidence).
      const pkgB = await queryOne<{ id: string }>(
        `INSERT INTO engineering_intelligence_packages (project_id, objective)
         VALUES (?, 'B') RETURNING id`,
        projB,
      );
      const sugB = await queryOne<{ id: string }>(
        `INSERT INTO engineering_suggestions (project_id, package_id, suggestion_class, title, priority)
         VALUES (?, ?, 'design', 'B', 'quality') RETURNING id`,
        projB,
        pkgB!.id,
      );

      // (1) evidence của suggestion B trỏ source_revision của A → phải bị FK chặn.
      await assert.rejects(
        () =>
          run(
            `INSERT INTO engineering_evidence (suggestion_id, project_id, source_revision_id, kind, statement)
             VALUES (?, ?, ?, 'fact', 'x')`,
            sugB!.id,
            projB,
            revA!.id,
          ),
        /foreign key constraint/i,
        "evidence không được trỏ source_revision của dự án khác",
      );

      // (2) evidence của suggestion B trỏ object của A → phải bị FK chặn.
      await assert.rejects(
        () =>
          run(
            `INSERT INTO engineering_evidence (suggestion_id, project_id, object_id, kind, statement)
             VALUES (?, ?, ?, 'fact', 'x')`,
            sugB!.id,
            projB,
            objA!.id,
          ),
        /foreign key constraint/i,
        "evidence không được trỏ object của dự án khác",
      );

      // (3) suggestion B trỏ package của A → phải bị FK chặn.
      const pkgA = await queryOne<{ id: string }>(
        `INSERT INTO engineering_intelligence_packages (project_id, objective)
         VALUES (?, 'A') RETURNING id`,
        projA,
      );
      await assert.rejects(
        () =>
          run(
            `INSERT INTO engineering_suggestions (project_id, package_id, suggestion_class, title, priority)
             VALUES (?, ?, 'design', 'cheo', 'quality')`,
            projB,
            pkgA!.id,
          ),
        /foreign key constraint/i,
        "suggestion không được trỏ package của dự án khác",
      );

      // (4) project_id của CON lệch cha → FK con–cha chặn (dù không trỏ chéo đi đâu).
      await assert.rejects(
        () =>
          run(
            `INSERT INTO engineering_evidence (suggestion_id, project_id, kind, statement)
             VALUES (?, ?, 'fact', 'x')`,
            sugB!.id,
            projA,
          ),
        /foreign key constraint/i,
        "evidence phải cùng project_id với suggestion cha",
      );

      // (5) ĐỐI CHỨNG — cùng dự án thì vẫn chèn được bình thường (không chặn nhầm).
      await run(
        `INSERT INTO engineering_evidence (suggestion_id, project_id, kind, statement)
         VALUES (?, ?, 'fact', 'hop le')`,
        sugB!.id,
        projB,
      );
      const ok = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM engineering_evidence WHERE suggestion_id = ?`,
        sugB!.id,
      );
      assert.equal(ok?.n, 1, "evidence cùng dự án phải chèn được");
    } finally {
      // Xoá dự án kéo theo toàn bộ engineering_* nhờ ON DELETE CASCADE.
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);

test(
  "Engineering: RLS (0092) lọc theo GUC app.project_id, kể cả BẢNG CON",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, queryOne, insertId } = await import("@/lib/db");

    // Seed bằng owner (superuser bỏ qua RLS nên dựng được cả 2 dự án).
    const projA = await insertId(`INSERT INTO projects (name) VALUES ('ENG POL A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('ENG POL B')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('ENG POL', ?, 'x', 'admin')`,
      `eng-pol-${projA}@test.local`,
    );
    const wfA = await queryOne<{ id: string }>(
      `INSERT INTO engineering_workflows (project_id, title, profile, risk_class, created_by)
       VALUES (?, 'A wf', 'A', 'low', ?) RETURNING id`,
      projA,
      userId,
    );
    // Bảng CON — chính là thứ 0091 mới cấp cột project_id để 0092 viết được policy.
    await run(
      `INSERT INTO engineering_workflow_gates (workflow_id, project_id, seq, gate_type, required_role)
       VALUES (?, ?, 1, 'technical_review', 'pm')`,
      wfA!.id,
      projA,
    );

    const appPool = new Pool({ connectionString: appConnString(), max: 3 });
    try {
      async function countAs(guc: string | undefined, sql: string): Promise<number> {
        const c = await appPool.connect();
        try {
          await c.query("BEGIN");
          if (guc !== undefined)
            await c.query(`SELECT set_config('app.project_id', $1, true)`, [guc]);
          const r = await c.query<{ n: string }>(sql);
          await c.query("COMMIT");
          return Number(r.rows[0].n);
        } finally {
          c.release();
        }
      }

      const gatesSql = `SELECT COUNT(*) AS n FROM engineering_workflow_gates WHERE workflow_id = '${wfA!.id}'`;
      const wfSql = `SELECT COUNT(*) AS n FROM engineering_workflows WHERE id = '${wfA!.id}'`;

      assert.equal(await countAs(String(projA), wfSql), 1, "GUC dự án A phải thấy workflow của A");
      assert.equal(
        await countAs(String(projA), gatesSql),
        1,
        "GUC dự án A phải thấy gate (bảng con) của A",
      );

      assert.equal(
        await countAs(String(projB), wfSql),
        0,
        "GUC dự án B KHÔNG được thấy workflow của A",
      );
      assert.equal(
        await countAs(String(projB), gatesSql),
        0,
        "GUC dự án B KHÔNG được thấy gate của A — bảng con cũng phải bị lọc",
      );

      // Không có GUC → RỖNG. C3 §3: "Không có nhánh missing context → allow".
      assert.equal(await countAs(undefined, wfSql), 0, "thiếu GUC phải trả rỗng, không cho qua");
      assert.equal(await countAs(undefined, gatesSql), 0, "thiếu GUC phải trả rỗng ở cả bảng con");

      // '*' = ngữ cảnh cross-project hợp lệ.
      assert.equal(await countAs("*", wfSql), 1, "GUC '*' phải thấy mọi dự án");
      assert.equal(await countAs("*", gatesSql), 1, "GUC '*' phải thấy bảng con của mọi dự án");

      // WITH CHECK: ghi sang dự án khác GUC → bị chặn.
      await assert.rejects(
        async () => {
          const c = await appPool.connect();
          try {
            await c.query("BEGIN");
            await c.query(`SELECT set_config('app.project_id', $1, true)`, [String(projB)]);
            await c.query(
              `INSERT INTO engineering_workflows (project_id, title, profile, risk_class, created_by)
               VALUES ($1, 'ghi lan', 'A', 'low', $2)`,
              [projA, userId],
            );
            await c.query("COMMIT");
          } catch (e) {
            await c.query("ROLLBACK").catch(() => {});
            throw e;
          } finally {
            c.release();
          }
        },
        /row-level security|row level security|policy/i,
        "WITH CHECK phải chặn ghi sang dự án khác GUC",
      );
    } finally {
      await appPool.end();
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);
