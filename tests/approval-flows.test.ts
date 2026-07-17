import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test M46 PR4 — CRUD cấu hình flow duyệt (Admin): validate thuần + integration
// createApprovalFlow/updateApprovalFlow/deleteApprovalFlow (lib/approvals.ts).

const S = Date.now().toString(36); // hậu tố duy nhất chống đụng UNIQUE khi chạy lại cùng DB

// ── Unit: validateFlowSteps / validateFlowInput (thuần, không chạm DB) ─────────

test("validateFlowSteps: seq có khoảng trống/trùng → lỗi", async () => {
  const { validateFlowSteps } = await import("@/lib/approvals");
  assert.match(
    validateFlowSteps([
      { seq: 1, role: "pm", minAmount: null, slaDays: null },
      { seq: 3, role: "cdt", minAmount: null, slaDays: null },
    ]) ?? "",
    /liên tục/,
  );
  assert.match(
    validateFlowSteps([
      { seq: 1, role: "pm", minAmount: null, slaDays: null },
      { seq: 1, role: "cdt", minAmount: null, slaDays: null },
    ]) ?? "",
    /liên tục/,
  );
});

test("validateFlowSteps: role không hợp lệ (bch/viewer/chuỗi rác) → lỗi, role cdt hợp lệ", async () => {
  const { validateFlowSteps } = await import("@/lib/approvals");
  assert.match(
    validateFlowSteps([{ seq: 1, role: "bch", minAmount: null, slaDays: null }]) ?? "",
    /không hợp lệ/,
  );
  assert.match(
    validateFlowSteps([{ seq: 1, role: "viewer", minAmount: null, slaDays: null }]) ?? "",
    /không hợp lệ/,
  );
  assert.match(
    validateFlowSteps([{ seq: 1, role: "khong-ton-tai", minAmount: null, slaDays: null }]) ?? "",
    /không hợp lệ/,
  );
  assert.equal(validateFlowSteps([{ seq: 1, role: "cdt", minAmount: null, slaDays: null }]), null);
});

test("validateFlowSteps: minAmount âm → lỗi", async () => {
  const { validateFlowSteps } = await import("@/lib/approvals");
  assert.match(
    validateFlowSteps([{ seq: 1, role: "pm", minAmount: -1, slaDays: null }]) ?? "",
    /min_amount/,
  );
});

test("validateFlowSteps: slaDays không nguyên hoặc <1 → lỗi", async () => {
  const { validateFlowSteps } = await import("@/lib/approvals");
  assert.match(
    validateFlowSteps([{ seq: 1, role: "pm", minAmount: null, slaDays: 0 }]) ?? "",
    /SLA/,
  );
  assert.match(
    validateFlowSteps([{ seq: 1, role: "pm", minAmount: null, slaDays: 1.5 }]) ?? "",
    /SLA/,
  );
});

test("validateFlowSteps: input hợp lệ đủ field → trả null", async () => {
  const { validateFlowSteps } = await import("@/lib/approvals");
  assert.equal(
    validateFlowSteps([
      { seq: 1, role: "pm", minAmount: 0, slaDays: 3 },
      { seq: 2, role: "cdt", minAmount: 500_000_000, slaDays: 7 },
    ]),
    null,
  );
});

test("validateFlowInput: loại thực thể không hợp lệ / thiếu tên → lỗi; hợp lệ → null", async () => {
  const { validateFlowInput } = await import("@/lib/approvals");
  assert.match(
    validateFlowInput({
      entityType: "khong-ton-tai",
      name: "Flow test",
      steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
    }) ?? "",
    /Loại thực thể/,
  );
  assert.match(
    validateFlowInput({
      entityType: "variation",
      name: "  ",
      steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
    }) ?? "",
    /tên/,
  );
  assert.equal(
    validateFlowInput({
      entityType: "variation",
      name: "Flow test",
      steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
    }),
    null,
  );
});

// ── Integration: CRUD flow ──────────────────────────────────────────────────────

