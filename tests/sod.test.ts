import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Integration test M50 PR3 — lib/sod.ts (buildSodReport). Seed 1 cặp vi phạm rule
// "create_and_approve" qua approval_requests/approval_actions (Approval Engine, M46):
// cùng user vừa tạo request vừa tự duyệt bước — report phải bắt được. User không vi
// phạm (approve bởi người khác) không xuất hiện.

const S = Date.now().toString(36);

async function cleanup(ids: {
  projectId: number;
  userIds: number[];
  flowId: number;
  requestIds: number[];
}) {
  const { run } = await import("@/lib/db");
  if (ids.requestIds.length)
    await run(`DELETE FROM approval_requests WHERE id = ANY(?)`, ids.requestIds);
  await run(`DELETE FROM approval_flows WHERE id = ?`, ids.flowId);
  if (ids.userIds.length) await run(`DELETE FROM users WHERE id = ANY(?)`, ids.userIds);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

test(
  "buildSodReport: bắt vi phạm cùng người tạo+duyệt (approval_engine), không bắt nhầm cặp hợp lệ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { buildSodReport } = await import("@/lib/sod");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SOD ${S}`);
    const mk = (role: string, tag: string) =>
      insertId(
        `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
        `sod-${tag} ${S}`,
        `sod-${tag}-${S}@x.test`,
        role,
      );
    // Cặp VI PHẠM: cùng 1 user vừa tạo vừa duyệt.
    const violator = await mk("pm", "violator");
    // Cặp HỢP LỆ: người tạo và người duyệt khác nhau.
    const creator = await mk("engineer", "creator");
    const approver = await mk("pm", "approver");

    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'variation', ?)`,
      projectId,
      `SoD flow ${S}`,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );

    const reqViolation = await insertId(
      `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, created_by)
       VALUES (?, 'variation', ?, ?, ?)`,
      flowId,
      1000001,
      projectId,
      violator,
    );
    await insertId(
      `INSERT INTO approval_actions (request_id, step_seq, actor_id, decision)
       VALUES (?, 1, ?, 'approve')`,
      reqViolation,
      violator, // cùng người tạo → vi phạm
    );

    const reqOk = await insertId(
      `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, created_by)
       VALUES (?, 'variation', ?, ?, ?)`,
      flowId,
      1000002,
      projectId,
      creator,
    );
    await insertId(
      `INSERT INTO approval_actions (request_id, step_seq, actor_id, decision)
       VALUES (?, 1, ?, 'approve')`,
      reqOk,
      approver, // khác người tạo → không vi phạm
    );

    try {
      const report = await buildSodReport(90);
      const rule = report.find((r) => r.rule === "create_and_approve");
      assert.ok(rule, "phải có rule create_and_approve");

      const userIds = rule!.violations.map((v) => v.userId);
      assert.ok(userIds.includes(violator), "phải bắt được user vi phạm");
      assert.ok(!userIds.includes(creator), "không bắt nhầm creator hợp lệ");
      assert.ok(!userIds.includes(approver), "không bắt nhầm approver hợp lệ");

      // entityId của request vi phạm phải nằm trong danh sách trả về (đúng bản ghi).
      const matched = rule!.violations.find((v) => v.userId === violator && v.entityId === 1000001);
      assert.ok(matched, "phải khớp đúng entityId của request vi phạm");
    } finally {
      await cleanup({
        projectId,
        userIds: [violator, creator, approver],
        flowId,
        requestIds: [reqViolation, reqOk],
      });
    }
  },
);
