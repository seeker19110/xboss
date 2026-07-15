import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Integration test M46 PR3 — engine phê duyệt gắn vào nghiệm thu task ('task_acceptance',
// amount luôn NULL — app/api/tasks/[id]/approve + app/api/approvals) và đề xuất ('proposal',
// amount = proposals.amount — app/api/proposals + .../decide). Cùng cách tiếp cận với
// tests/approvals-vo-ipc.test.ts: route không test trực tiếp được (dùng next/headers) nên
// tái hiện đúng entity_type/amount + câu SQL "liveRequest" mà route dùng.

const S = Date.now().toString(36);

async function cleanupCommon(ids: { projectId: number; userIds: number[]; flowId?: number }) {
  const { run } = await import("@/lib/db");
  if (ids.flowId != null) await run(`DELETE FROM approval_flows WHERE id = ?`, ids.flowId);
  if (ids.userIds.length) await run(`DELETE FROM users WHERE id = ANY(?)`, ids.userIds);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

test(
  "Task acceptance: flow 1 bước (pm) — mỗi task 1 request, amount NULL, entity_type 'task_acceptance'",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { openApproval, advanceApproval, decideNext } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `TASK-APRV ${S}`);
    const mk = (role: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `task-${role} ${S}`,
        `task-aprv-${role}-${S}@x.test`,
        role,
      );
    const engineer = await mk("engineer");
    const pm = await mk("pm");

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'task_acceptance', ?)`,
      projectId,
      `Task flow ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );

    const taskId = await insertId(
      `INSERT INTO tasks (code, name, progress_percent) VALUES (?, 'Task test engine', 1)`,
      `TASK-ENGINE-${S}`,
    );

    try {
      // Bulk floor route (app/api/approvals) chỉ cho phép duyệt hàng loạt khi flow có ĐÚNG
      // 1 bước hiệu lực — xác nhận decideNext không còn bước kế sau bước đầu.
      const flow = (await (
        await import("@/lib/approvals")
      ).getActiveFlow("task_acceptance", projectId))!;
      const first = decideNext(flow.steps, null, 0);
      assert.equal(first?.role, "pm");
      assert.equal(decideNext(flow.steps, null, first!.seq), null);

      const req = await openApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        projectId,
        amount: null,
        user: { id: engineer, role: "engineer" },
      });
      assert.equal(req!.status, "pending");
      assert.equal(req!.currentSeq, 1);

      // Câu SQL "liveRequest" route dùng để quyết định có gate qua engine không.
      const live = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ? AND status = 'pending'`,
        taskId,
      );
      assert.ok(live, "route phải thấy request pending để gate qua engine");

      const result = await advanceApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        user: { id: pm, role: "pm" },
        decision: "approve",
      });
      assert.deepEqual(result, { status: "approved" });

      // Idempotent: gọi lại openApproval sau khi đã approved → mở request MỚI (không phải
      // trả lại request cũ, vì existing() chỉ khớp status='pending') — đúng ý nghĩa "mỗi
      // lần thi công lại/nghiệm thu lại là 1 vòng duyệt mới".
      const req2 = await openApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        projectId,
        amount: null,
        user: { id: engineer, role: "engineer" },
      });
      assert.notEqual(req2!.id, req!.id);
      await run(`DELETE FROM approval_requests WHERE id = ?`, req2!.id);
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ?`,
        taskId,
      );
      await run(`DELETE FROM tasks WHERE id = ?`, taskId);
      await cleanupCommon({ projectId, userIds: [engineer, pm], flowId });
    }
  },
);

test(
  "Task acceptance: flow 2 bước (engineer→pm) — reject ở bước 1 chốt ngay, task KHÔNG nghiệm thu",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { openApproval, advanceApproval } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `TASK2-APRV ${S}`);
    const mk = (label: string, role: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `task2-${label} ${S}`,
        `task2-aprv-${label}-${S}@x.test`,
        role,
      );
    const creator = await mk("creator", "engineer");
    const engineer = await mk("engineer", "engineer");
    const pm = await mk("pm", "pm");

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'task_acceptance', ?)`,
      projectId,
      `Task flow 2 bước ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'engineer', NULL)`,
      flowId,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'pm', NULL)`,
      flowId,
    );

    const taskId = await insertId(
      `INSERT INTO tasks (code, name, progress_percent) VALUES (?, 'Task test reject', 1)`,
      `TASK-REJECT-${S}`,
    );

    try {
      await openApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        projectId,
        amount: null,
        user: { id: creator, role: "engineer" },
      });

      const r = await advanceApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        user: { id: engineer, role: "engineer" },
        decision: "reject",
        note: "Chưa đạt tiêu chuẩn nghiệm thu",
      });
      assert.deepEqual(r, { status: "rejected" });

      const stillLive = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ? AND status = 'pending'`,
        taskId,
      );
      assert.equal(stillLive, undefined, "reject phải chốt request, không còn pending");

      const task = await queryOne<{ status: string }>(
        `SELECT status FROM tasks WHERE id = ?`,
        taskId,
      );
      assert.notEqual(task?.status, "nghiem_thu", "task KHÔNG được set nghiem_thu khi bị reject");
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ?`,
        taskId,
      );
      await run(`DELETE FROM tasks WHERE id = ?`, taskId);
      await cleanupCommon({ projectId, userIds: [creator, engineer, pm], flowId });
    }
  },
);

