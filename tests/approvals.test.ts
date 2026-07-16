import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Unit test M46 PR1 — decideNext (logic thuần chọn bước duyệt kế tiếp theo ngưỡng tiền).

test("decideNext: min_amount NULL luôn hiệu lực, lấy bước đầu khi currentSeq=0", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "cdt" as const, minAmount: null, slaDays: null },
  ];
  assert.equal(decideNext(steps, null, 0)?.seq, 1);
  assert.equal(decideNext(steps, null, 1)?.seq, 2);
  assert.equal(decideNext(steps, null, 2), null); // hết bước
});

test("decideNext: ngưỡng min_amount lọc bước theo amount", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "bch" as const, minAmount: 100, slaDays: null },
    { seq: 3, role: "cdt" as const, minAmount: 1000, slaDays: null },
  ];
  // amount 50: chỉ bước 1 hiệu lực → sau bước 1 là hết.
  assert.equal(decideNext(steps, 50, 0)?.seq, 1);
  assert.equal(decideNext(steps, 50, 1), null);
  // amount 500: bước 1 + 2 hiệu lực (>=100), bước 3 (>=1000) bị loại.
  assert.equal(decideNext(steps, 500, 1)?.seq, 2);
  assert.equal(decideNext(steps, 500, 2), null);
  // amount 5000: cả 3 bước.
  assert.equal(decideNext(steps, 5000, 2)?.seq, 3);
  assert.equal(decideNext(steps, 5000, 3), null);
});

test("decideNext: biên min_amount (amount == ngưỡng) tính là hiệu lực", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [{ seq: 1, role: "bch" as const, minAmount: 100, slaDays: null }];
  assert.equal(decideNext(steps, 100, 0)?.seq, 1); // >= nên đúng ngưỡng vẫn kích hoạt
  assert.equal(decideNext(steps, 99, 0), null);
});

test("decideNext: amount NULL loại mọi bước có min_amount", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "cdt" as const, minAmount: 100, slaDays: null },
  ];
  // task_acceptance: amount NULL → bước có ngưỡng bị bỏ, chỉ còn bước không ngưỡng.
  assert.equal(decideNext(steps, null, 1), null);
});

test("decideNext: steps không theo thứ tự vẫn chọn đúng theo seq", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 3, role: "cdt" as const, minAmount: null, slaDays: null },
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "bch" as const, minAmount: null, slaDays: null },
  ];
  assert.equal(decideNext(steps, null, 0)?.seq, 1);
  assert.equal(decideNext(steps, null, 1)?.seq, 2);
  assert.equal(decideNext(steps, null, 2)?.seq, 3);
});

// Integration test M46 PR2 (nợ kỹ thuật) — getEntityApprovalStatus + overdueApprovals.
// Dựng project + user + flow riêng, dọn sạch trong finally (pattern approvals-flow.test.ts).

const S2 = Date.now().toString(36) + "b";
const EID2 = (Date.now() % 1_000_00) + 500_000;

async function cleanup2(ids: {
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

async function seed2(entityType: string, slaDays: number | null = null) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES (?)`,
    `APRV2 ${entityType} ${S2}`,
  );
  const mk = (role: string) =>
    insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
      `${role} ${entityType} ${S2}`,
      `aprv2-${role}-${entityType}-${S2}@x.test`,
      role,
    );
  const creator = await mk("engineer");
  const pm = await mk("pm");
  const cdt = await mk("cdt");
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, ?, ?)`,
    projectId,
    entityType,
    `Flow2 ${entityType} ${S2}`,
  );
  await insertId(
    `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days) VALUES (?, 1, 'pm', NULL, ?)`,
    flowId,
    slaDays,
  );
  await insertId(
    `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days) VALUES (?, 2, 'cdt', NULL, NULL)`,
    flowId,
  );
  return { projectId, creator, pm, cdt, flowId };
}

test("getEntityApprovalStatus: null khi chưa có request nào", { skip: !HAS_TEST_DB }, async () => {
  const { getEntityApprovalStatus } = await import("@/lib/approvals");
  const status = await getEntityApprovalStatus("variation", EID2 * 10 + 999);
  assert.equal(status, null);
});

