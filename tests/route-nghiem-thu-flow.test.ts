import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Audit 2026-10-01 (F1) — flow duyệt nghiệm thu task (M46, entity 'task_acceptance') đi qua
// ROUTE THẬT, không chỉ qua lib như tests/approvals-task-proposal.test.ts.
//
// Lỗi cũ: route mở approval_request với người bấm là `created_by` rồi gọi ngay advanceApproval
// cho CHÍNH người đó → luật SoD "người tạo không được tự duyệt" trả 403 và rollback cả request
// vừa mở. Mọi lượt bấm đều 403 nên Admin bật flow là không ai nghiệm thu task được nữa. Kèm
// theo: route chặn CAN.approve (Admin/PM) ngay đầu, nên vai trò bước khác (kỹ sư/CĐT) bấm
// "Duyệt" từ hộp thư "Chờ tôi duyệt" cũng 403.
//
// Quyết định chủ dự án 2026-10-01: task_acceptance MIỄN SoD (SOD_EXEMPT_ENTITY_TYPES); khi đã
// có request đang chờ, quyền do engine quyết theo vai trò bước (giống VO/IPC).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

const jreq = (body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost/x`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const P = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

type NguoiDung = { id: number; passwordHash: string };
type Ctx = {
  projectId: number;
  towerId: number;
  sheetTypeId: number;
  packageId: number;
  taskId: number;
  flowId: number;
  users: NguoiDung[];
};

async function taoUser(role: string): Promise<NguoiDung> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-ntf', ?, 1)`,
    `NTF ${role}`,
    `ntf-${uniq(role)}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-test-ntf" };
}

/** Dự án → tháp → sheet → nhóm (tầng T01) → 1 task 100% chưa nghiệm thu + flow theo `buoc`. */
async function dung(ten: string, buoc: string[]): Promise<Ctx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `NTF ${uniq(ten)}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp NTF')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet NTF')`,
    towerId,
    `NTF${uniq(ten)}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, 'Nhóm', 'T01')`,
    sheetTypeId,
    uniq("PK"),
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status)
       VALUES (?, ?, 'Task NTF', 1, 'hoan_thanh')`,
    packageId,
    uniq("TK"),
  );
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'task_acceptance', ?)`,
    projectId,
    `Flow ${ten}`,
  );
  for (const [i, role] of buoc.entries())
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role) VALUES (?, ?, ?)`,
      flowId,
      i + 1,
      role,
    );
  return { projectId, towerId, sheetTypeId, packageId, taskId, flowId, users: [] };
}

async function vao(c: Ctx, role: string): Promise<NguoiDung> {
  const u = await taoUser(role);
  c.users.push(u);
  await dangNhapDuAn(u, c.projectId);
  return u;
}

async function trangThai(taskId: number): Promise<string | null | undefined> {
  const { queryOne } = await import("@/lib/db");
  return (
    await queryOne<{ status: string | null }>(`SELECT status FROM tasks WHERE id = ?`, taskId)
  )?.status;
}

async function don(c: Ctx): Promise<void> {
  const { run } = await import("@/lib/db");
  const ids = c.users.map((u) => u.id);
  await run(`DELETE FROM approval_requests WHERE flow_id = ?`, c.flowId);
  await run(`DELETE FROM approval_flows WHERE id = ?`, c.flowId);
  await run(`DELETE FROM floor_approvals WHERE sheet_type_id = ?`, c.sheetTypeId);
  await run(`DELETE FROM notifications WHERE task_id = ? OR user_id = ANY(?)`, c.taskId, ids);
  await run(`DELETE FROM task_history WHERE task_id = ?`, c.taskId);
  await run(`DELETE FROM tasks WHERE id = ?`, c.taskId);
  await run(`DELETE FROM work_packages WHERE id = ?`, c.packageId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, c.sheetTypeId);
  await run(`DELETE FROM towers WHERE id = ?`, c.towerId);
  await run(`DELETE FROM user_projects WHERE project_id = ?`, c.projectId);
  await run(`DELETE FROM projects WHERE id = ?`, c.projectId);
  await run(`DELETE FROM users WHERE id = ANY(?)`, ids);
}

test.after(() => dangXuat());

test("flow 1 bước (pm): PM bấm Nghiệm thu → 200 nghiem_thu ngay (miễn SoD)", S, async () => {
  const c = await dung("mot", ["pm"]);
  try {
    await vao(c, "pm");
    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    const res = await POST(jreq({}), P(c.taskId));
    assert.equal(res.status, 200, "trước đây 403 'Người tạo không được tự duyệt'");
    assert.equal((await res.json()).status, "nghiem_thu");
    assert.equal(await trangThai(c.taskId), "nghiem_thu");

    const { queryOne } = await import("@/lib/db");
    const req = await queryOne<{ status: string }>(
      `SELECT status FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ?`,
      c.taskId,
    );
    assert.equal(req?.status, "approved");
  } finally {
    await don(c);
  }
});

test(
  "flow 2 bước (pm → cdt): PM bấm → chờ CĐT; CĐT duyệt qua chính endpoint → nghiem_thu",
  S,
  async () => {
    const c = await dung("cdt", ["pm", "cdt"]);
    try {
      await vao(c, "pm");
      const { POST } = await import("@/app/api/tasks/[id]/approve/route");
      const r1 = await POST(jreq({}), P(c.taskId));
      assert.equal(r1.status, 200);
      const j1 = await r1.json();
      assert.equal(j1.pending, true);
      assert.equal(j1.nextRole, "cdt");
      assert.equal(await trangThai(c.taskId), "hoan_thanh", "chưa tới bước cuối → chưa nghiệm thu");

      // CĐT không có CAN.approve — trước đây bị chặn 403 ngay đầu route dù là vai trò bước.
      await vao(c, "cdt");
      const r2 = await POST(jreq({}), P(c.taskId));
      assert.equal(r2.status, 200);
      assert.equal((await r2.json()).status, "nghiem_thu");
      assert.equal(await trangThai(c.taskId), "nghiem_thu");
    } finally {
      await don(c);
    }
  },
);