test(
  "Proposal: flow 2 bước (pm→cdt) gate đúng qua entity_type 'proposal', amount = proposals.amount",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { openApproval, advanceApproval } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `DX-APRV ${S}`);
    const mk = (label: string, role: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `dx-${label} ${S}`,
        `dx-aprv-${label}-${S}@x.test`,
        role,
      );
    const creator = await mk("creator", "engineer");
    const pm = await mk("pm", "pm");
    const cdt = await mk("cdt", "cdt");

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'proposal', ?)`,
      projectId,
      `DX flow ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'cdt', NULL)`,
      flowId,
    );

    const proposalId = await insertId(
      `INSERT INTO proposals (code, kind, title, amount, status, requested_by, project_id)
       VALUES (?, 'advance', 'Đề xuất test engine', 15000000, 'submitted', ?, ?)`,
      `DX-TEST-${S}`,
      creator,
      projectId,
    );

    try {
      const req = await openApproval({
        entityType: "proposal",
        entityId: proposalId,
        projectId,
        amount: 15000000,
        user: { id: creator, role: "engineer" },
      });
      assert.equal(req!.status, "pending");
      assert.equal(req!.amount, 15000000);

      const live = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'proposal' AND entity_id = ? AND status = 'pending'`,
        proposalId,
      );
      assert.ok(live, "route phải thấy request pending để gate qua engine");

      const r1 = await advanceApproval({
        entityType: "proposal",
        entityId: proposalId,
        user: { id: pm, role: "pm" },
        decision: "approve",
      });
      assert.deepEqual(r1, { status: "pending", currentSeq: 2, nextRole: "cdt" });

      const r2 = await advanceApproval({
        entityType: "proposal",
        entityId: proposalId,
        user: { id: cdt, role: "cdt" },
        decision: "approve",
      });
      assert.deepEqual(r2, { status: "approved" });
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'proposal' AND entity_id = ?`,
        proposalId,
      );
      await run(`DELETE FROM proposals WHERE id = ?`, proposalId);
      await cleanupCommon({ projectId, userIds: [creator, pm, cdt], flowId });
    }
  },
);

test(
  "pendingForUserDisplay: gắn đúng nhãn 'mã — tên' + linkUrl cho proposal, loại trừ request do chính người duyệt tạo (SoD)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { openApproval, pendingForUserDisplay } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `DX-DISP ${S}`);
    const mk = (label: string, role: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `dxd-${label} ${S}`,
        `dxd-aprv-${label}-${S}@x.test`,
        role,
      );
    const creator = await mk("creator", "engineer");
    const pm = await mk("pm", "pm");

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'proposal', ?)`,
      projectId,
      `DX flow disp ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );

    const proposalId = await insertId(
      `INSERT INTO proposals (code, kind, title, amount, status, requested_by, project_id)
       VALUES (?, 'advance', 'Đề xuất test nhãn', 1000, 'submitted', ?, ?)`,
      `DX-DISP-${S}`,
      creator,
      projectId,
    );

    try {
      await openApproval({
        entityType: "proposal",
        entityId: proposalId,
        projectId,
        amount: 1000,
        user: { id: creator, role: "engineer" },
      });

      const pmInbox = await pendingForUserDisplay({ id: pm, role: "pm" }, projectId);
      assert.equal(pmInbox.length, 1);
      assert.equal(pmInbox[0].label, `DX-DISP-${S} — Đề xuất test nhãn`);
      assert.equal(pmInbox[0].linkUrl, "/proposals");

      // SoD: người tạo (dù giả sử có vai trò pm) không thấy chính request mình tạo.
      const creatorInbox = await pendingForUserDisplay({ id: creator, role: "pm" }, projectId);
      assert.equal(creatorInbox.length, 0);
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'proposal' AND entity_id = ?`,
        proposalId,
      );
      await run(`DELETE FROM proposals WHERE id = ?`, proposalId);
      await cleanupCommon({ projectId, userIds: [creator, pm], flowId });
    }
  },
);
