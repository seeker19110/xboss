import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Integration test M46 PR2 — engine phê duyệt gắn vào VO ('variation') + IPC
// ('payment_cert') qua đúng entity_type/amount mà app/api/variations|payment-certs dùng
// (tránh lệch chuỗi entity_type hoặc công thức tính amount giữa route và engine). Route
// handler tự nó không test được trực tiếp (dùng next/headers) nên tái hiện đúng câu SQL
// "liveRequest" mà route dùng để gate advanceApproval/CAN.approve.

const S = Date.now().toString(36);
const EID = Date.now() % 1_000_00;

async function cleanupCommon(ids: { projectId: number; userIds: number[]; flowId?: number }) {
  const { run } = await import("@/lib/db");
  if (ids.flowId != null) await run(`DELETE FROM approval_flows WHERE id = ?`, ids.flowId);
  if (ids.userIds.length) await run(`DELETE FROM users WHERE id = ANY(?)`, ids.userIds);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

test(
  "VO: flow 2 bước (pm→cdt) gate đúng qua entity_type 'variation', amount = SUM(qty_contract*unit_price)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { openApproval, advanceApproval } = await import("@/lib/approvals");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `VO-APRV ${S}`);
    const mk = (role: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `vo-${role} ${S}`,
        `vo-aprv-${role}-${S}@x.test`,
        role,
      );
    const creator = await mk("engineer");
    const pm = await mk("pm");
    const cdt = await mk("cdt");

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'variation', ?)`,
      projectId,
      `VO flow ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'cdt', NULL)`,
      flowId,
    );

    const voId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status, created_by, project_id)
       VALUES (?, 'VO test engine', 'site_condition', 'submitted', ?, ?)`,
      `VO-TEST-${S}`,
      creator,
      projectId,
    );
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, vo_id)
       VALUES (?, 'Dòng test', 'm', 10, 500, ?)`,
      `VOL-${S}`,
      voId,
    );

    try {
      // Amount đúng công thức route dùng (app/api/variations/route.ts).
      const { amount } = (await queryOne<{ amount: number }>(
        `SELECT COALESCE(SUM(qty_contract * unit_price), 0) AS amount FROM boq_items WHERE vo_id = ?`,
        voId,
      ))!;
      assert.equal(Number(amount), 5000);

      const req = await openApproval({
        entityType: "variation",
        entityId: voId,
        projectId,
        amount,
        user: { id: creator, role: "engineer" },
      });
      assert.equal(req!.status, "pending");
      assert.equal(req!.currentSeq, 1);

      // Câu SQL "liveRequest" route dùng để quyết định có gate qua engine không.
      const live = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'variation' AND entity_id = ? AND status = 'pending'`,
        voId,
      );
      assert.ok(live, "route phải thấy request pending để gate qua engine");

      // Bước 1 (pm) duyệt → còn bước 2 (cdt), chưa xong.
      const r1 = await advanceApproval({
        entityType: "variation",
        entityId: voId,
        user: { id: pm, role: "pm" },
        decision: "approve",
      });
      assert.deepEqual(r1, { status: "pending", currentSeq: 2, nextRole: "cdt" });

      // Bước 2 (cdt) duyệt → hoàn tất.
      const r2 = await advanceApproval({
        entityType: "variation",
        entityId: voId,
        user: { id: cdt, role: "cdt" },
        decision: "approve",
      });
      assert.deepEqual(r2, { status: "approved" });
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'variation' AND entity_id = ?`,
        voId,
      );
      await run(`DELETE FROM boq_items WHERE vo_id = ?`, voId);
      await run(`DELETE FROM variation_orders WHERE id = ?`, voId);
      await cleanupCommon({ projectId, userIds: [creator, pm, cdt], flowId });
    }
  },
);

test(
  "IPC: reject ở bước 1 (pm) chốt ngay, entity_type 'payment_cert', amount = certTotals().periodValue",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { openApproval, advanceApproval } = await import("@/lib/approvals");
    const { certTotals } = await import("@/lib/paymentcerts");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `IPC-APRV ${S}`);
    const mk = (label: string, role: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `ipc-${label} ${S}`,
        `ipc-aprv-${label}-${S}@x.test`,
        role,
      );
    // creator khác id với pm dù cùng vai trò 'pm' — tránh false-negative SoD (chặn tự
    // duyệt) khi thực ra là 2 người khác nhau cùng vai trò.
    const creator = await mk("creator", "pm");
    const pm = await mk("pm", "pm");
    const cdt = await mk("cdt", "cdt");

    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'HĐ test IPC engine', ?)`,
      `HD-IPC-ENGINE-${S}`,
      projectId,
    );

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'payment_cert', ?)`,
      projectId,
      `IPC flow ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'cdt', NULL)`,
      flowId,
    );

    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status, created_by)
       VALUES (?, ?, 1, 'submitted', ?)`,
      `IPC-TEST-ENGINE-${S}`,
      contractId,
      creator,
    );
    const boqItemId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price)
       VALUES (?, 'Dòng IPC test', 'm', 20, 300)`,
      `IPCL-${S}`,
    );
    await insertId(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, 20, 20, 300)`,
      certId,
      boqItemId,
    );

    try {
      const totals = await certTotals(certId);
      assert.equal(totals.periodValue, 6000);

      const req = await openApproval({
        entityType: "payment_cert",
        entityId: certId,
        projectId,
        amount: totals.periodValue,
        user: { id: creator, role: "pm" },
      });
      assert.equal(req!.status, "pending");

      const live = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ? AND status = 'pending'`,
        certId,
      );
      assert.ok(live);

      const r = await advanceApproval({
        entityType: "payment_cert",
        entityId: certId,
        user: { id: pm, role: "pm" },
        decision: "reject",
        note: "Thiếu chứng từ",
      });
      assert.deepEqual(r, { status: "rejected" });

      // reject chốt ngay dù còn bước cdt — không còn request pending.
      const stillLive = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ? AND status = 'pending'`,
        certId,
      );
      assert.equal(stillLive, undefined);
    } finally {
      await run(
        `DELETE FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        certId,
      );
      await run(`DELETE FROM payment_cert_items WHERE cert_id = ?`, certId);
      await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
      await run(`DELETE FROM boq_items WHERE id = ?`, boqItemId);
      await run(`DELETE FROM contracts WHERE id = ?`, contractId);
      await cleanupCommon({ projectId, userIds: [creator, pm, cdt], flowId });
    }
  },
);
