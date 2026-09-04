import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm QUẢN TRỊ/TÀI KHOẢN cụm 2 — bám khuôn
// tests/route-admin.test.ts / tests/route-auth.test.ts. Route:
//   - app/api/admin/api-keys/route.ts + [id]/route.ts
//   - app/api/admin/assignments/route.ts
//   - app/api/admin/audit-log/route.ts + export/route.ts
//   - app/api/admin/audit/route.ts (lịch sử phân công)
//   - app/api/admin/permissions-snapshot/route.ts
//   - app/api/admin/sod-report/route.ts
//   - app/api/admin/storage/route.ts
//   - app/api/admin/traffic/events/route.ts + ingest/route.ts
//   - app/api/users/[id]/revoke-sessions/route.ts
//   - app/api/user-projects/route.ts
//   - app/api/project/select/route.ts
//   - app/api/projects/[id]/clone-config/route.ts
//   - app/api/auth/password/route.ts
//   - app/api/auth/totp/route.ts + setup/route.ts + confirm/route.ts
//   - app/api/nav-settings/route.ts
//   - app/api/ui-texts/route.ts
//   - app/api/feature-flags/route.ts
//   - app/api/code-lists/route.ts
//   - app/api/custom-fields/route.ts
//   - app/api/raci/route.ts
//   - app/api/presence/route.ts
//   - app/api/push/subscribe/route.ts
//   - app/api/notifications/[id]/read/route.ts
//   - app/api/notifications/feed/route.ts
//   - app/api/notifications/prefs/route.ts
//   - app/api/integrations/[provider]/sync/route.ts
//   - app/api/import/batches/route.ts
//   - app/api/approvals/inbox/route.ts

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoToChuc(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${uniq(ten)}`);
}

async function taoDuAn(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `QT2 route ${uniq(ten)}`,
    orgId,
  );
}

async function taoUser(
  role: string,
  ten: string,
  overrides: { orgId?: number } = {},
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const orgId = overrides.orgId ?? 1;
  const email = `qt2-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-qt2-route', ?, ?)`,
    `QT2 ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId };
}

const jreq = (url: string, body?: unknown, method = "POST", headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });

/** Dựng WBS tối thiểu: dự án → tháp → sheet → nhóm → task (trả kèm các id). */
async function dungWbs(ten: string, projectId: number) {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp QT2')`,
    projectId,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet QT2')`,
    towerId,
    `QT2-${uniq(ten)}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'T1', 'Nhóm QT2')`,
    sheetId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, 'T1,01', 'Task QT2')`,
    pkgId,
  );
  return { towerId, sheetId, pkgId, taskId };
}

// ============================================================================
// GET/POST /api/admin/api-keys
// ============================================================================

test("GET /api/admin/api-keys: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/api-keys/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/api-keys: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("keys-403");
  const pm = await taoUser("pm", "keys-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/api-keys/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/api-keys: cô lập tenant — org khác không thấy key của org này", S, async () => {
  const projectId1 = await taoDuAn("keys-iso1", 1);
  const admin1 = await taoUser("admin", "keys-iso1", { orgId: 1 });
  await dangNhapDuAn(admin1, projectId1);
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const created = await POST(jreq("/x", { name: `Key ${uniq("keysiso")}` }));
  assert.equal(created.status, 201);

  const org2 = await taoToChuc("keysiso2");
  const projectId2 = await taoDuAn("keys-iso2", org2);
  const admin2 = await taoUser("admin", "keys-iso2", { orgId: org2 });
  await dangNhapDuAn(admin2, projectId2);
  const { GET } = await import("@/app/api/admin/api-keys/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { keys } = await res.json();
  const { id: createdId } = await created.json();
  assert.equal(
    keys.some((k: { id: number }) => k.id === createdId),
    false,
  );
});

test("POST /api/admin/api-keys: thiếu tên → 400", S, async () => {
  const projectId = await taoDuAn("keys-noname");
  const admin = await taoUser("admin", "keys-noname");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test("POST /api/admin/api-keys: projectId không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("keys-badproj");
  const admin = await taoUser("admin", "keys-badproj");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const res = await POST(jreq("/x", { name: "x", projectId: 999999999 }));
  assert.equal(res.status, 404);
});

test("POST /api/admin/api-keys: scope không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("keys-badscope");
  const admin = await taoUser("admin", "keys-badscope");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const res = await POST(jreq("/x", { name: "x", scopes: ["khong_ton_tai"] }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/admin/api-keys: thành công → trả key thô đúng 1 lần, DB chỉ lưu hash",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("keys-ok");
    const admin = await taoUser("admin", "keys-ok");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/api-keys/route");
    const res = await POST(jreq("/x", { name: `Key ${uniq("keysok")}` }));
    assert.equal(res.status, 201);
    const { id, key } = await res.json();
    assert.match(key, /^xbk_[0-9a-f]+$/);
    const row = await queryOne<{ key_hash: string; org_id: number }>(
      `SELECT key_hash, org_id FROM api_keys WHERE id = ?`,
      id,
    );
    assert.notEqual(row?.key_hash, key);
    assert.equal(row?.org_id, admin.orgId);
  },
);

// ============================================================================
// DELETE /api/admin/api-keys/:id
// ============================================================================

test("DELETE /api/admin/api-keys/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/admin/api-keys/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/admin/api-keys/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("keysdel-bad");
  const admin = await taoUser("admin", "keysdel-bad");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/admin/api-keys/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test(
  "DELETE /api/admin/api-keys/:id: BUG THẬT (đã sửa) — org khác không thu hồi được key này",
  S,
  async () => {
    // Trước khi sửa: route không lọc org_id (khác GET cùng cụm) — admin org B thu hồi được
    // key của org A chỉ bằng cách đoán ID. Nay phải trả 404 và KHÔNG revoke.
    const projectId1 = await taoDuAn("keysdel-iso1", 1);
    const admin1 = await taoUser("admin", "keysdel-iso1", { orgId: 1 });
    await dangNhapDuAn(admin1, projectId1);
    const { POST } = await import("@/app/api/admin/api-keys/route");
    const created = await POST(jreq("/x", { name: `Key ${uniq("keysdeliso")}` }));
    const { id } = await created.json();

    const org2 = await taoToChuc("keysdeliso2");
    const projectId2 = await taoDuAn("keysdel-iso2", org2);
    const admin2 = await taoUser("admin", "keysdel-iso2", { orgId: org2 });
    await dangNhapDuAn(admin2, projectId2);
    const { DELETE } = await import("@/app/api/admin/api-keys/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ revoked_at: string | null }>(
      `SELECT revoked_at FROM api_keys WHERE id = ?`,
      id,
    );
    assert.equal(row?.revoked_at, null, "key của org khác không được thu hồi nhầm");
  },
);

test("DELETE /api/admin/api-keys/:id: cùng org → thu hồi thành công, idempotent", S, async () => {
  const projectId = await taoDuAn("keysdel-ok");
  const admin = await taoUser("admin", "keysdel-ok");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const created = await POST(jreq("/x", { name: `Key ${uniq("keysdelok")}` }));
  const { id } = await created.json();

  const { DELETE } = await import("@/app/api/admin/api-keys/[id]/route");
  const first = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(first.status, 200);
  const second = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(second.status, 200, "gọi lại lần 2 vẫn không lỗi (idempotent)");

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ revoked_at: string | null }>(
    `SELECT revoked_at FROM api_keys WHERE id = ?`,
    id,
  );
  assert.ok(row?.revoked_at != null);
});

// ============================================================================
// GET/POST /api/admin/assignments
// ============================================================================

test("GET /api/admin/assignments: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/assignments/route");
  const res = await GET(jreq("/api/admin/assignments", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/assignments: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("asg-403");
  const eng = await taoUser("engineer", "asg-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/assignments/route");
  const res = await GET(jreq("/api/admin/assignments", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/assignments: PM thấy cây hệ→nhóm→task + workload", S, async () => {
  const projectId = await taoDuAn("asg-ok");
  const pm = await taoUser("pm", "asg-ok");
  const { taskId } = await dungWbs("asg-ok", projectId);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/assignments/route");
  const res = await GET(jreq("/api/admin/assignments", undefined, "GET"));
  assert.equal(res.status, 200);
  const { tasks, workload } = await res.json();
  assert.ok(tasks.some((t: { id: number }) => t.id === taskId));
  assert.equal(typeof workload, "object");
});

test("GET /api/admin/assignments?unassignedOnly=1: chỉ trả task chưa gán", S, async () => {
  const projectId = await taoDuAn("asg-unassigned");
  const pm = await taoUser("pm", "asg-unassigned");
  const { taskId } = await dungWbs("asg-unassigned", projectId);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/assignments/route");
  const res = await GET(
    jreq("/api/admin/assignments?unassignedOnly=1", undefined, "GET"),
  );
  assert.equal(res.status, 200);
  const { tasks } = await res.json();
  assert.ok(tasks.some((t: { id: number }) => t.id === taskId));
  assert.ok(tasks.every((t: { assignedTo: number | null }) => !t.assignedTo));
});

test("POST /api/admin/assignments: tham số không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("asg-badparam");
  const pm = await taoUser("pm", "asg-badparam");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/x", { level: "khong_hop_le", id: 1 }));
  assert.equal(res.status, 400);
});

test("POST /api/admin/assignments: userId không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("asg-nouser");
  const pm = await taoUser("pm", "asg-nouser");
  const { taskId } = await dungWbs("asg-nouser", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/x", { level: "task", id: taskId, userId: 999999999 }));
  assert.equal(res.status, 404);
});

test("POST /api/admin/assignments: đối tượng (task) không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("asg-notarget");
  const pm = await taoUser("pm", "asg-notarget");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/x", { level: "task", id: 999999999, userId: null }));
  assert.equal(res.status, 404);
});

test("POST /api/admin/assignments: gán task cho user → ghi DB", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("asg-assignok");
  const pm = await taoUser("pm", "asg-assignok");
  const eng = await taoUser("engineer", "asg-assignokEng");
  const { taskId } = await dungWbs("asg-assignok", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/x", { level: "task", id: taskId, userId: eng.id }));
  assert.equal(res.status, 200);
  const row = await queryOne<{ assigned_to: number }>(
    `SELECT assigned_to FROM tasks WHERE id = ?`,
    taskId,
  );
  assert.equal(row?.assigned_to, eng.id);
});

// ============================================================================
// GET /api/admin/audit-log (+ export)
// ============================================================================

test("GET /api/admin/audit-log: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/audit-log/route");
  const res = await GET(jreq("/api/admin/audit-log", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/audit-log: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("aud-403");
  const pm = await taoUser("pm", "aud-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/audit-log/route");
  const res = await GET(jreq("/api/admin/audit-log", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/audit-log: lọc theo entity trả đúng dòng", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("aud-filter");
  const admin = await taoUser("admin", "aud-filter");
  const entityId = 424242 + seq;
  await insertId(
    `INSERT INTO audit_log (entity_type, entity_id, action, changes) VALUES ('contracts', ?, 'INSERT', '{}')`,
    entityId,
  );
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/audit-log/route");
  const res = await GET(
    jreq(`/api/admin/audit-log?entity=contracts&entityId=${entityId}`, undefined, "GET"),
  );
  assert.equal(res.status, 200);
  const { rows, total } = await res.json();
  assert.ok(total >= 1);
  assert.ok(rows.every((r: { entityType: string }) => r.entityType === "contracts"));
});

test("GET /api/admin/audit-log/export: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/audit-log/export/route");
  const res = await GET(jreq("/api/admin/audit-log/export", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/audit-log/export: PM không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("audexp-403");
  const pm = await taoUser("pm", "audexp-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/audit-log/export/route");
  const res = await GET(jreq("/api/admin/audit-log/export", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/audit-log/export: Admin → file xlsx hợp lệ (magic PK)", S, async () => {
  const projectId = await taoDuAn("audexp-ok");
  const admin = await taoUser("admin", "audexp-ok");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/audit-log/export/route");
  const res = await GET(jreq("/api/admin/audit-log/export", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
});

// ============================================================================
// GET /api/admin/audit (lịch sử phân công)
// ============================================================================

test("GET /api/admin/audit: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/audit/route");
  const res = await GET(jreq("/api/admin/audit", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/audit: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("asglog-403");
  const eng = await taoUser("engineer", "asglog-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/audit/route");
  const res = await GET(jreq("/api/admin/audit", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/audit: PM thấy lịch sử phân công vừa ghi", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("asglog-ok");
  const pm = await taoUser("pm", "asglog-ok");
  const target = await taoUser("engineer", "asglog-okTarget");
  const logId = await insertId(
    `INSERT INTO assignment_log (level, target_id, target_label, new_user_id, changed_by, is_manual)
     VALUES ('task', 1, 'Task test', ?, ?, true)`,
    target.id,
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/audit/route");
  const res = await GET(jreq("/api/admin/audit?limit=10", undefined, "GET"));
  assert.equal(res.status, 200);
  const { rows } = await res.json();
  assert.ok(rows.some((r: { id: number }) => r.id === logId));
});

// ============================================================================
// GET /api/admin/permissions-snapshot
// ============================================================================

test("GET /api/admin/permissions-snapshot: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/permissions-snapshot/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/permissions-snapshot: PM không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("permsnap-403");
  const pm = await taoUser("pm", "permsnap-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/permissions-snapshot/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/permissions-snapshot: Admin → file xlsx hợp lệ", S, async () => {
  const projectId = await taoDuAn("permsnap-ok");
  const admin = await taoUser("admin", "permsnap-ok");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/permissions-snapshot/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
});

// ============================================================================
// GET /api/admin/sod-report
// ============================================================================

test("GET /api/admin/sod-report: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/sod-report/route");
  const res = await GET(jreq("/api/admin/sod-report", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/sod-report: PM không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("sod-403");
  const pm = await taoUser("pm", "sod-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/sod-report/route");
  const res = await GET(jreq("/api/admin/sod-report", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/sod-report: Admin → trả mảng rule, days lạ rơi về mặc định 90", S, async () => {
  const projectId = await taoDuAn("sod-ok");
  const admin = await taoUser("admin", "sod-ok");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/sod-report/route");
  const res = await GET(jreq("/api/admin/sod-report?days=999", undefined, "GET"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length > 0);
  assert.ok("rule" in body[0] && "violations" in body[0]);
});

// ============================================================================
// GET /api/admin/storage
// ============================================================================

test("GET /api/admin/storage: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/storage/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/storage: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("storage-403");
  const pm = await taoUser("pm", "storage-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/storage/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/storage: Admin → trả dung lượng dạng số", S, async () => {
  const projectId = await taoDuAn("storage-ok");
  const admin = await taoUser("admin", "storage-ok");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/storage/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.bytes, "number");
  assert.equal(typeof body.files, "number");
  assert.equal(typeof body.warnBytes, "number");
});

// ============================================================================
// GET /api/admin/traffic/events (SSE)
// ============================================================================

test("GET /api/admin/traffic/events: chưa đăng nhập → 401 (BUG THẬT đã sửa)", S, async () => {
  // Trước khi sửa: `!user || role !== 'admin'` gộp chung trả 403 kể cả khi CHƯA đăng nhập,
  // sai quy ước "401 khi chưa đăng nhập, 403 khi sai vai trò" của toàn dự án.
  dangXuat();
  const { GET } = await import("@/app/api/admin/traffic/events/route");
  const res = await GET(jreq("/api/admin/traffic/events", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/traffic/events: PM không phải Admin → 403", S, async () => {
  const projectId = await taoDuAn("traffic-403");
  const pm = await taoUser("pm", "traffic-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/traffic/events/route");
  const res = await GET(jreq("/api/admin/traffic/events", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/traffic/events: Admin → stream SSE đúng content-type", S, async () => {
  const projectId = await taoDuAn("traffic-ok");
  const admin = await taoUser("admin", "traffic-ok");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/traffic/events/route");
  const res = await GET(jreq("/api/admin/traffic/events", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  await res.body?.cancel();
});

// ============================================================================
// POST /api/admin/traffic/ingest
// ============================================================================

test("POST /api/admin/traffic/ingest: sai token nội bộ → 401", S, async () => {
  const { POST } = await import("@/app/api/admin/traffic/ingest/route");
  const res = await POST(
    jreq(
      "/api/admin/traffic/ingest",
      { method: "GET", path: "/x" },
      "POST",
      { "x-traffic-token": "sai-token" },
    ),
  );
  assert.equal(res.status, 401);
});

test("POST /api/admin/traffic/ingest: đúng token nhưng thiếu path → 400", S, async () => {
  const { trafficToken, TRAFFIC_TOKEN_HEADER } = await import("@/lib/bao-mat/traffic-token");
  const { POST } = await import("@/app/api/admin/traffic/ingest/route");
  const res = await POST(
    jreq("/api/admin/traffic/ingest", { method: "GET" }, "POST", {
      [TRAFFIC_TOKEN_HEADER]: trafficToken(),
    }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/admin/traffic/ingest: đúng token → ghi vào ring buffer", S, async () => {
  const { trafficToken, TRAFFIC_TOKEN_HEADER } = await import("@/lib/bao-mat/traffic-token");
  const { getRecent } = await import("@/lib/bao-mat/traffic");
  const { POST } = await import("@/app/api/admin/traffic/ingest/route");
  const marker = `/marker-${uniq("traffic")}`;
  const res = await POST(
    jreq(
      "/api/admin/traffic/ingest",
      { method: "GET", path: marker, ip: "1.2.3.4", ua: "test-ua" },
      "POST",
      { [TRAFFIC_TOKEN_HEADER]: trafficToken() },
    ),
  );
  assert.equal(res.status, 200);
  assert.ok(getRecent().some((e) => e.path === marker));
});

// ============================================================================
// POST /api/users/:id/revoke-sessions
// ============================================================================

test("POST /api/users/:id/revoke-sessions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/users/[id]/revoke-sessions/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/users/:id/revoke-sessions: PM không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("revoke-403");
  const pm = await taoUser("pm", "revoke-403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/users/[id]/revoke-sessions/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/users/:id/revoke-sessions: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("revoke-bad");
  const admin = await taoUser("admin", "revoke-bad");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/users/[id]/revoke-sessions/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test(
  "POST /api/users/:id/revoke-sessions: BUG THẬT (đã sửa) — org khác không thu hồi được",
  S,
  async () => {
    const projectId1 = await taoDuAn("revoke-iso1", 1);
    const admin1 = await taoUser("admin", "revoke-iso1", { orgId: 1 });
    const target1 = await taoUser("engineer", "revoke-iso1Target", { orgId: 1 });
    await dangNhapDuAn(admin1, projectId1);

    const org2 = await taoToChuc("revokeiso2");
    const projectId2 = await taoDuAn("revoke-iso2", org2);
    const admin2 = await taoUser("admin", "revoke-iso2", { orgId: org2 });
    await dangNhapDuAn(admin2, projectId2);

    const { POST } = await import("@/app/api/users/[id]/revoke-sessions/route");
    const res = await POST(jreq("/x", undefined, "POST"), {
      params: Promise.resolve({ id: String(target1.id) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ session_version: number }>(
      `SELECT session_version FROM users WHERE id = ?`,
      target1.id,
    );
    assert.equal(Number(row?.session_version), 0, "không bị thu hồi nhầm bởi admin org khác");
  },
);

test("POST /api/users/:id/revoke-sessions: không tìm thấy user → 404", S, async () => {
  const projectId = await taoDuAn("revoke-404");
  const admin = await taoUser("admin", "revoke-404");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/users/[id]/revoke-sessions/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/users/:id/revoke-sessions: thành công → token cũ của user đó hết hiệu lực",
  S,
  async () => {
    const projectId = await taoDuAn("revoke-ok");
    const admin = await taoUser("admin", "revoke-ok");
    const target = await taoUser("engineer", "revoke-okTarget");
    await dangNhapDuAn(admin, projectId);

    const { POST } = await import("@/app/api/users/[id]/revoke-sessions/route");
    const res = await POST(jreq("/x", undefined, "POST"), {
      params: Promise.resolve({ id: String(target.id) }),
    });
    assert.equal(res.status, 200);

    // Dựng lại cookie CŨ của target (sessionVersion = 0) → phải bị coi là hết hạn.
    dangNhap({ id: target.id, passwordHash: target.passwordHash, sessionVersion: 0 });
    const { GET } = await import("@/app/api/auth/me/route");
    const meRes = await GET();
    assert.equal(meRes.status, 401, "token phát trước khi thu hồi phải hết hiệu lực");
  },
);

// ============================================================================
// GET/PUT /api/user-projects
// ============================================================================

test("GET /api/user-projects: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/user-projects/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/user-projects: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("up-403");
  const eng = await taoUser("engineer", "up-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/user-projects/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/user-projects: PM thấy gán vừa tạo", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("up-ok");
  const pm = await taoUser("pm", "up-ok");
  const target = await taoUser("engineer", "up-okTarget");
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    target.id,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/user-projects/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { assignments } = await res.json();
  assert.ok(
    assignments.some(
      (a: { userId: number; projectId: number }) =>
        a.userId === target.id && a.projectId === projectId,
    ),
  );
});

test("PUT /api/user-projects: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/user-projects/route");
  const res = await PUT(jreq("/x", {}, "PUT"));
  assert.equal(res.status, 401);
});

test("PUT /api/user-projects: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("up-put403");
  const eng = await taoUser("engineer", "up-put403");
  await dangNhapDuAn(eng, projectId);
  const { PUT } = await import("@/app/api/user-projects/route");
  const res = await PUT(jreq("/x", { userId: 1, projectIds: [] }, "PUT"));
  assert.equal(res.status, 403);
});

test("PUT /api/user-projects: dữ liệu không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("up-put422");
  const pm = await taoUser("pm", "up-put422");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/user-projects/route");
  const res = await PUT(jreq("/x", { userId: "abc", projectIds: [1] }, "PUT"));
  assert.equal(res.status, 422);
});

test("PUT /api/user-projects: thay toàn bộ danh sách dự án của 1 user", S, async () => {
  const { query } = await import("@/lib/db");
  const projectA = await taoDuAn("up-putokA");
  const projectB = await taoDuAn("up-putokB");
  const pm = await taoUser("pm", "up-putok");
  const target = await taoUser("engineer", "up-putokTarget");
  await dangNhapDuAn(pm, projectA);
  const { PUT } = await import("@/app/api/user-projects/route");
  const res = await PUT(
    jreq("/x", { userId: target.id, projectIds: [projectA, projectB] }, "PUT"),
  );
  assert.equal(res.status, 200);
  const rows = await query<{ project_id: number }>(
    `SELECT project_id FROM user_projects WHERE user_id = ? ORDER BY project_id`,
    target.id,
  );
  assert.deepEqual(
    rows.map((r) => r.project_id).sort((a, b) => a - b),
    [projectA, projectB].sort((a, b) => a - b),
  );
});

// ============================================================================
// POST /api/project/select
// ============================================================================

test("POST /api/project/select: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/project/select/route");
  const res = await POST(jreq("/x", { projectId: 1 }));
  assert.equal(res.status, 401);
});

test("POST /api/project/select: thiếu projectId → 400", S, async () => {
  const projectId = await taoDuAn("sel-400");
  const pm = await taoUser("pm", "sel-400");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/project/select/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test("POST /api/project/select: dự án không thấy được → 403", S, async () => {
  const { run } = await import("@/lib/db");
  const projectA = await taoDuAn("sel-403A");
  const projectB = await taoDuAn("sel-403B");
  const pm = await taoUser("pm", "sel-403");
  const other = await taoUser("pm", "sel-403Other");
  // user_projects khác rỗng (do "other" được gán) → pm không thấy dự án nào ngoài của mình.
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pm.id, projectA);
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectB);
  try {
    await dangNhapDuAn(pm, projectA);
    const { POST } = await import("@/app/api/project/select/route");
    const res = await POST(jreq("/x", { projectId: projectB }));
    assert.equal(res.status, 403);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id IN (?, ?)`, pm.id, other.id);
  }
});

