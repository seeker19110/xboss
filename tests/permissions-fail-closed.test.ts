import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { SoFixture, jreq, P, goi } from "./helpers/chuoi-nghiep-vu";
import { test } from "node:test";
import assert from "node:assert/strict";

// A1-AC05 / Q-AC01 (GAP-4) — snapshot quyền fail-closed:
// (1) lỗi DB khi nạp snapshot ⇒ KHÔNG rơi về mặc định allow (CAN false, route lỗi chứ không 200),
//     kể cả khi cùng ngữ cảnh đã từng nạp thành công trước đó;
// (2) hai actor khác tổ chức/vai trò nạp snapshot ĐỒNG THỜI không dùng nhầm snapshot của nhau;
// (3) override deny cấp dự án ⇒ route nghiệm thu thật trả 403 dù user vẫn thấy dự án, DB không đổi.

const S = { skip: !HAS_TEST_DB };

// Cho mọi câu SQL chạm `role_permissions` qua client mượn từ pool ném lỗi (giả lập DB hỏng
// đúng lúc nạp snapshot quyền). Trả hàm gỡ.
async function hongDocQuyen(): Promise<() => void> {
  const { getPool } = await import("@/lib/db");
  const pool = getPool();
  const goc = pool.connect.bind(pool) as (...a: unknown[]) => Promise<unknown>;
  (pool as unknown as { connect: unknown }).connect = async (...ca: unknown[]) => {
    if (typeof ca[0] === "function") return goc(...ca);
    const client = (await goc()) as {
      query: (...a: unknown[]) => unknown;
      release: (e?: unknown) => void;
    };
    const q = client.query.bind(client);
    const rel = client.release.bind(client);
    client.query = (...a: unknown[]) => {
      const text = typeof a[0] === "string" ? a[0] : "";
      if (/role_permissions/.test(text)) return Promise.reject(new Error("DB hỏng giả lập"));
      return q(...a);
    };
    client.release = (e?: unknown) => {
      client.query = q;
      rel(e as Error | undefined);
    };
    return client;
  };
  return () => {
    (pool as unknown as { connect: unknown }).connect = goc;
  };
}

test(
  "A1-AC05/Q-AC01: lỗi DB khi nạp snapshot quyền ⇒ CAN từ chối, không dùng mặc định/snapshot cũ",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { CAN } = await import("@/lib/bao-mat/auth");
    const { invalidatePermissionCache } = await import("@/lib/bao-mat/permissions");
    const fx = new SoFixture();
    try {
      const pm = await fx.user("pm");
      const projectId = await fx.duAn("FC");
      await runWithRequestContext({ userId: pm.id, role: "pm", orgId: 1, projectId }, async () => {
        await invalidatePermissionCache(1);
        // Mặc định pm được duyệt + xem thanh toán khi snapshot nạp thành công.
        assert.equal(CAN.approve("pm"), true);
        assert.equal(CAN.viewPayments("pm"), true);
        const go = await hongDocQuyen();
        try {
          await assert.rejects(() => invalidatePermissionCache(1), /DB hỏng giả lập/);
        } finally {
          go();
        }
        // Snapshot đã bị thay bằng bản "đang nạp" → mọi quyền false, không giữ allow cũ.
        assert.equal(CAN.approve("pm"), false);
        assert.equal(CAN.viewPayments("pm"), false);
        assert.equal(CAN.editProgress("pm"), false);
      });
      // Ngữ cảnh mới chưa từng nạp snapshot (cold start) cũng không được allow mặc định.
      await runWithRequestContext({ userId: pm.id, role: "pm", orgId: 1 }, async () => {
        const go = await hongDocQuyen();
        try {
          await assert.rejects(() => invalidatePermissionCache(1));
        } finally {
          go();
        }
        assert.equal(CAN.viewPayments("pm"), false);
      });
      // Đối chứng: insertId/run dùng ở đây để chắc pool vẫn chạy bình thường sau khi gỡ lỗi giả.
      const probe = await insertId(`INSERT INTO organizations (name) VALUES ('FC probe')`);
      await run(`DELETE FROM organizations WHERE id = ?`, probe);
    } finally {
      await fx.don();
    }
  },
);

