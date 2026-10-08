import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Hồi quy S10a (PROGRESS 2026-10-07): approval_requests.amount chốt lúc lập đợt IPC nháp, sửa
// KL sau đó không cập nhật → advanceApproval so ngưỡng min_amount theo giá trị CŨ, lập nháp nhỏ
// rồi sửa tăng là lách được bước duyệt cấp cao. `resyncApprovalAmount` (gọi lúc TRÌNH đợt) chốt
// lại amount + chọn lại bước hiệu lực.

const S = Date.now().toString(36);

async function setup(minAmounts: Array<{ role: string; minAmount: number | null }>) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `RESYNC ${S}`);
  const mk = (role: string) =>
    insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
      `resync-${role} ${S}`,
      `resync-${role}-${S}-${Math.random().toString(36).slice(2, 6)}@x.test`,
      role,
    );
  const creator = await mk("engineer");
  const pm = await mk("pm");
  const cdt = await mk("cdt");
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'payment_cert', ?)`,
    projectId,
    `IPC flow ${S}`,
  );
  let seq = 1;
  for (const s of minAmounts) {
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, ?, ?, ?)`,
      flowId,
      seq++,
      s.role,
      s.minAmount,
    );
  }
  return { projectId, creator, pm, cdt, flowId };
}

async function cleanup(ctx: {
  projectId: number;
  flowId: number;
  creator: number;
  pm: number;
  cdt: number;
}) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM approval_requests WHERE flow_id = ?`, ctx.flowId);
  await run(`DELETE FROM approval_flows WHERE id = ?`, ctx.flowId);
  await run(`DELETE FROM users WHERE id = ANY(?)`, [ctx.creator, ctx.pm, ctx.cdt]);
  await run(`DELETE FROM projects WHERE id = ?`, ctx.projectId);
}

test(
  "resync: amount tăng sau khi mở → bước cấp cao (min_amount) được áp, pm duyệt không còn lách",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { openApproval, advanceApproval, resyncApprovalAmount } =
      await import("@/lib/tien-do/approvals");
    const ctx = await setup([
      { role: "pm", minAmount: null },
      { role: "cdt", minAmount: 1000 },
    ]);
    const entityId = 910_000 + (Date.now() % 1000);
    try {
      const req = await openApproval({
        entityType: "payment_cert",
        entityId,
        projectId: ctx.projectId,
        amount: 100,
        user: { id: ctx.creator, role: "engineer" },
      });
      assert.equal(req?.status, "pending");

      const changed = await resyncApprovalAmount({
        entityType: "payment_cert",
        entityId,
        amountMinor: 500000n,
      });
      assert.equal(changed, true);
      const row = await queryOne<{ amount: number; currentSeq: number; status: string }>(
        `SELECT amount, current_seq AS "currentSeq", status FROM approval_requests WHERE id = ?`,
        req!.id,
      );
      assert.equal(Number(row!.amount), 5000);
      assert.equal(row!.currentSeq, 1);
      assert.equal(row!.status, "pending");

      // pm duyệt bước 1 → phải chuyển sang cdt (5000 ≥ 1000), KHÔNG được approved luôn.
      const r = await advanceApproval({
        entityType: "payment_cert",
        entityId,
        user: { id: ctx.pm, role: "pm" },
        decision: "approve",
      });
      assert.deepEqual(r, { status: "pending", currentSeq: 2, nextRole: "cdt" });
    } finally {
      await cleanup(ctx);
    }
  },
);

test(
  "resync: không bước hiệu lực lúc mở (auto-approved) mà amount mới kéo bước vào → mở lại pending",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { openApproval, resyncApprovalAmount } = await import("@/lib/tien-do/approvals");
    const ctx = await setup([{ role: "cdt", minAmount: 1000 }]);
    const entityId = 920_000 + (Date.now() % 1000);
    try {
      const req = await openApproval({
        entityType: "payment_cert",
        entityId,
        projectId: ctx.projectId,
        amount: 100,
        user: { id: ctx.creator, role: "engineer" },
      });
      assert.equal(req?.status, "approved"); // không bước nào hiệu lực

      assert.equal(
        await resyncApprovalAmount({ entityType: "payment_cert", entityId, amountMinor: 500000n }),
        true,
      );
      const row = await queryOne<{ currentSeq: number; status: string; decidedAt: string | null }>(
        `SELECT current_seq AS "currentSeq", status, decided_at AS "decidedAt"
           FROM approval_requests WHERE id = ?`,
        req!.id,
      );
      assert.equal(row!.status, "pending");
      assert.equal(row!.currentSeq, 1);
      assert.equal(row!.decidedAt, null);
    } finally {
      await cleanup(ctx);
    }
  },
);

test(
  "resync: amount giảm xuống dưới mọi ngưỡng → request pending thành approved; không request → no-op",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { openApproval, resyncApprovalAmount } = await import("@/lib/tien-do/approvals");
    const ctx = await setup([{ role: "cdt", minAmount: 1000 }]);
    const entityId = 930_000 + (Date.now() % 1000);
    try {
      assert.equal(
        await resyncApprovalAmount({ entityType: "payment_cert", entityId, amountMinor: 100n }),
        false,
      );
      const req = await openApproval({
        entityType: "payment_cert",
        entityId,
        projectId: ctx.projectId,
        amount: 5000,
        user: { id: ctx.creator, role: "engineer" },
      });
      assert.equal(req?.status, "pending");
      assert.equal(
        await resyncApprovalAmount({ entityType: "payment_cert", entityId, amountMinor: 1000n }),
        true,
      );
      const row = await queryOne<{ status: string }>(
        `SELECT status FROM approval_requests WHERE id = ?`,
        req!.id,
      );
      assert.equal(row!.status, "approved");
    } finally {
      await cleanup(ctx);
    }
  },
);

test(
  "resync: request đã có người quyết định (approval_actions) giữ nguyên, trả false",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { openApproval, advanceApproval, resyncApprovalAmount } =
      await import("@/lib/tien-do/approvals");
    const ctx = await setup([
      { role: "pm", minAmount: null },
      { role: "cdt", minAmount: null },
    ]);
    const entityId = 940_000 + (Date.now() % 1000);
    try {
      const req = await openApproval({
        entityType: "payment_cert",
        entityId,
        projectId: ctx.projectId,
        amount: 100,
        user: { id: ctx.creator, role: "engineer" },
      });
      await advanceApproval({
        entityType: "payment_cert",
        entityId,
        user: { id: ctx.pm, role: "pm" },
        decision: "approve",
      });
      assert.equal(
        await resyncApprovalAmount({ entityType: "payment_cert", entityId, amountMinor: 999900n }),
        false,
      );
      const row = await queryOne<{ amount: number; currentSeq: number }>(
        `SELECT amount, current_seq AS "currentSeq" FROM approval_requests WHERE id = ?`,
        req!.id,
      );
      assert.equal(Number(row!.amount), 100);
      assert.equal(row!.currentSeq, 2);
    } finally {
      await cleanup(ctx);
    }
  },
);

test(
  "resync: giá trị ngoài biên số an toàn → 422 money_precision_unsupported khi CÓ request; không request thì no-op",
  { skip: !HAS_TEST_DB },
  async () => {
    const { openApproval, resyncApprovalAmount } = await import("@/lib/tien-do/approvals");
    const ctx = await setup([{ role: "cdt", minAmount: 1000 }]);
    const entityId = 950_000 + (Date.now() % 1000);
    const lonHon2Mu53 = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
    try {
      assert.equal(
        await resyncApprovalAmount({
          entityType: "payment_cert",
          entityId,
          amountMinor: lonHon2Mu53,
        }),
        false,
      );
      await openApproval({
        entityType: "payment_cert",
        entityId,
        projectId: ctx.projectId,
        amount: 5000,
        user: { id: ctx.creator, role: "engineer" },
      });
      await assert.rejects(
        resyncApprovalAmount({ entityType: "payment_cert", entityId, amountMinor: lonHon2Mu53 }),
        (e: { status?: number; code?: string }) =>
          e.status === 422 && e.code === "money_precision_unsupported",
      );
    } finally {
      await cleanup(ctx);
    }
  },
);