test("POST /api/project/select: thành công → set cookie xboss_project", S, async () => {
  const projectId = await taoDuAn("sel-ok");
  const pm = await taoUser("pm", "sel-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/project/select/route");
  const res = await POST(jreq("/x", { projectId }));
  assert.equal(res.status, 200);
  const { PROJECT_COOKIE } = await import("@/lib/ha-tang/projects");
  const cookie = res.cookies.get(PROJECT_COOKIE);
  assert.equal(cookie?.value, String(projectId));
});

// ============================================================================
// POST /api/projects/:id/clone-config
// ============================================================================

test("POST /api/projects/:id/clone-config: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(jreq("/x", { name: "x" }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/projects/:id/clone-config: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("clone-403");
  const pm = await taoUser("pm", "clone-403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(jreq("/x", { name: "x" }), {
    params: Promise.resolve({ id: String(projectId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/projects/:id/clone-config: ID nguồn không phải số → 400", S, async () => {
  const projectId = await taoDuAn("clone-badid");
  const admin = await taoUser("admin", "clone-badid");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(jreq("/x", { name: "x" }), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/projects/:id/clone-config: dự án nguồn không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("clone-404");
  const admin = await taoUser("admin", "clone-404");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(jreq("/x", { name: "x" }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/projects/:id/clone-config: thiếu tên dự án mới → 400", S, async () => {
  const projectId = await taoDuAn("clone-noname");
  const admin = await taoUser("admin", "clone-noname");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(jreq("/x", {}), {
    params: Promise.resolve({ id: String(projectId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/projects/:id/clone-config: mã dự án trùng trong org → 409", S, async () => {
  const projectId = await taoDuAn("clone-dupsrc");
  const admin = await taoUser("admin", "clone-dupsrc");
  const dupCode = `DUP-${uniq("clone")}`;
  const { run } = await import("@/lib/db");
  await run(`UPDATE projects SET code = ? WHERE id = ?`, dupCode, projectId);
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(jreq("/x", { name: "Dự án mới", code: dupCode }), {
    params: Promise.resolve({ id: String(projectId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/projects/:id/clone-config: thành công → tạo dự án mới", S, async () => {
  const projectId = await taoDuAn("clone-ok");
  const admin = await taoUser("admin", "clone-ok");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/projects/[id]/clone-config/route");
  const res = await POST(
    jreq("/x", { name: `Dự án sao chép ${uniq("cloneok")}` }),
    { params: Promise.resolve({ id: String(projectId) }) },
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.ok(id);
  assert.notEqual(id, projectId);
});

// ============================================================================
// PATCH /api/auth/password
// ============================================================================

async function taoUserMatKhau(role: string, ten: string, matKhau: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/bao-mat/auth");
  const email = `qt2pw-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, 1)`,
    `QT2PW ${ten}`,
    email,
    hashPassword(matKhau),
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, email, passwordHash: u!.password_hash };
}

async function xoaRateLimitPw() {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM login_rate_limits`);
}

test("PATCH /api/auth/password: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/auth/password/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"));
  assert.equal(res.status, 401);
});

test("PATCH /api/auth/password: mật khẩu mới quá ngắn → 400", S, async () => {
  await xoaRateLimitPw();
  const u = await taoUserMatKhau("pm", "pwshort", "matkhaucu123");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/auth/password/route");
  const res = await PATCH(
    jreq("/x", { oldPassword: "matkhaucu123", newPassword: "123" }, "PATCH"),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/auth/password: mật khẩu cũ sai → 401", S, async () => {
  await xoaRateLimitPw();
  const u = await taoUserMatKhau("pm", "pwwrong", "matkhaucu123");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/auth/password/route");
  const res = await PATCH(
    jreq("/x", { oldPassword: "sai-mat-khau", newPassword: "matkhaumoi123" }, "PATCH"),
  );
  assert.equal(res.status, 401);
});

test("PATCH /api/auth/password: quá 5 lần sai → 429", S, async () => {
  await xoaRateLimitPw();
  const u = await taoUserMatKhau("pm", "pwbrute", "matkhaucu123");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/auth/password/route");
  for (let i = 0; i < 5; i++) {
    const r = await PATCH(
      jreq("/x", { oldPassword: "sai", newPassword: "matkhaumoi123" }, "PATCH"),
    );
    assert.equal(r.status, 401);
  }
  const chan = await PATCH(
    jreq("/x", { oldPassword: "sai", newPassword: "matkhaumoi123" }, "PATCH"),
  );
  assert.equal(chan.status, 429);
});

test("PATCH /api/auth/password: đổi thành công → cookie mới verify đúng hash mới", S, async () => {
  await xoaRateLimitPw();
  const u = await taoUserMatKhau("pm", "pwok", "matkhaucu123");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/auth/password/route");
  const res = await PATCH(
    jreq("/x", { oldPassword: "matkhaucu123", newPassword: "matkhaumoi123" }, "PATCH"),
  );
  assert.equal(res.status, 200);
  const { COOKIE, parseToken } = await import("@/lib/bao-mat/session-token");
  const cookie = res.cookies.get(COOKIE);
  assert.ok(cookie);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    u.id,
  );
  const parsed = parseToken(cookie!.value);
  assert.ok(row!.password_hash.startsWith(parsed!.pwFrag));
});

// ============================================================================
// GET/DELETE /api/auth/totp + POST setup/confirm
// ============================================================================

async function sinhMaTotp(secret: string): Promise<string> {
  const { generate } = await import("otplib");
  return generate({ secret, digits: 6, period: 30 });
}

test("GET /api/auth/totp: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/auth/totp/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/auth/totp: mặc định chưa bật", S, async () => {
  const u = await taoUser("pm", "totp-off");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { GET } = await import("@/app/api/auth/totp/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).enabled, false);
});

test("POST /api/auth/totp/setup: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/auth/totp/setup/route");
  const res = await POST();
  assert.equal(res.status, 401);
});

test("POST /api/auth/totp/setup: sinh secret + 8 recovery code", S, async () => {
  const u = await taoUser("pm", "totp-setup");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { POST } = await import("@/app/api/auth/totp/setup/route");
  const res = await POST();
  assert.equal(res.status, 200);
  const { otpauthUri, recoveryCodes } = await res.json();
  assert.match(otpauthUri, /^otpauth:\/\//);
  assert.equal(recoveryCodes.length, 8);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ totp_secret: string | null; totp_enabled_at: string | null }>(
    `SELECT totp_secret, totp_enabled_at FROM users WHERE id = ?`,
    u.id,
  );
  assert.ok(row?.totp_secret);
  assert.equal(row?.totp_enabled_at, null, "chưa confirm thì chưa thật sự bật 2FA");
});

test("POST /api/auth/totp/confirm: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/auth/totp/confirm/route");
  const res = await POST(jreq("/x", { code: "123456" }));
  assert.equal(res.status, 401);
});

test("POST /api/auth/totp/confirm: chưa gọi setup → 400", S, async () => {
  const u = await taoUser("pm", "totp-noconfirm");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { POST } = await import("@/app/api/auth/totp/confirm/route");
  const res = await POST(jreq("/x", { code: "123456" }));
  assert.equal(res.status, 400);
});

test("POST /api/auth/totp/confirm: mã sai → 401", S, async () => {
  const u = await taoUser("pm", "totp-wrongcode");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { POST: setupPost } = await import("@/app/api/auth/totp/setup/route");
  await setupPost();
  const { POST } = await import("@/app/api/auth/totp/confirm/route");
  const res = await POST(jreq("/x", { code: "000000" }));
  assert.equal(res.status, 401);
});

test("POST /api/auth/totp/confirm: mã đúng → bật 2FA, cấp lại cookie mustSetup2fa=false", S, async () => {
  const { decryptTotpSecret } = await import("@/lib/bao-mat/totp");
  const { queryOne } = await import("@/lib/db");
  const u = await taoUser("admin", "totp-confirmok");
  dangNhap({ id: u.id, passwordHash: u.passwordHash, mustSetup2fa: true });
  const { POST: setupPost } = await import("@/app/api/auth/totp/setup/route");
  await setupPost();
  const row = await queryOne<{ totp_secret: string }>(
    `SELECT totp_secret FROM users WHERE id = ?`,
    u.id,
  );
  const secret = decryptTotpSecret(row!.totp_secret);
  const code = await sinhMaTotp(secret);

  const { POST } = await import("@/app/api/auth/totp/confirm/route");
  const res = await POST(jreq("/x", { code }));
  assert.equal(res.status, 200);

  const { COOKIE, parseToken } = await import("@/lib/bao-mat/session-token");
  const cookie = res.cookies.get(COOKIE);
  assert.ok(cookie);
  const parsed = parseToken(cookie!.value);
  assert.equal(parsed?.mustSetup2fa, false);

  const after = await queryOne<{ totp_enabled_at: string | null }>(
    `SELECT totp_enabled_at FROM users WHERE id = ?`,
    u.id,
  );
  assert.ok(after?.totp_enabled_at != null);
});

test("DELETE /api/auth/totp: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/auth/totp/route");
  const res = await DELETE(jreq("/x", { password: "x", code: "123456" }, "DELETE"));
  assert.equal(res.status, 401);
});

test("DELETE /api/auth/totp: thiếu password/code → 400", S, async () => {
  const u = await taoUser("pm", "totp-del400");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { DELETE } = await import("@/app/api/auth/totp/route");
  const res = await DELETE(jreq("/x", {}, "DELETE"));
  assert.equal(res.status, 400);
});

test("DELETE /api/auth/totp: mật khẩu sai → 401", S, async () => {
  const u = await taoUserMatKhau("pm", "totp-delwrong", "matkhaudel123");
  const { run } = await import("@/lib/db");
  const { encryptTotpSecret, generateNewTotpSecret } = await import("@/lib/bao-mat/totp");
  await run(
    `UPDATE users SET totp_secret = ?, totp_enabled_at = now() WHERE id = ?`,
    encryptTotpSecret(generateNewTotpSecret()),
    u.id,
  );
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { DELETE } = await import("@/app/api/auth/totp/route");
  const res = await DELETE(jreq("/x", { password: "sai", code: "123456" }, "DELETE"));
  assert.equal(res.status, 401);
});

test("DELETE /api/auth/totp: mã TOTP đúng → tắt 2FA thành công", S, async () => {
  const u = await taoUserMatKhau("pm", "totp-delok", "matkhaudel123");
  const { run, queryOne } = await import("@/lib/db");
  const { encryptTotpSecret, generateNewTotpSecret } = await import("@/lib/bao-mat/totp");
  const secret = generateNewTotpSecret();
  await run(
    `UPDATE users SET totp_secret = ?, totp_enabled_at = now() WHERE id = ?`,
    encryptTotpSecret(secret),
    u.id,
  );
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const code = await sinhMaTotp(secret);
  const { DELETE } = await import("@/app/api/auth/totp/route");
  const res = await DELETE(jreq("/x", { password: "matkhaudel123", code }, "DELETE"));
  assert.equal(res.status, 200);
  const row = await queryOne<{ totp_enabled_at: string | null }>(
    `SELECT totp_enabled_at FROM users WHERE id = ?`,
    u.id,
  );
  assert.equal(row?.totp_enabled_at, null);
});

test("DELETE /api/auth/totp: dùng recovery code hợp lệ → tắt 2FA", S, async () => {
  const u = await taoUserMatKhau("pm", "totp-delrecov", "matkhaudel123");
  const { run } = await import("@/lib/db");
  const { encryptTotpSecret, generateNewTotpSecret } = await import("@/lib/bao-mat/totp");
  const { hashPassword } = await import("@/lib/bao-mat/auth");
  await run(
    `UPDATE users SET totp_secret = ?, totp_enabled_at = now() WHERE id = ?`,
    encryptTotpSecret(generateNewTotpSecret()),
    u.id,
  );
  const recoveryRaw = "abcd1-efgh2";
  await run(
    `INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
    u.id,
    hashPassword(recoveryRaw),
  );
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { DELETE } = await import("@/app/api/auth/totp/route");
  const res = await DELETE(
    jreq("/x", { password: "matkhaudel123", code: recoveryRaw }, "DELETE"),
  );
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/PATCH /api/nav-settings
// ============================================================================

test("GET /api/nav-settings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/nav-settings/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/nav-settings: mọi vai trò đăng nhập đọc được", S, async () => {
  const projectId = await taoDuAn("nav-get");
  const eng = await taoUser("engineer", "nav-get");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/nav-settings/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { settings } = await res.json();
  assert.equal(typeof settings, "object");
});

test("PATCH /api/nav-settings: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("nav-403");
  const eng = await taoUser("engineer", "nav-403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/nav-settings/route");
  const res = await PATCH(jreq("/x", { nodeKey: "dash.site-command", enabled: false }, "PATCH"));
  assert.equal(res.status, 403);
});

test("PATCH /api/nav-settings: nodeKey không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("nav-422");
  const pm = await taoUser("pm", "nav-422");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/nav-settings/route");
  const res = await PATCH(jreq("/x", { nodeKey: "khong_ton_tai", enabled: false }, "PATCH"));
  assert.equal(res.status, 422);
});

test("PATCH /api/nav-settings: scope=project mà chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("nav-noproj");
  const pm = await taoUser("pm", "nav-noproj");
  const other = await taoUser("pm", "nav-noprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { PATCH } = await import("@/app/api/nav-settings/route");
    const res = await PATCH(
      jreq("/x", { nodeKey: "dash.site-command", enabled: false, scope: "project" }, "PATCH"),
    );
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("PATCH /api/nav-settings: PM tắt 1 mục — ghi DB thành công", S, async () => {
  const projectId = await taoDuAn("nav-ok");
  const pm = await taoUser("pm", "nav-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/nav-settings/route");
  const res = await PATCH(jreq("/x", { nodeKey: "dash.site-command", enabled: false }, "PATCH"));
  assert.equal(res.status, 200);
  const { GET } = await import("@/app/api/nav-settings/route");
  const after = await (await GET()).json();
  assert.equal(after.settings["dash.site-command"], false);
});

test(
  "PATCH /api/nav-settings: Admin bật lại 1 mục toàn hệ (false→true) → thông báo cho mọi PM",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("nav-notify");
    const admin = await taoUser("admin", "nav-notify");
    const pm = await taoUser("pm", "nav-notifyPm");
    const nodeKey = "dash.schedule-control";
    await dangNhapDuAn(admin, projectId);
    const { PATCH } = await import("@/app/api/nav-settings/route");
    // Tắt trước để đảm bảo chuyển đúng chiều false→true (wasEnabled=false) kích hoạt thông báo.
    await PATCH(jreq("/x", { nodeKey, enabled: false }, "PATCH"));
    const res = await PATCH(jreq("/x", { nodeKey, enabled: true }, "PATCH"));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).changed, true);

    const rows = await query<{ id: number }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'nav_enabled' AND nav_node_key = ?`,
      pm.id,
      nodeKey,
    );
    assert.ok(rows.length >= 1, "phải tạo thông báo nav_enabled cho PM");
  },
);

// ============================================================================
// GET/PATCH /api/ui-texts
// ============================================================================

test("GET /api/ui-texts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/ui-texts/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("PATCH /api/ui-texts: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("uitext-403");
  const pm = await taoUser("pm", "uitext-403");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/ui-texts/route");
  const res = await PATCH(jreq("/x", { key: "x", value: "y" }, "PATCH"));
  assert.equal(res.status, 403);
});

test("PATCH /api/ui-texts: thiếu key → 400", S, async () => {
  const projectId = await taoDuAn("uitext-400");
  const admin = await taoUser("admin", "uitext-400");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/ui-texts/route");
  const res = await PATCH(jreq("/x", { value: "y" }, "PATCH"));
  assert.equal(res.status, 400);
});

test("GET /api/ui-texts: ui_texts lưu JSON hỏng trong DB → không lỗi, trả rỗng", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("uitext-badjson");
  const admin = await taoUser("admin", "uitext-badjson");
  await run(
    `UPDATE projects SET ui_texts = '{khong-phai-json' WHERE id = (SELECT id FROM projects ORDER BY id LIMIT 1)`,
  );
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/ui-texts/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(typeof (await res.json()).texts, "object");
});

test("PATCH /api/ui-texts: đặt rồi xoá override — GET phản ánh đúng", S, async () => {
  const projectId = await taoDuAn("uitext-ok");
  const admin = await taoUser("admin", "uitext-ok");
  await dangNhapDuAn(admin, projectId);
  const key = `title.${uniq("uitext")}`;
  const { PATCH } = await import("@/app/api/ui-texts/route");
  const set = await PATCH(jreq("/x", { key, value: "Giá trị mới" }, "PATCH"));
  assert.equal(set.status, 200);
  assert.equal((await set.json()).texts[key], "Giá trị mới");

  const { GET } = await import("@/app/api/ui-texts/route");
  const after = await (await GET()).json();
  assert.equal(after.texts[key], "Giá trị mới");

  const unset = await PATCH(jreq("/x", { key, value: "" }, "PATCH"));
  assert.equal(unset.status, 200);
  assert.equal(key in (await unset.json()).texts, false);
});

// ============================================================================
// GET /api/feature-flags
// ============================================================================

test("GET /api/feature-flags: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/feature-flags/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/feature-flags: trả bản đồ module → bật/tắt", S, async () => {
  const projectId = await taoDuAn("flags-ok");
  const eng = await taoUser("engineer", "flags-ok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/feature-flags/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { flags } = await res.json();
  assert.equal(typeof flags, "object");
  assert.ok("tracking" in flags);
});

// ============================================================================
// GET /api/code-lists
// ============================================================================

test("GET /api/code-lists: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/code-lists/route");
  const res = await GET(jreq("/api/code-lists", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/code-lists: thiếu domain → 400", S, async () => {
  const projectId = await taoDuAn("cl-400");
  const eng = await taoUser("engineer", "cl-400");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/code-lists/route");
  const res = await GET(jreq("/api/code-lists", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("GET /api/code-lists: mặc định chỉ trả mục active, ?all=1 trả cả tắt", S, async () => {
  const { insertId } = await import("@/lib/db");
  const domain = `dom-${uniq("cl")}`;
  await insertId(
    `INSERT INTO code_lists (domain, code, label, active) VALUES (?, 'c1', 'Active', true)`,
    domain,
  );
  await insertId(
    `INSERT INTO code_lists (domain, code, label, active) VALUES (?, 'c2', 'Inactive', false)`,
    domain,
  );
  const projectId = await taoDuAn("cl-ok");
  const eng = await taoUser("engineer", "cl-ok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/code-lists/route");
  const onlyActive = await GET(jreq(`/api/code-lists?domain=${domain}`, undefined, "GET"));
  assert.equal((await onlyActive.json()).items.length, 1);
  const all = await GET(jreq(`/api/code-lists?domain=${domain}&all=1`, undefined, "GET"));
  assert.equal((await all.json()).items.length, 2);
});

// ============================================================================
// GET /api/custom-fields
// ============================================================================

test("GET /api/custom-fields: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/custom-fields/route");
  const res = await GET(jreq("/api/custom-fields?entityType=task", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/custom-fields: entityType không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("cf-400");
  const eng = await taoUser("engineer", "cf-400");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/custom-fields/route");
  const res = await GET(
    jreq("/api/custom-fields?entityType=khong_ton_tai", undefined, "GET"),
  );
  assert.equal(res.status, 400);
});

test("GET /api/custom-fields: entityType hợp lệ → 200", S, async () => {
  const projectId = await taoDuAn("cf-ok");
  const eng = await taoUser("engineer", "cf-ok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/custom-fields/route");
  const res = await GET(jreq("/api/custom-fields?entityType=task", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((await res.json()).defs));
});

// ============================================================================
// GET/PUT /api/raci
// ============================================================================

test("GET /api/raci: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/raci/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/raci: chưa có dự án nào → items rỗng", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("raci-noproj");
  const pm = await taoUser("pm", "raci-noproj");
  const other = await taoUser("pm", "raci-noprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { GET } = await import("@/app/api/raci/route");
    const res = await GET();
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).items, []);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("GET /api/raci: có dự án và dữ liệu → trả đúng dòng đã lưu", S, async () => {
  const projectId = await taoDuAn("raci-getok");
  const pm = await taoUser("pm", "raci-getok");
  await dangNhapDuAn(pm, projectId);
  const scope = `Quy trình ${uniq("racigetok")}`;
  const { PUT } = await import("@/app/api/raci/route");
  await PUT(jreq("/x", { scope, rows: [{ roleLabel: "PM", raci: "A" }] }, "PUT"));
  const { GET } = await import("@/app/api/raci/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.ok(items.some((i: { scope: string; roleLabel: string }) => i.scope === scope && i.roleLabel === "PM"));
});

test("PUT /api/raci: thiếu tên vai trò trong 1 dòng → 422", S, async () => {
  const projectId = await taoDuAn("raci-norole");
  const pm = await taoUser("pm", "raci-norole");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/raci/route");
  const res = await PUT(
    jreq("/x", { scope: "Quy trình Y", rows: [{ roleLabel: "", raci: "A" }] }, "PUT"),
  );
  assert.equal(res.status, 422);
});

test("PUT /api/raci: personnelId không phải số nguyên → 422", S, async () => {
  const projectId = await taoDuAn("raci-badpersonnel");
  const pm = await taoUser("pm", "raci-badpersonnel");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/raci/route");
  const res = await PUT(
    jreq(
      "/x",
      { scope: "Quy trình Z", rows: [{ roleLabel: "PM", raci: "A", personnelId: "abc" }] },
      "PUT",
    ),
  );
  assert.equal(res.status, 422);
});

test("PUT /api/raci: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("raci-putnoproj");
  const pm = await taoUser("pm", "raci-putnoproj");
  const other = await taoUser("pm", "raci-putnoprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { PUT } = await import("@/app/api/raci/route");
    const res = await PUT(
      jreq("/x", { scope: "Quy trình N", rows: [{ roleLabel: "PM", raci: "A" }] }, "PUT"),
    );
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("PUT /api/raci: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/raci/route");
  const res = await PUT(jreq("/x", {}, "PUT"));
  assert.equal(res.status, 401);
});

test("PUT /api/raci: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("raci-403");
  const eng = await taoUser("engineer", "raci-403");
  await dangNhapDuAn(eng, projectId);
  const { PUT } = await import("@/app/api/raci/route");
  const res = await PUT(jreq("/x", { scope: "x", rows: [] }, "PUT"));
  assert.equal(res.status, 403);
});

test("PUT /api/raci: thiếu scope → 422", S, async () => {
  const projectId = await taoDuAn("raci-noscope");
  const pm = await taoUser("pm", "raci-noscope");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/raci/route");
  const res = await PUT(jreq("/x", { rows: [] }, "PUT"));
  assert.equal(res.status, 422);
});

test("PUT /api/raci: giá trị RACI không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("raci-badval");
  const pm = await taoUser("pm", "raci-badval");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/raci/route");
  const res = await PUT(
    jreq("/x", { scope: "Quy trình X", rows: [{ roleLabel: "PM", raci: "Z" }] }, "PUT"),
  );
  assert.equal(res.status, 422);
});

test("PUT /api/raci: thay toàn bộ dòng của 1 scope, không đụng scope khác", S, async () => {
  const { query } = await import("@/lib/db");
  const projectId = await taoDuAn("raci-ok");
  const pm = await taoUser("pm", "raci-ok");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/raci/route");
  const scopeA = `Quy trình A ${uniq("raci")}`;
  const scopeB = `Quy trình B ${uniq("raci")}`;
  await PUT(
    jreq("/x", { scope: scopeA, rows: [{ roleLabel: "PM", raci: "A" }] }, "PUT"),
  );
  await PUT(
    jreq("/x", { scope: scopeB, rows: [{ roleLabel: "KS", raci: "R" }] }, "PUT"),
  );
  const res = await PUT(
    jreq(
      "/x",
      { scope: scopeA, rows: [{ roleLabel: "PM", raci: "C" }, { roleLabel: "QS", raci: "I" }] },
      "PUT",
    ),
  );
  assert.equal(res.status, 200);
  const rowsA = await query<{ role_label: string; raci: string }>(
    `SELECT role_label, raci FROM raci_matrix WHERE project_id = ? AND scope = ? ORDER BY role_label`,
    projectId,
    scopeA,
  );
  assert.equal(rowsA.length, 2);
  const rowsB = await query(
    `SELECT id FROM raci_matrix WHERE project_id = ? AND scope = ?`,
    projectId,
    scopeB,
  );
  assert.equal(rowsB.length, 1, "scope khác không bị đụng");
});

// ============================================================================
// GET/POST /api/presence
// ============================================================================

test("POST /api/presence: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/presence/route");
  const res = await POST();
  assert.equal(res.status, 401);
});

test("GET /api/presence: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/presence/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/presence: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("presence-403");
  const pm = await taoUser("pm", "presence-403");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/presence/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST → GET /api/presence: heartbeat rồi Admin thấy user đang online", S, async () => {
  const projectId = await taoDuAn("presence-ok");
  const eng = await taoUser("engineer", "presence-ok");
  const admin = await taoUser("admin", "presence-okAdmin");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/presence/route");
  assert.equal((await POST()).status, 200);

  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/presence/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { users } = await res.json();
  assert.ok(users.some((u: { userId: number }) => u.userId === eng.id));
});

// ============================================================================
// GET/POST/DELETE /api/push/subscribe
// ============================================================================

test("GET /api/push/subscribe: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/push/subscribe/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/push/subscribe: chưa cấu hình VAPID → key null (không lộ config)", S, async () => {
  const projectId = await taoDuAn("push-getok");
  const eng = await taoUser("engineer", "push-getok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/push/subscribe/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).key, null);
});

test("POST /api/push/subscribe: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/push/subscribe/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/push/subscribe: subscription không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("push-400");
  const eng = await taoUser("engineer", "push-400");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/push/subscribe/route");
  const res = await POST(jreq("/x", { endpoint: "https://x" }));
  assert.equal(res.status, 400);
});

test("POST /api/push/subscribe: gọi 2 lần cùng endpoint → chỉ 1 dòng (upsert)", S, async () => {
  const { query } = await import("@/lib/db");
  const projectId = await taoDuAn("push-upsert");
  const eng = await taoUser("engineer", "push-upsert");
  await dangNhapDuAn(eng, projectId);
  const endpoint = `https://push.test/${uniq("pushsub")}`;
  const body = { endpoint, keys: { p256dh: "p256dh-val", auth: "auth-val" } };
  const { POST } = await import("@/app/api/push/subscribe/route");
  assert.equal((await POST(jreq("/x", body))).status, 200);
  assert.equal((await POST(jreq("/x", body))).status, 200);
  const rows = await query(`SELECT id FROM push_subscriptions WHERE endpoint = ?`, endpoint);
  assert.equal(rows.length, 1);
});

test("DELETE /api/push/subscribe: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/push/subscribe/route");
  const res = await DELETE(jreq("/x", {}, "DELETE"));
  assert.equal(res.status, 401);
});

test("DELETE /api/push/subscribe: thiếu endpoint → 400", S, async () => {
  const projectId = await taoDuAn("push-del400");
  const eng = await taoUser("engineer", "push-del400");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/push/subscribe/route");
  const res = await DELETE(jreq("/x", {}, "DELETE"));
  assert.equal(res.status, 400);
});

test("DELETE /api/push/subscribe: chỉ xoá subscription của chính mình", S, async () => {
  const { query, run } = await import("@/lib/db");
  const projectId = await taoDuAn("push-delown");
  const a = await taoUser("engineer", "push-delownA");
  const b = await taoUser("engineer", "push-delownB");
  const endpoint = `https://push.test/${uniq("pushdel")}`;
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, 'p', 'a')`,
    a.id,
    endpoint,
  );
  await dangNhapDuAn(b, projectId);
  const { DELETE } = await import("@/app/api/push/subscribe/route");
  const res = await DELETE(jreq("/x", { endpoint }, "DELETE"));
  assert.equal(res.status, 200);
  const rows = await query(`SELECT id FROM push_subscriptions WHERE endpoint = ?`, endpoint);
  assert.equal(rows.length, 1, "không được xoá subscription của người khác");
});

// ============================================================================
// PATCH /api/notifications/:id/read
// ============================================================================

test("PATCH /api/notifications/:id/read: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/notifications/[id]/read/route");
  const res = await PATCH(jreq("/x", undefined, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/notifications/:id/read: ID không phải số → 400", S, async () => {
  const u = await taoUser("pm", "notifread-bad");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/notifications/[id]/read/route");
  const res = await PATCH(jreq("/x", undefined, "PATCH"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/notifications/:id/read: thông báo của người khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await taoUser("pm", "notifread-otherA");
  const b = await taoUser("pm", "notifread-otherB");
  const notifId = await insertId(
    `INSERT INTO notifications (user_id, type, message) VALUES (?, 'delayed', 'x')`,
    a.id,
  );
  dangNhap({ id: b.id, passwordHash: b.passwordHash });
  const { PATCH } = await import("@/app/api/notifications/[id]/read/route");
  const res = await PATCH(jreq("/x", undefined, "PATCH"), {
    params: Promise.resolve({ id: String(notifId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/notifications/:id/read: đánh dấu đã đọc thành công", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const u = await taoUser("pm", "notifread-ok");
  const notifId = await insertId(
    `INSERT INTO notifications (user_id, type, message) VALUES (?, 'delayed', 'x')`,
    u.id,
  );
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/notifications/[id]/read/route");
  const res = await PATCH(jreq("/x", undefined, "PATCH"), {
    params: Promise.resolve({ id: String(notifId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ is_read: number }>(
    `SELECT is_read FROM notifications WHERE id = ?`,
    notifId,
  );
  assert.equal(Number(row?.is_read), 1);
});

// ============================================================================
// GET /api/notifications/feed
// ============================================================================

test("GET /api/notifications/feed: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/notifications/feed/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/notifications/feed: PM (fullAccess) → trả đủ cấu trúc feed", S, async () => {
  const projectId = await taoDuAn("feed-pm");
  const pm = await taoUser("pm", "feed-pm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/notifications/feed/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fullAccess, true);
  assert.ok(Array.isArray(body.overdue));
  assert.ok(Array.isArray(body.dueSoon));
  assert.ok(Array.isArray(body.recentActivity));
});

test("GET /api/notifications/feed: subcon chỉ thấy task được giao (fullAccess=false)", S, async () => {
  const projectId = await taoDuAn("feed-subcon");
  const sub = await taoUser("subcon", "feed-subcon");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/notifications/feed/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).fullAccess, false);
});

test("GET /api/notifications/feed: tắt hết prefs → mọi mục rỗng, không lỗi", S, async () => {
  const { run } = await import("@/lib/db");
  const { PREF_KEYS } = await import("@/lib/van-hanh/notification-prefs");
  const projectId = await taoDuAn("feed-noprefs");
  const pm = await taoUser("pm", "feed-noprefs");
  const prefsOff = Object.fromEntries(PREF_KEYS.map((k) => [k, false]));
  await run(
    `INSERT INTO notification_prefs (user_id, prefs) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`,
    pm.id,
    JSON.stringify(prefsOff),
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/notifications/feed/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.overdue, []);
  assert.deepEqual(body.dueSoon, []);
  assert.deepEqual(body.upcomingStart, []);
  assert.deepEqual(body.recentActivity, []);
  assert.deepEqual(body.materialOver, []);
});

// ============================================================================
// GET/PATCH /api/notifications/prefs
// ============================================================================

test("GET /api/notifications/prefs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/notifications/prefs/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("PATCH /api/notifications/prefs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/notifications/prefs/route");
  const res = await PATCH(jreq("/x", { key: "delayed", enabled: false }, "PATCH"));
  assert.equal(res.status, 401);
});

test("PATCH /api/notifications/prefs: key không hợp lệ → 400", S, async () => {
  const u = await taoUser("pm", "prefs-400");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/notifications/prefs/route");
  const res = await PATCH(jreq("/x", { key: "khong_ton_tai", enabled: false }, "PATCH"));
  assert.equal(res.status, 400);
});

test("PATCH → GET /api/notifications/prefs: đổi 1 khoá, GET phản ánh đúng", S, async () => {
  const u = await taoUser("pm", "prefs-ok");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { PATCH } = await import("@/app/api/notifications/prefs/route");
  const res = await PATCH(jreq("/x", { key: "delayed", enabled: false }, "PATCH"));
  assert.equal(res.status, 200);
  const { GET } = await import("@/app/api/notifications/prefs/route");
  const after = await (await GET()).json();
  assert.equal(after.prefs.delayed, false);
});

// ============================================================================
// POST /api/integrations/:provider/sync
// ============================================================================

test("POST /api/integrations/:provider/sync: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/integrations/[provider]/sync/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ provider: "x" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/integrations/:provider/sync: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("integ-403");
  const eng = await taoUser("engineer", "integ-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/integrations/[provider]/sync/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ provider: "x" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/integrations/:provider/sync: chưa chọn dự án → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("integ-noproj");
  const pm = await taoUser("pm", "integ-noproj");
  const other = await taoUser("pm", "integ-noprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/integrations/[provider]/sync/route");
    const res = await POST(jreq("/x", undefined, "POST"), {
      params: Promise.resolve({ provider: "x" }),
    });
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test(
  "POST /api/integrations/:provider/sync: provider chưa đăng ký adapter → 422 (KHÔNG gọi mạng)",
  S,
  async () => {
    const projectId = await taoDuAn("integ-noadapter");
    const pm = await taoUser("pm", "integ-noadapter");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/integrations/[provider]/sync/route");
    const res = await POST(jreq("/x", undefined, "POST"), {
      params: Promise.resolve({ provider: `khong-dang-ky-${uniq("integ")}` }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /adapter/i);
  },
);

test(
  "POST /api/integrations/:provider/sync: tích hợp chưa bật (active=false) → 422",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const { registerAdapter } = await import("@/lib/ha-tang/integrations/core");
    const provider = `test-provider-${uniq("integ")}`;
    registerAdapter({
      provider,
      pushEntities: [],
      fetchRows: async () => [],
      push: async () => [],
    });
    const projectId = await taoDuAn("integ-inactive");
    const pm = await taoUser("pm", "integ-inactive");
    await insertId(
      `INSERT INTO integrations (provider, project_id, active) VALUES (?, ?, false)`,
      provider,
      projectId,
    );
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/integrations/[provider]/sync/route");
    const res = await POST(jreq("/x", undefined, "POST"), {
      params: Promise.resolve({ provider }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /chưa được bật/);
  },
);

// ============================================================================
// GET /api/import/batches
// ============================================================================

test("GET /api/import/batches: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/import/batches/route");
  const res = await GET(jreq("/api/import/batches", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/import/batches: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("imp-403");
  const eng = await taoUser("engineer", "imp-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/import/batches/route");
  const res = await GET(jreq("/api/import/batches", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/import/batches: cách ly dự án — không thấy sổ import của dự án khác", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("imp-isoA");
  const projectB = await taoDuAn("imp-isoB");
  const pmA = await taoUser("pm", "imp-isoA");
  await insertId(
    `INSERT INTO import_batches (project_id, source_name, source_sha256, dim_denominator_mode)
     VALUES (?, 'file.xlsx', 'abc123', 'columns')`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/import/batches/route");
  const res = await GET(jreq("/api/import/batches", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).batches, []);
});

test("GET /api/import/batches: thấy đúng sổ import của dự án mình", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("imp-ok");
  const pm = await taoUser("pm", "imp-ok");
  const batchId = await insertId(
    `INSERT INTO import_batches (project_id, source_name, source_sha256, dim_denominator_mode, imported_by)
     VALUES (?, 'file-ok.xlsx', 'sha-ok', 'row-nonempty', ?)`,
    projectId,
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/import/batches/route");
  const res = await GET(jreq("/api/import/batches", undefined, "GET"));
  assert.equal(res.status, 200);
  const { batches } = await res.json();
  assert.ok(batches.some((b: { id: number }) => b.id === batchId));
});

// ============================================================================
// GET /api/approvals/inbox
// ============================================================================

test("GET /api/approvals/inbox: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/approvals/inbox/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/approvals/inbox: chưa có dự án nào → items rỗng", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("inbox-noproj");
  const pm = await taoUser("pm", "inbox-noproj");
  const other = await taoUser("pm", "inbox-noprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { GET } = await import("@/app/api/approvals/inbox/route");
    const res = await GET();
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).items, []);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("GET /api/approvals/inbox: có dự án nhưng không có gì chờ duyệt → items rỗng", S, async () => {
  const projectId = await taoDuAn("inbox-ok");
  const pm = await taoUser("pm", "inbox-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/approvals/inbox/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, []);
});