async function cleanup(ids: { projectId: number; userIds?: number[]; flowIds?: number[] }) {
  const { run } = await import("@/lib/db");
  if (ids.flowIds?.length) {
    for (const id of ids.flowIds) {
      await run(`DELETE FROM approval_requests WHERE flow_id = ?`, id);
      await run(`DELETE FROM approval_flows WHERE id = ?`, id);
    }
  }
  if (ids.userIds?.length) await run(`DELETE FROM users WHERE id = ANY(?)`, ids.userIds);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

test(
  "createApprovalFlow: thành công → {id}, flow + đủ số bước ghi đúng DB",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, query } = await import("@/lib/db");
    const { createApprovalFlow } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `CRUD-FLOW ${S}`);
    let flowId: number | undefined;
    try {
      const result = await createApprovalFlow({
        projectId,
        entityType: "variation",
        name: `Flow tạo mới ${S}`,
        steps: [
          { seq: 1, role: "pm", minAmount: null, slaDays: 3 },
          { seq: 2, role: "cdt", minAmount: 500_000_000, slaDays: 5 },
        ],
      });
      assert.equal(typeof result, "object");
      flowId = (result as { id: number }).id;
      assert.ok(flowId > 0);

      const steps = await query<{ seq: number; role: string }>(
        `SELECT seq, role FROM approval_steps WHERE flow_id = ? ORDER BY seq`,
        flowId,
      );
      assert.equal(steps.length, 2);
      assert.deepEqual(
        steps.map((s) => s.role),
        ["pm", "cdt"],
      );
    } finally {
      await cleanup({ projectId, flowIds: flowId != null ? [flowId] : [] });
    }
  },
);

test(
  "createApprovalFlow: 2 flow active cùng entityType+projectId → lần 2 trả string lỗi (ux_flow_active)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId } = await import("@/lib/db");
    const { createApprovalFlow } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `DUP-FLOW ${S}`);
    let flowId: number | undefined;
    try {
      const r1 = await createApprovalFlow({
        projectId,
        entityType: "payment_cert",
        name: `Flow 1 ${S}`,
        steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
      });
      assert.equal(typeof r1, "object");
      flowId = (r1 as { id: number }).id;

      const r2 = await createApprovalFlow({
        projectId,
        entityType: "payment_cert",
        name: `Flow 2 ${S}`,
        steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
      });
      assert.equal(typeof r2, "string");
    } finally {
      await cleanup({ projectId, flowIds: flowId != null ? [flowId] : [] });
    }
  },
);