test(
  "A1-AC05/Q-AC01: lỗi DB khi nạp quyền qua route nghiệm thu thật ⇒ không 200, task không đổi",
  S,
  async () => {
    const { queryOne, run } = await import("@/lib/db");
    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    const fx = new SoFixture();
    try {
      const pm = await fx.user("pm");
      const projectId = await fx.duAn("FCR");
      const cay = await fx.wbs(projectId, { soO: 1 });
      await run(
        `UPDATE tasks SET progress_percent = 1, status = 'hoan_thanh' WHERE id = ?`,
        cay.taskId,
      );
      await fx.vao(pm, projectId);
      const go = await hongDocQuyen();
      let status: number | "throw";
      try {
        const res = await POST(jreq(`/api/tasks/${cay.taskId}/approve`, {}), P(cay.taskId)).catch(
          () => "throw" as const,
        );
        status = typeof res === "string" ? res : res.status;
      } finally {
        go();
      }
      // Next biến exception thành 500; điều cấm là 200 (duyệt bằng quyền mặc định).
      assert.ok(status === "throw" || status >= 500, `không được 2xx/4xx-quyền, nhận ${status}`);
      const t = await queryOne<{ status: string }>(
        `SELECT status FROM tasks WHERE id = ?`,
        cay.taskId,
      );
      assert.equal(t?.status, "hoan_thanh");
      const h = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM task_history WHERE task_id = ?`,
        cay.taskId,
      );
      assert.equal(h?.n, 0);
    } finally {
      await fx.don();
    }
  },
);

test(
  "A1-AC05/Q-AC01: hai actor khác tổ chức/vai trò nạp snapshot đồng thời không dùng nhầm của nhau",
  S,
  async () => {
    const { insertId, query, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { CAN } = await import("@/lib/bao-mat/auth");
    const { invalidatePermissionCache } = await import("@/lib/bao-mat/permissions");
    const orgs: number[] = [];
    const users: number[] = [];
    try {
      for (const ten of ["FC org A", "FC org B"])
        orgs.push(await insertId(`INSERT INTO organizations (name) VALUES (?)`, ten));
      const [orgA, orgB] = orgs;
      const viewerA = await insertId(
        `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('FC A', ?, 'x', 'viewer', ?)`,
        `fc-a-${orgA}@test.local`,
        orgA,
      );
      const pmB = await insertId(
        `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('FC B', ?, 'x', 'pm', ?)`,
        `fc-b-${orgB}@test.local`,
        orgB,
      );
      users.push(viewerA, pmB);
      // Org A: mở viewPayments cho viewer (mặc định đóng). Org B: siết approve của pm (mặc định mở)
      // và khoá viewPayments của viewer — nếu A dùng nhầm snapshot B sẽ mất quyền xem; nếu B dùng
      // nhầm snapshot A sẽ lấy lại quyền duyệt.
      await run(
        `INSERT INTO role_permissions (role, perm_key, allowed, project_id, org_id) VALUES
         ('viewer', 'viewPayments', true, NULL, ?),
         ('pm', 'approve', false, NULL, ?),
         ('viewer', 'viewPayments', false, NULL, ?)`,
        orgA,
        orgB,
        orgB,
      );
      const mot = (i: number) => {
        const laA = i % 2 === 0;
        const ctx = laA
          ? { userId: viewerA, role: "viewer", orgId: orgA }
          : { userId: pmB, role: "pm", orgId: orgB };
        return runWithRequestContext(ctx, async () => {
          await invalidatePermissionCache(ctx.orgId);
          // Nhường lượt để các request khác nạp snapshot chen giữa.
          await query(`SELECT pg_sleep(?)`, (i % 3) * 0.004);
          return {
            laA,
            viewPayments: CAN.viewPayments(ctx.role as "viewer" | "pm"),
            approve: CAN.approve(ctx.role as "viewer" | "pm"),
          };
        });
      };
      const kq = await Promise.all(Array.from({ length: 20 }, (_, i) => mot(i)));
      for (const r of kq) {
        if (r.laA) assert.deepEqual([r.viewPayments, r.approve], [true, false], "viewer org A");
        else
          assert.deepEqual(
            [r.viewPayments, r.approve],
            [true, false],
            "pm org B (approve bị siết)",
          );
      }
      // Đối chứng chéo: viewer org B (cùng vai trò với A) bị khoá xem thanh toán.
      await runWithRequestContext({ userId: pmB, role: "viewer", orgId: orgB }, async () => {
        await invalidatePermissionCache(orgB);
        assert.equal(CAN.viewPayments("viewer"), false);
      });
    } finally {
      if (orgs.length) await run(`DELETE FROM role_permissions WHERE org_id = ANY(?::int[])`, orgs);
      if (users.length) await run(`DELETE FROM users WHERE id = ANY(?::int[])`, users);
      if (orgs.length) await run(`DELETE FROM organizations WHERE id = ANY(?::int[])`, orgs);
    }
  },
);

test(
  "A1-AC05: override deny cấp dự án ⇒ POST /api/tasks/:id/approve trả 403, DB không đổi",
  S,
  async () => {
    const { queryOne, run } = await import("@/lib/db");
    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    const { visibleProjectIds } = await import("@/lib/ha-tang/projects");
    const fx = new SoFixture();
    try {
      const pm = await fx.user("pm");
      const projectId = await fx.duAn("DENY");
      const cay = await fx.wbs(projectId, { soO: 1 });
      await run(
        `UPDATE tasks SET progress_percent = 1, status = 'hoan_thanh' WHERE id = ?`,
        cay.taskId,
      );
      await fx.vao(pm, projectId);
      assert.ok((await visibleProjectIds({ id: pm.id, role: "pm", orgId: 1 })).includes(projectId));
      await run(
        `INSERT INTO role_permissions (role, perm_key, allowed, project_id, org_id)
       VALUES ('pm', 'approve', false, ?, 1)`,
        projectId,
      );
      try {
        const r = await goi(POST(jreq(`/api/tasks/${cay.taskId}/approve`, {}), P(cay.taskId)));
        assert.equal(r.status, 403, JSON.stringify(r.body));
        const t = await queryOne<{ status: string }>(
          `SELECT status FROM tasks WHERE id = ?`,
          cay.taskId,
        );
        assert.equal(t?.status, "hoan_thanh");
        const h = await queryOne<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM task_history WHERE task_id = ?`,
          cay.taskId,
        );
        assert.equal(h?.n, 0);
      } finally {
        await run(
          `DELETE FROM role_permissions WHERE role = 'pm' AND perm_key = 'approve' AND project_id = ?`,
          projectId,
        );
      }
      // Đối chứng: bỏ override → cùng user, cùng task được duyệt (403 ở trên là do override).
      const ok = await goi(POST(jreq(`/api/tasks/${cay.taskId}/approve`, {}), P(cay.taskId)));
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
    } finally {
      await fx.don();
    }
  },
);
