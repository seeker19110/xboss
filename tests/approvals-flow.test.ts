import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Integration test M46 PR1 — engine phê duyệt: mở request → duyệt sai role 403 → SoD 403
// → duyệt đúng 2 bước → approved; reject chốt; duyệt trùng bước 409; fallback không flow.

const S = Date.now().toString(36); // hậu tố duy nhất chống đụng UNIQUE khi chạy lại cùng DB
// entity_id giả (INT) phải duy nhất mỗi lần chạy vì ux_request_live là UNIQUE toàn cục
// (entity_type, entity_id) — dùng base theo thời gian để rerun cục bộ không đụng dữ liệu cũ.
const EID = Date.now() % 1_000_00;

// Dọn dữ liệu tạo trong test: bảng `users` dùng CHUNG giữa mọi file test — để sót user/
// row tham chiếu (created_by/actor_id) làm vỡ `DELETE FROM users` của tests/auth.test.ts
// ở file khác (đã xảy ra thật — xem comment trong auth.test.ts). Xoá theo đúng thứ tự FK:
// approval_requests trước (cascade approval_actions) → approval_flows (cascade steps) →
// users → projects.
async function cleanup(ids: {
  projectId: number;
  userIds: number[];
  flowId?: number;
  entityType?: string;
  entityIds?: number[];
}) {
  const { run } = await import("@/lib/db");
  if (ids.entityType && ids.entityIds?.length) {
    await run(
      `DELETE FROM approval_requests WHERE entity_type = ? AND entity_id = ANY(?)`,
      ids.entityType,
      ids.entityIds,
    );
  }
  if (ids.flowId != null) await run(`DELETE FROM approval_flows WHERE id = ?`, ids.flowId);
  if (ids.userIds.length) await run(`DELETE FROM users WHERE id = ANY(?)`, ids.userIds);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

// Dựng 1 project + users theo vai trò + flow 2 bước (pm → cdt). Trả các id cần dùng.
async function seed(entityType: string) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES (?)`,
    `APRV ${entityType} ${S}`,
  );
  const mk = (role: string) =>
    insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
      `${role} ${entityType} ${S}`,
      `aprv-${role}-${entityType}-${S}@x.test`,
      role,
    );
  const creator = await mk("engineer");
  const pm = await mk("pm");
  const cdt = await mk("cdt");
  const admin = await mk("admin");
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, ?, ?)`,
    projectId,
    entityType,
    `Flow ${entityType} ${S}`,
  );
  await insertId(
    `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
    flowId,
  );
  await insertId(
    `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'cdt', NULL)`,
    flowId,
  );
  return { projectId, creator, pm, cdt, admin, flowId };
}

test(
  "openApproval → duyệt sai role / SoD / view-only bị 403, đúng 2 bước → approved",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval, advanceApproval, pendingForUser } = await import("@/lib/approvals");
    const { queryOne } = await import("@/lib/db");
    const seeded = await seed("variation");
    const { projectId, creator, pm, cdt, admin, flowId } = seeded;
    const entityId = EID * 10 + 1;

    try {
      const req = await openApproval({
        entityType: "variation",
        entityId,
        projectId,
        amount: 500,
        user: { id: creator, role: "engineer" },
      });
      assert.ok(req, "phải mở được request khi có flow");
      assert.equal(req!.status, "pending");
      assert.equal(req!.currentSeq, 1);

      // Idempotent: mở lại trả đúng request cũ, không tạo trùng.
      const again = await openApproval({
        entityType: "variation",
        entityId,
        projectId,
        amount: 500,
        user: { id: creator, role: "engineer" },
      });
      assert.equal(again!.id, req!.id);

      // Sai vai trò (cdt duyệt khi bước 1 là pm) → 403.
      await assert.rejects(
        advanceApproval({
          entityType: "variation",
          entityId,
          user: { id: cdt, role: "cdt" },
          decision: "approve",
        }),
        (e: { status?: number }) => e.status === 403,
      );

      // View-only (viewer) → 403 dù không phải role bước.
      await assert.rejects(
        advanceApproval({
          entityType: "variation",
          entityId,
          user: { id: 999999, role: "viewer" },
          decision: "approve",
        }),
        (e: { status?: number }) => e.status === 403,
      );

      // SoD: người tạo (nếu là pm) không tự duyệt — dùng creator giả vai trò pm.
      await assert.rejects(
        advanceApproval({
          entityType: "variation",
          entityId,
          user: { id: creator, role: "pm" },
          decision: "approve",
        }),
        (e: { status?: number }) => e.status === 403 && /tự duyệt/.test((e as Error).message),
      );

      // Hộp thư: pm thấy request đang chờ bước 1 (không phải người tạo).
      const inbox = await pendingForUser({ id: pm, role: "pm" }, projectId);
      assert.ok(inbox.some((i) => i.entityId === entityId && i.stepRole === "pm"));

      // Bước 1 pm duyệt → chuyển sang bước 2 (cdt).
      const r1 = await advanceApproval({
        entityType: "variation",
        entityId,
        user: { id: pm, role: "pm" },
        decision: "approve",
      });
      assert.deepEqual(r1, { status: "pending", currentSeq: 2, nextRole: "cdt" });

      // pm duyệt lại (giờ bước là cdt) → 403 sai role.
      await assert.rejects(
        advanceApproval({
          entityType: "variation",
          entityId,
          user: { id: pm, role: "pm" },
          decision: "approve",
        }),
        (e: { status?: number }) => e.status === 403,
      );

      // Bước 2 cdt duyệt → approved.
      const r2 = await advanceApproval({
        entityType: "variation",
        entityId,
        user: { id: cdt, role: "cdt" },
        decision: "approve",
      });
      assert.deepEqual(r2, { status: "approved" });

      const row = await queryOne<{ status: string }>(
        `SELECT status FROM approval_requests WHERE entity_type = 'variation' AND entity_id = ?`,
        entityId,
      );
      assert.equal(row!.status, "approved");

      // Không còn request pending → advance nữa trả 404.
      await assert.rejects(
        advanceApproval({
          entityType: "variation",
          entityId,
          user: { id: cdt, role: "cdt" },
          decision: "approve",
        }),
        (e: { status?: number }) => e.status === 404,
      );
    } finally {
      await cleanup({
        projectId,
        userIds: [creator, pm, cdt, admin],
        flowId,
        entityType: "variation",
        entityIds: [entityId],
      });
    }
  },
);

test("reject chốt request ngay tại bước hiện tại", { skip: !HAS_TEST_DB }, async () => {
  const { openApproval, advanceApproval } = await import("@/lib/approvals");
  const { queryOne } = await import("@/lib/db");
  const { projectId, creator, pm, cdt, admin, flowId } = await seed("payment_cert");
  const entityId = EID * 10 + 2;

  try {
    await openApproval({
      entityType: "payment_cert",
      entityId,
      projectId,
      amount: 100,
      user: { id: creator, role: "engineer" },
    });
    const r = await advanceApproval({
      entityType: "payment_cert",
      entityId,
      user: { id: pm, role: "pm" },
      decision: "reject",
      note: "Thiếu hồ sơ",
    });
    assert.deepEqual(r, { status: "rejected" });
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ?`,
      entityId,
    );
    assert.equal(row!.status, "rejected");
  } finally {
    await cleanup({
      projectId,
      userIds: [creator, pm, cdt, admin],
      flowId,
      entityType: "payment_cert",
      entityIds: [entityId],
    });
  }
});

