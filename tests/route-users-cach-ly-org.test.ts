import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// V10 — vá lỗ hổng cross-tenant ở app/api/users/[id]/route.ts (phát sinh từ review V5).
// Trước khi sửa: PATCH/DELETE lấy user đích bằng `SELECT ... WHERE id = ?` KHÔNG kèm
// `AND org_id = ?` — khác GET /api/users cùng cụm (đã lọc org_id). Admin org A đoán ID
// tuần tự là đổi được vai trò/mật khẩu/2FA hoặc xoá thẳng user org B — chiếm quyền tài
// khoản xuyên tổ chức. Bám khuôn tests/route-quan-tri-2.test.ts.

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
    `UsersIso route ${uniq(ten)}`,
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
  const email = `usersiso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-usersiso-route', ?, ?)`,
    `UsersIso ${ten}`,
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

const jreq = (url: string, body?: unknown, method = "PATCH") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// PATCH /api/users/:id — xác thực / phân quyền cơ bản (giữ nguyên hành vi cũ)
// ============================================================================

test("PATCH /api/users/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/users/:id: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("patch-403");
  const pm = await taoUser("pm", "patch-403");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

// ============================================================================
// PATCH /api/users/:id — BUG THẬT (đã sửa): cô lập tenant
// ============================================================================

test(
  "PATCH /api/users/:id: BUG THẬT (đã sửa) — org khác không đổi role được",
  S,
  async () => {
    const projectId1 = await taoDuAn("patch-iso1", 1);
    const admin1 = await taoUser("admin", "patch-iso1", { orgId: 1 });
    const target1 = await taoUser("engineer", "patch-iso1Target", { orgId: 1 });
    await dangNhapDuAn(admin1, projectId1);

    const org2 = await taoToChuc("patchiso2");
    const projectId2 = await taoDuAn("patch-iso2", org2);
    const admin2 = await taoUser("admin", "patch-iso2", { orgId: org2 });
    await dangNhapDuAn(admin2, projectId2);

    const { PATCH } = await import("@/app/api/users/[id]/route");
    const res = await PATCH(jreq("/x", { role: "pm" }), {
      params: Promise.resolve({ id: String(target1.id) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = ?`, target1.id);
    assert.equal(row?.role, "engineer", "vai trò của user org khác không bị đổi nhầm");
  },
);

test(
  "PATCH /api/users/:id: BUG THẬT (đã sửa) — org khác không tắt 2FA hộ được",
  S,
  async () => {
    const projectId1 = await taoDuAn("patch-2fa-iso1", 1);
    const admin1 = await taoUser("admin", "patch-2fa-iso1", { orgId: 1 });
    const target1 = await taoUser("engineer", "patch-2fa-iso1Target", { orgId: 1 });
    const { run, queryOne } = await import("@/lib/db");
    await run(
      `UPDATE users SET totp_secret = 'ma-hoa-gia-lap', totp_enabled_at = now() WHERE id = ?`,
      target1.id,
    );
    await dangNhapDuAn(admin1, projectId1);

    const org2 = await taoToChuc("patch2faiso2");
    const projectId2 = await taoDuAn("patch-2fa-iso2", org2);
    const admin2 = await taoUser("admin", "patch-2fa-iso2", { orgId: org2 });
    await dangNhapDuAn(admin2, projectId2);

    const { PATCH } = await import("@/app/api/users/[id]/route");
    const res = await PATCH(jreq("/x", { disable2fa: true }), {
      params: Promise.resolve({ id: String(target1.id) }),
    });
    assert.equal(res.status, 404);

    const row = await queryOne<{ totp_secret: string | null }>(
      `SELECT totp_secret FROM users WHERE id = ?`,
      target1.id,
    );
    assert.equal(row?.totp_secret, "ma-hoa-gia-lap", "2FA của user org khác không bị tắt nhầm");
  },
);

test(
  "PATCH /api/users/:id: BUG THẬT (đã sửa) — org khác không đổi mật khẩu được",
  S,
  async () => {
    const projectId1 = await taoDuAn("patch-pw-iso1", 1);
    const admin1 = await taoUser("admin", "patch-pw-iso1", { orgId: 1 });
    const target1 = await taoUser("engineer", "patch-pw-iso1Target", { orgId: 1 });
    await dangNhapDuAn(admin1, projectId1);

    const org2 = await taoToChuc("patchpwiso2");
    const projectId2 = await taoDuAn("patch-pw-iso2", org2);
    const admin2 = await taoUser("admin", "patch-pw-iso2", { orgId: org2 });
    await dangNhapDuAn(admin2, projectId2);

    const { PATCH } = await import("@/app/api/users/[id]/route");
    const res = await PATCH(jreq("/x", { password: "mat-khau-moi-123" }), {
      params: Promise.resolve({ id: String(target1.id) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      target1.id,
    );
    assert.equal(row?.password_hash, target1.passwordHash, "mật khẩu của user org khác không đổi nhầm");
  },
);

test("PATCH /api/users/:id: cùng org → sửa thành công như cũ", S, async () => {
  const projectId = await taoDuAn("patch-ok");
  const admin = await taoUser("admin", "patch-ok");
  const target = await taoUser("engineer", "patch-okTarget");
  await dangNhapDuAn(admin, projectId);

  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Tên đã đổi" }), {
    params: Promise.resolve({ id: String(target.id) }),
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.name, "Tên đã đổi");

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id = ?`, target.id);
  assert.equal(row?.name, "Tên đã đổi");
});

// ============================================================================
// DELETE /api/users/:id
// ============================================================================

test("DELETE /api/users/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/users/:id: PM không có quyền (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("del-403");
  const pm = await taoUser("pm", "del-403");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 403);
});

test(
  "DELETE /api/users/:id: BUG THẬT (đã sửa) — org khác không xoá được",
  S,
  async () => {
    const projectId1 = await taoDuAn("del-iso1", 1);
    const admin1 = await taoUser("admin", "del-iso1", { orgId: 1 });
    const target1 = await taoUser("engineer", "del-iso1Target", { orgId: 1 });
    await dangNhapDuAn(admin1, projectId1);

    const org2 = await taoToChuc("deliso2");
    const projectId2 = await taoDuAn("del-iso2", org2);
    const admin2 = await taoUser("admin", "del-iso2", { orgId: org2 });
    await dangNhapDuAn(admin2, projectId2);

    const { DELETE } = await import("@/app/api/users/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(target1.id) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id = ?`, target1.id);
    assert.ok(row, "user của org khác không bị xoá nhầm");
  },
);

test("DELETE /api/users/:id: cùng org → xoá thành công như cũ", S, async () => {
  const projectId = await taoDuAn("del-ok");
  const admin = await taoUser("admin", "del-ok");
  const target = await taoUser("engineer", "del-okTarget");
  await dangNhapDuAn(admin, projectId);

  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(target.id) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id = ?`, target.id);
  assert.equal(row, undefined, "user cùng org phải bị xoá thật");
});