test(
  "updateApprovalFlow: bị chặn khi còn approval_requests pending cho flow đó → string chứa số lượng đang chờ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { createApprovalFlow, updateApprovalFlow, openApproval } =
      await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `UPD-PEND ${S}`);
    const userId = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'engineer', 'x')`,
      `upd-pend-user ${S}`,
      `upd-pend-${S}@x.test`,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (code, name, progress_percent) VALUES (?, 'Task pending update', 1)`,
      `TASK-UPD-PEND-${S}`,
    );
    let flowId: number | undefined;
    try {
      const created = await createApprovalFlow({
        projectId,
        entityType: "task_acceptance",
        name: `Flow chờ duyệt ${S}`,
        steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
      });
      flowId = (created as { id: number }).id;

      await openApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        projectId,
        amount: null,
        user: { id: userId, role: "engineer" },
      });

      const result = await updateApprovalFlow(flowId, { name: `Đổi tên ${S}` });
      assert.equal(typeof result, "string");
      assert.match(result as string, /1.*đang chờ|đang chờ.*1/);
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ?`,
        taskId,
      );
      await run(`DELETE FROM tasks WHERE id = ?`, taskId);
      await cleanup({ projectId, userIds: [userId], flowIds: flowId != null ? [flowId] : [] });
    }
  },
);

test(
  "updateApprovalFlow: thành công khi không có pending (đổi tên + đổi bước)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, query } = await import("@/lib/db");
    const { createApprovalFlow, updateApprovalFlow } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `UPD-OK ${S}`);
    let flowId: number | undefined;
    try {
      const created = await createApprovalFlow({
        projectId,
        entityType: "proposal",
        name: `Flow gốc ${S}`,
        steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
      });
      flowId = (created as { id: number }).id;

      const result = await updateApprovalFlow(flowId, {
        name: `Flow đã sửa ${S}`,
        steps: [
          { seq: 1, role: "pm", minAmount: null, slaDays: 2 },
          { seq: 2, role: "cdt", minAmount: null, slaDays: 4 },
        ],
      });
      assert.deepEqual(result, { ok: true });

      const flow = await queryOne<{ name: string }>(
        `SELECT name FROM approval_flows WHERE id = ?`,
        flowId,
      );
      assert.equal(flow?.name, `Flow đã sửa ${S}`);

      const steps = await query<{ seq: number; role: string }>(
        `SELECT seq, role FROM approval_steps WHERE flow_id = ? ORDER BY seq`,
        flowId,
      );
      assert.equal(steps.length, 2);
      assert.deepEqual(
        steps.map((s) => s.role),
        ["pm", "cdt"],
      );
    } finally {
      await cleanup({ projectId, flowIds: flowId != null ? [flowId] : [] });
    }
  },
);

test(
  "deleteApprovalFlow: bị chặn khi flow có bất kỳ request nào (kể cả đã approved/rejected)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { createApprovalFlow, deleteApprovalFlow, openApproval, advanceApproval } =
      await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `DEL-HIST ${S}`);
    const creator = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'engineer', 'x')`,
      `del-hist-creator ${S}`,
      `del-hist-creator-${S}@x.test`,
    );
    const pm = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'pm', 'x')`,
      `del-hist-pm ${S}`,
      `del-hist-pm-${S}@x.test`,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (code, name, progress_percent) VALUES (?, 'Task xoa lich su', 1)`,
      `TASK-DEL-HIST-${S}`,
    );
    let flowId: number | undefined;
    try {
      const created = await createApprovalFlow({
        projectId,
        entityType: "task_acceptance",
        name: `Flow có lịch sử ${S}`,
        steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
      });
      flowId = (created as { id: number }).id;

      await openApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        projectId,
        amount: null,
        user: { id: creator, role: "engineer" },
      });
      await advanceApproval({
        entityType: "task_acceptance",
        entityId: taskId,
        user: { id: pm, role: "pm" },
        decision: "approve",
      });

      const result = await deleteApprovalFlow(flowId);
      assert.equal(typeof result, "string");
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ?`,
        taskId,
      );
      await run(`DELETE FROM tasks WHERE id = ?`, taskId);
      await cleanup({
        projectId,
        userIds: [creator, pm],
        flowIds: flowId != null ? [flowId] : [],
      });
    }
  },
);

test(
  "deleteApprovalFlow: thành công khi flow chưa từng có request nào",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const { createApprovalFlow, deleteApprovalFlow } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `DEL-OK ${S}`);
    let flowId: number | undefined;
    try {
      const created = await createApprovalFlow({
        projectId,
        entityType: "variation",
        name: `Flow xoá được ${S}`,
        steps: [{ seq: 1, role: "pm", minAmount: null, slaDays: null }],
      });
      flowId = (created as { id: number }).id;

      const result = await deleteApprovalFlow(flowId);
      assert.deepEqual(result, { ok: true });

      const flow = await queryOne<{ id: number }>(
        `SELECT id FROM approval_flows WHERE id = ?`,
        flowId,
      );
      assert.equal(flow, undefined);
      flowId = undefined; // đã xoá — khỏi cleanup lại
    } finally {
      await cleanup({ projectId, flowIds: flowId != null ? [flowId] : [] });
    }
  },
);

test(
  "listApprovalFlows(projectId): chỉ trả flow của dự án đó + flow toàn cục (project_id NULL); null → trả hết",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { createApprovalFlow, listApprovalFlows } = await import("@/lib/approvals");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SCOPE-FLOW P1 ${S}`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SCOPE-FLOW P2 ${S}`);
    const steps = [{ seq: 1, role: "pm", minAmount: null, slaDays: null }];
    const flowIds: number[] = [];
    try {
      const g = await createApprovalFlow({
        projectId: null,
        entityType: "variation",
        name: `G ${S}`,
        steps,
      });
      const f1 = await createApprovalFlow({
        projectId: p1,
        entityType: "payment_cert",
        name: `F1 ${S}`,
        steps,
      });
      const f2 = await createApprovalFlow({
        projectId: p2,
        entityType: "payment_cert",
        name: `F2 ${S}`,
        steps,
      });
      assert.ok(typeof g === "object" && typeof f1 === "object" && typeof f2 === "object");
      const idG = (g as { id: number }).id;
      const id1 = (f1 as { id: number }).id;
      const id2 = (f2 as { id: number }).id;
      flowIds.push(idG, id1, id2);

      const forP1 = (await listApprovalFlows(p1)).map((f) => f.id);
      assert.ok(forP1.includes(id1), "phải thấy flow dự án p1");
      assert.ok(forP1.includes(idG), "phải thấy flow toàn cục");
      assert.ok(!forP1.includes(id2), "KHÔNG được thấy flow dự án p2");

      const all = (await listApprovalFlows(null)).map((f) => f.id);
      assert.ok(
        [idG, id1, id2].every((id) => all.includes(id)),
        "null phải trả hết",
      );
    } finally {
      for (const id of flowIds) {
        await run(`DELETE FROM approval_requests WHERE flow_id = ?`, id);
        await run(`DELETE FROM approval_flows WHERE id = ?`, id);
      }
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
    }
  },
);