test(
  "UNIQUE(request_id, step_seq) chặn duyệt trùng bước → 409",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval, advanceApproval } = await import("@/lib/approvals");
    const { run } = await import("@/lib/db");
    const { projectId, creator, pm, cdt, admin, flowId } = await seed("proposal");
    const entityId = EID * 10 + 5;

    try {
      const req = await openApproval({
        entityType: "proposal",
        entityId,
        projectId,
        amount: 100,
        user: { id: creator, role: "engineer" },
      });
      // Chèn sẵn 1 action ở bước 1 (mô phỏng đã có quyết định bước này). advanceApproval
      // của pm sau đó INSERT trùng (request_id, step_seq) → 23505 → 409.
      await run(
        `INSERT INTO approval_actions (request_id, step_seq, actor_id, decision) VALUES (?, 1, ?, 'approve')`,
        req!.id,
        pm,
      );
      await assert.rejects(
        advanceApproval({
          entityType: "proposal",
          entityId,
          user: { id: pm, role: "pm" },
          decision: "approve",
        }),
        (e: { status?: number }) => e.status === 409,
      );
    } finally {
      await cleanup({
        projectId,
        userIds: [creator, pm, cdt, admin],
        flowId,
        entityType: "proposal",
        entityIds: [entityId],
      });
    }
  },
);

test(
  "amount dưới mọi ngưỡng → không bước hiệu lực → auto-approved khi mở",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval } = await import("@/lib/approvals");
    const { insertId } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `APRV auto ${S}`);
    const creator = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'engineer', 'x')`,
      `auto ${S}`,
      `aprv-auto-${S}@x.test`,
    );
    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'proposal', ?)`,
      projectId,
      `Flow auto ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', 1000)`,
      flowId,
    );
    const entityId = EID * 10 + 3;
    try {
      const req = await openApproval({
        entityType: "proposal",
        entityId,
        projectId,
        amount: 10, // < 1000 → bước duy nhất bị loại → duyệt sẵn
        user: { id: creator, role: "engineer" },
      });
      assert.equal(req!.status, "approved");
    } finally {
      await cleanup({
        projectId,
        userIds: [creator],
        flowId,
        entityType: "proposal",
        entityIds: [entityId],
      });
    }
  },
);

test(
  "không có flow → openApproval trả null (caller giữ hành vi cũ)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval } = await import("@/lib/approvals");
    const { insertId } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `APRV noflow ${S}`);
    try {
      const req = await openApproval({
        entityType: "task_acceptance",
        entityId: EID * 10 + 4,
        projectId,
        amount: null,
        user: { id: 1, role: "engineer" },
      });
      assert.equal(req, null);
    } finally {
      await cleanup({ projectId, userIds: [] });
    }
  },
);
