import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// L4 (audit 2026-09-22) — POST/GET /api/approvals (nghiệm thu tầng) chỉ lọc theo
// sheet_type_id + floor_label, không đối chiếu dự án đang chọn → PM gửi sheetTypeId của
// dự án khác vẫn nghiệm thu được cả tầng dự án đó; GET liệt kê tầng của MỌI dự án.
// File này khoá hành vi vá: 404 khi sheetTypeId thuộc dự án khác (dữ liệu KHÔNG đổi),
// GET chỉ trả nhóm của dự án đang chọn, và vẫn hoạt động đúng trong đúng dự án của mình.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `aprviso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-aprviso', ?, 1)`,
    `APRVISO ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

type Ctx = { projectId: number; towerId: number; sheetTypeId: number; packageId: number };

/** Dựng dự án + tháp + sheet + 1 nhóm + 1 task 100% ở tầng `floorLabel`. */
async function dungTang(ten: string, floorLabel: string): Promise<Ctx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES (?)`,
    `APRVISO ${uniq(ten)}`,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp APRVISO')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet APRVISO', ?)`,
    towerId,
    `APRVISO${uniq(ten)}`,
    `aprviso-${ten.toLowerCase()}-${uniq("slug")}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, 'Nhóm APRVISO', ?)`,
    sheetTypeId,
    uniq("PKG"),
    floorLabel,
  );
  await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, 'Task APRVISO', 1)`,
    packageId,
    uniq("TASK"),
  );
  return { projectId, towerId, sheetTypeId, packageId };
}

// Dọn sạch trong finally — floor_approvals/tasks/work_packages/sheet_types/towers do các
// test khác (vd import-real.test.ts: resetWbs()) XOÁ KHÔNG SCOPE (DELETE FROM sheet_types
// toàn cục) sẽ vướng FK nếu để sót floor_approvals/tasks tham chiếu các sheet_types này.
async function cleanup(ctxs: Ctx[], userIds: number[] = []): Promise<void> {
  const { run } = await import("@/lib/db");
  for (const c of ctxs) {
    await run(`DELETE FROM floor_approvals WHERE sheet_type_id = ?`, c.sheetTypeId);
    await run(
      `DELETE FROM task_history WHERE task_id IN (SELECT id FROM tasks WHERE package_id = ?)`,
      c.packageId,
    );
    await run(`DELETE FROM tasks WHERE package_id = ?`, c.packageId);
    await run(`DELETE FROM work_packages WHERE id = ?`, c.packageId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, c.sheetTypeId);
    await run(`DELETE FROM towers WHERE id = ?`, c.towerId);
    await run(`DELETE FROM projects WHERE id = ?`, c.projectId);
  }
  for (const uid of userIds) await run(`DELETE FROM users WHERE id = ?`, uid);
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test(
  "POST /api/approvals: sheetTypeId thuộc dự án khác → 404, tầng KHÔNG bị nghiệm thu",
  S,
  async () => {
    const a = await dungTang("postA", "T01");
    const b = await dungTang("postB", "T01");
    const pmA = await taoUser("pm", "postA");
    try {
      await dangNhapDuAn(pmA, a.projectId);

      const { POST } = await import("@/app/api/approvals/route");
      const res = await POST(jreq("/x", { sheetTypeId: b.sheetTypeId, floorLabel: "T01" }));
      assert.equal(res.status, 404);

      const { queryOne } = await import("@/lib/db");
      const fa = await queryOne<{ id: number }>(
        `SELECT id FROM floor_approvals WHERE sheet_type_id = ? AND floor_label = ?`,
        b.sheetTypeId,
        "T01",
      );
      assert.equal(fa, undefined, "tầng dự án B không được tạo floor_approval");
      const task = await queryOne<{ status: string | null }>(
        `SELECT status FROM tasks WHERE package_id = ?`,
        b.packageId,
      );
      assert.notEqual(task?.status, "nghiem_thu");
    } finally {
      await cleanup([a, b], [pmA.id]);
    }
  },
);

test("POST /api/approvals: đúng dự án của mình → 200, tầng được nghiệm thu", S, async () => {
  const a = await dungTang("postOk", "T02");
  const pmA = await taoUser("pm", "postOk");
  try {
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/approvals/route");
    const res = await POST(jreq("/x", { sheetTypeId: a.sheetTypeId, floorLabel: "T02" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.taskCount, 1);

    const { queryOne } = await import("@/lib/db");
    const task = await queryOne<{ status: string }>(
      `SELECT status FROM tasks WHERE package_id = ?`,
      a.packageId,
    );
    assert.equal(task?.status, "nghiem_thu");
  } finally {
    await cleanup([a], [pmA.id]);
  }
});

test(
  "GET /api/approvals: chỉ liệt kê tầng của dự án đang chọn, không lẫn dự án khác",
  S,
  async () => {
    const a = await dungTang("getA", "T03");
    const b = await dungTang("getB", "T03");
    const pmA = await taoUser("pm", "getA");
    try {
      await dangNhapDuAn(pmA, a.projectId);

      const { GET } = await import("@/app/api/approvals/route");
      const res = await GET();
      assert.equal(res.status, 200);
      const { pending, approved } = await res.json();
      const all = [...pending, ...approved];
      assert.ok(
        all.some((g: { sheetTypeId: number }) => g.sheetTypeId === a.sheetTypeId),
        "phải thấy tầng của dự án đang chọn",
      );
      assert.ok(
        !all.some((g: { sheetTypeId: number }) => g.sheetTypeId === b.sheetTypeId),
        "không được thấy tầng của dự án khác",
      );
    } finally {
      await cleanup([a, b], [pmA.id]);
    }
  },
);