test(
  "flow bước 1 là kỹ sư: PM bấm → chỉ trình (request còn nguyên); kỹ sư duyệt → nghiem_thu",
  S,
  async () => {
    const c = await dung("ks", ["engineer"]);
    try {
      await vao(c, "pm");
      const { POST } = await import("@/app/api/tasks/[id]/approve/route");
      const r1 = await POST(jreq({}), P(c.taskId));
      assert.equal(r1.status, 200);
      const j1 = await r1.json();
      assert.equal(j1.pending, true);
      assert.equal(j1.nextRole, "engineer");

      const { queryOne } = await import("@/lib/db");
      const req = await queryOne<{ status: string }>(
        `SELECT status FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ?`,
        c.taskId,
      );
      assert.equal(req?.status, "pending", "request đã trình phải được giữ (không rollback)");

      await vao(c, "engineer");
      const r2 = await POST(jreq({}), P(c.taskId));
      assert.equal(r2.status, 200);
      assert.equal(await trangThai(c.taskId), "nghiem_thu");
    } finally {
      await don(c);
    }
  },
);

test(
  "không có request đang chờ: kỹ sư gọi nghiệm thu → 403 (chỉ Admin/PM được mở)",
  S,
  async () => {
    const c = await dung("ks403", ["engineer"]);
    try {
      await vao(c, "engineer");
      const { POST } = await import("@/app/api/tasks/[id]/approve/route");
      const res = await POST(jreq({}), P(c.taskId));
      assert.equal(res.status, 403);
      assert.equal(await trangThai(c.taskId), "hoan_thanh");
    } finally {
      await don(c);
    }
  },
);

test("bch (chỉ-xem) gọi nghiệm thu → 403 kể cả khi đã có request đang chờ", S, async () => {
  const c = await dung("bch", ["pm", "pm"]);
  try {
    await vao(c, "pm");
    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    assert.equal((await POST(jreq({}), P(c.taskId))).status, 200);
    await vao(c, "bch");
    assert.equal((await POST(jreq({}), P(c.taskId))).status, 403);
    assert.equal(await trangThai(c.taskId), "hoan_thanh");
  } finally {
    await don(c);
  }
});

test(
  "hộp thư: request nghiệm thu do chính PM mở vẫn hiện để PM duyệt bước kế (miễn SoD)",
  S,
  async () => {
    const c = await dung("hopthu", ["pm", "pm"]);
    try {
      const pm = await vao(c, "pm");
      const { POST } = await import("@/app/api/tasks/[id]/approve/route");
      const r1 = await POST(jreq({}), P(c.taskId));
      assert.equal((await r1.json()).nextRole, "pm");

      const { pendingForUser } = await import("@/lib/tien-do/approvals");
      const hop = await pendingForUser({ id: pm.id, role: "pm" }, c.projectId);
      assert.ok(
        hop.some((h) => h.entityType === "task_acceptance" && h.entityId === c.taskId),
        "người mở vẫn thấy request của loại miễn SoD",
      );

      const r2 = await POST(jreq({}), P(c.taskId));
      assert.equal(r2.status, 200);
      assert.equal(await trangThai(c.taskId), "nghiem_thu");
    } finally {
      await don(c);
    }
  },
);

test("duyệt tầng với flow 1 bước (pm): PM duyệt cả tầng → 200, task nghiem_thu", S, async () => {
  const c = await dung("tang", ["pm"]);
  try {
    await vao(c, "pm");
    const { POST } = await import("@/app/api/approvals/route");
    const res = await POST(jreq({ sheetTypeId: c.sheetTypeId, floorLabel: "T01" }));
    assert.equal(res.status, 200, "trước đây 403 'Người tạo không được tự duyệt'");
    assert.equal((await res.json()).taskCount, 1);
    assert.equal(await trangThai(c.taskId), "nghiem_thu");
  } finally {
    await don(c);
  }
});

test("VO vẫn giữ SoD: người tạo request phát sinh không tự duyệt được", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { openApproval, advanceApproval } = await import("@/lib/tien-do/approvals");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES (?)`,
    `NTF VO ${uniq("vo")}`,
  );
  const pm = await taoUser("pm");
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'variation', 'VO')`,
    projectId,
  );
  await insertId(`INSERT INTO approval_steps (flow_id, seq, role) VALUES (?, 1, 'pm')`, flowId);
  try {
    await openApproval({
      entityType: "variation",
      entityId: 987654321,
      projectId,
      amount: null,
      user: { id: pm.id, role: "pm" },
    });
    await assert.rejects(
      advanceApproval({
        entityType: "variation",
        entityId: 987654321,
        user: { id: pm.id, role: "pm" },
        decision: "approve",
      }),
      (e: { status?: number }) => e.status === 403,
    );
  } finally {
    await run(`DELETE FROM approval_requests WHERE flow_id = ?`, flowId);
    await run(`DELETE FROM approval_flows WHERE id = ?`, flowId);
    await run(`DELETE FROM users WHERE id = ?`, pm.id);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  }
});
