import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

// ===== RLS cho engineering_cross_project_lessons (migrations/0152_lessons_rls.sql) =====
// Đóng nợ kỹ thuật ghi ở đợt audit 2026-09-05: bảng này là bảng engineering_* DUY NHẤT của
// 0098 không bật RLS, trong khi nội dung là sự cố + nguyên nhân gốc của dự án — đúng loại dữ
// liệu không được rò sang tổ chức khác.
//
// Ranh giới ở đây là TỔ CHỨC, không phải dự án: tính năng vốn là "bài học XUYÊN DỰ ÁN" nên
// policy so một `app.project_id` sẽ giết chính tính năng (xem comment trong migration).
//
// Cùng phương pháp tests/org-rls.test.ts: mở pool riêng bằng role xboss_app (NOBYPASSRLS) —
// owner/superuser của TEST_DATABASE_URL bỏ qua RLS nên không kiểm được bằng nó.

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

test(
  "RLS lessons: bài học lọc theo org của dự án nguồn — xuyên dự án CÙNG org vẫn thấy, xuyên org thì không",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, query } = await import("@/lib/db");
    const uniq = Date.now().toString(36);

    // Seed bằng owner (bỏ qua RLS): 2 org × 2 dự án; org A có HAI dự án để kiểm đúng tính
    // chất "xuyên dự án trong cùng org vẫn đọc được".
    const orgA = await insertId(
      `INSERT INTO organizations (name, slug) VALUES ('Org bài học A', ?)`,
      `org-lesson-a-${uniq}`,
    );
    const orgB = await insertId(
      `INSERT INTO organizations (name, slug) VALUES ('Org bài học B', ?)`,
      `org-lesson-b-${uniq}`,
    );
    const duAnA1 = await insertId(
      `INSERT INTO projects (name, org_id) VALUES ('DA bài học A1', ?)`,
      orgA,
    );
    const duAnA2 = await insertId(
      `INSERT INTO projects (name, org_id) VALUES ('DA bài học A2', ?)`,
      orgA,
    );
    const duAnB = await insertId(
      `INSERT INTO projects (name, org_id) VALUES ('DA bài học B', ?)`,
      orgB,
    );

    const themBaiHoc = (projectId: number, vanDe: string) =>
      query<{ id: string }>(
        `INSERT INTO engineering_cross_project_lessons
           (source_project_id, observed_problem, root_cause, prescribed_preventative_action)
         VALUES (?, ?, 'nguyên nhân gốc', 'hành động phòng ngừa') RETURNING id`,
        projectId,
        vanDe,
      ).then((r) => r[0].id);

    const baiHocA1 = await themBaiHoc(duAnA1, `Sự cố A1 ${uniq}`);
    const baiHocA2 = await themBaiHoc(duAnA2, `Sự cố A2 ${uniq}`);
    const baiHocB = await themBaiHoc(duAnB, `Sự cố B ${uniq}`);

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

      const doc = (c: import("pg").PoolClient) =>
        c.query<{ id: string }>(
          `SELECT id FROM engineering_cross_project_lessons WHERE id = ANY($1::uuid[])`,
          [[baiHocA1, baiHocA2, baiHocB]],
        );

      // (1) GUC = org A: thấy CẢ HAI bài học của 2 dự án khác nhau trong org A (đây là điểm
      // của tính năng), nhưng KHÔNG thấy bài học org B — dù câu SQL không lọc gì.
      await withGuc(String(orgA), async (c) => {
        const ids = (await doc(c)).rows.map((r) => r.id);
        assert.ok(ids.includes(baiHocA1), "phải thấy bài học dự án A1");
        assert.ok(ids.includes(baiHocA2), "xuyên dự án trong cùng org phải thấy được");
        assert.ok(!ids.includes(baiHocB), "KHÔNG được thấy bài học của tổ chức khác");
      });

      // (2) GUC = org B: đối xứng.
      await withGuc(String(orgB), async (c) => {
        const ids = (await doc(c)).rows.map((r) => r.id);
        assert.deepEqual(ids, [baiHocB], "org B chỉ thấy đúng bài học của mình");
      });

      // (3) Ghi: WITH CHECK chặn gắn bài học vào dự án của org khác.
      await assert.rejects(
        () =>
          withGuc(String(orgA), (c) =>
            c.query(
              `INSERT INTO engineering_cross_project_lessons
                 (source_project_id, observed_problem, root_cause, prescribed_preventative_action)
               VALUES ($1, 'chèn xuyên org', 'x', 'y')`,
              [duAnB],
            ),
          ),
        /row-level security/i,
        "chèn bài học vào dự án org khác phải bị RLS chặn",
      );

      // (4) GUC rỗng — giai đoạn chuyển tiếp giống 0080: vẫn cho qua (đường đọc hiện tại
      // chưa bọc withTransaction nên chưa có GUC). Khoá cửa là việc riêng, làm sau.
      const khongGuc = await appPool.query<{ id: string }>(
        `SELECT id FROM engineering_cross_project_lessons WHERE id = ANY($1::uuid[])`,
        [[baiHocA1, baiHocB]],
      );
      assert.equal(khongGuc.rows.length, 2, "GUC rỗng vẫn cho qua (chưa khoá cửa)");
    } finally {
      await appPool.end();
    }
  },
);