test(
  "getEntityApprovalStatus: request pending + 1 action → currentRole/actions đúng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval, advanceApproval, getEntityApprovalStatus } =
      await import("@/lib/approvals");
    const { projectId, creator, pm, cdt, flowId } = await seed2("variation");
    const entityId = EID2 * 10 + 1;
    try {
      await openApproval({
        entityType: "variation",
        entityId,
        projectId,
        amount: 100,
        user: { id: creator, role: "engineer" },
      });
      await advanceApproval({
        entityType: "variation",
        entityId,
        user: { id: pm, role: "pm" },
        decision: "approve",
        note: "OK bước 1",
      });

      const status = await getEntityApprovalStatus("variation", entityId);
      assert.ok(status);
      assert.equal(status!.status, "pending");
      assert.equal(status!.currentSeq, 2);
      assert.equal(status!.totalSteps, 2);
      assert.equal(status!.currentRole, "cdt");
      assert.equal(status!.actions.length, 1);
      assert.equal(status!.actions[0].seq, 1);
      assert.equal(status!.actions[0].decision, "approve");
      assert.equal(status!.actions[0].note, "OK bước 1");
      assert.equal(status!.actions[0].actorId, pm);

      // Duyệt nốt bước 2 → approved, currentRole null.
      await advanceApproval({
        entityType: "variation",
        entityId,
        user: { id: cdt, role: "cdt" },
        decision: "approve",
      });
      const status2 = await getEntityApprovalStatus("variation", entityId);
      assert.equal(status2!.status, "approved");
      assert.equal(status2!.currentRole, null);
      assert.equal(status2!.actions.length, 2);
    } finally {
      await cleanup2({
        projectId,
        userIds: [creator, pm, cdt],
        flowId,
        entityType: "variation",
        entityIds: [entityId],
      });
    }
  },
);

test(
  "overdueApprovals: xuất hiện khi quá SLA, biến mất khi đã duyệt hoặc chưa quá hạn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval, advanceApproval, overdueApprovals } = await import("@/lib/approvals");
    const { run } = await import("@/lib/db");
    const { projectId, creator, pm, cdt, flowId } = await seed2("payment_cert", 3); // SLA 3 ngày
    const entityId = EID2 * 10 + 2;
    try {
      const req = await openApproval({
        entityType: "payment_cert",
        entityId,
        projectId,
        amount: 100,
        user: { id: creator, role: "engineer" },
      });
      // Chưa quá SLA (mới tạo) → không xuất hiện trong danh sách quá hạn.
      const fresh = await overdueApprovals(projectId);
      assert.ok(!fresh.some((o) => o.requestId === req!.id));

      // Giả lập request đã mở từ 10 ngày trước (> SLA 3 ngày) → quá hạn.
      await run(
        `UPDATE approval_requests SET created_at = now() - interval '10 days' WHERE id = ?`,
        req!.id,
      );
      const overdue = await overdueApprovals(projectId);
      const found = overdue.find((o) => o.requestId === req!.id);
      assert.ok(found, "phải xuất hiện khi quá SLA");
      assert.equal(found!.currentRole, "pm");
      assert.equal(found!.slaDays, 3);
      assert.equal(found!.entityType, "payment_cert");
      assert.equal(found!.entityId, entityId);

      // Duyệt xong bước pm (chuyển sang cdt, SLA NULL ở bước 2) → không còn quá hạn.
      await advanceApproval({
        entityType: "payment_cert",
        entityId,
        user: { id: pm, role: "pm" },
        decision: "approve",
      });
      const afterApprove = await overdueApprovals(projectId);
      assert.ok(!afterApprove.some((o) => o.requestId === req!.id));
    } finally {
      await cleanup2({
        projectId,
        userIds: [creator, pm, cdt],
        flowId,
        entityType: "payment_cert",
        entityIds: [entityId],
      });
    }
  },
);
