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

test("PATCH /api/users/:id: BUG THẬT (đã sửa) — org khác không đổi role được", S, async () => {
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
});

test("PATCH /api/users/:id: BUG THẬT (đã sửa) — org khác không tắt 2FA hộ được", S, async () => {
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
});

test("PATCH /api/users/:id: BUG THẬT (đã sửa) — org khác không đổi mật khẩu được", S, async () => {
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
  assert.equal(
    row?.password_hash,
    target1.passwordHash,
    "mật khẩu của user org khác không đổi nhầm",
  );
});

// ============================================================================
// Guard "Admin cuối cùng" — phải đếm THEO ORG, không toàn hệ thống
// ============================================================================
//
// VÌ SAO CẦN org A/B RIÊNG (không dùng org_id=1 mặc định): rất nhiều test khác trong bộ
// cũng tạo admin ở org_id=1, nên "org A chỉ có đúng 1 admin" không đảm bảo được nếu dùng
// chung org mặc định. Tạo tổ chức mới bằng taoToChuc() cho cả A lẫn B để phép đếm admin
// chỉ tính đúng phạm vi test này.

test(
  "PATCH /api/users/:id: BUG THẬT (đã sửa) — hạ cấp admin duy nhất của org vẫn bị chặn dù org khác có admin",
  S,
  async () => {
    const orgA = await taoToChuc("lastadmin-patch-A");
    const projectA = await taoDuAn("lastadmin-patch-A", orgA);
    const adminA = await taoUser("admin", "lastadmin-patch-A", { orgId: orgA });

    // Org B có admin riêng — trước bản vá, COUNT(*) toàn hệ thống > 1 khiến guard cho qua.
    const orgB = await taoToChuc("lastadmin-patch-B");
    await taoUser("admin", "lastadmin-patch-B", { orgId: orgB });

    await dangNhapDuAn(adminA, projectA);
    const { PATCH } = await import("@/app/api/users/[id]/route");
    const res = await PATCH(jreq("/x", { role: "pm" }), {
      params: Promise.resolve({ id: String(adminA.id) }),
    });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.equal(error, "Không thể hạ cấp Admin cuối cùng");

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = ?`, adminA.id);
    assert.equal(row?.role, "admin", "vai trò admin duy nhất của org A không bị hạ nhầm");
  },
);

// GHI NHẬN (không tự sửa, đã xác nhận đúng nhận định có sẵn ở tests/route-quan-tri.test.ts
// dòng ~446-454): nhánh "Không thể xoá Admin cuối cùng" trong DELETE về mặt lý thuyết
// KHÔNG THỂ chạm tới qua API dù đếm theo org hay toàn hệ — muốn rơi vào đó cần
// target.role==='admin' VÀ org của target chỉ còn <=1 admin, nhưng người gọi DELETE bắt
// buộc cũng phải là admin CÙNG org (V10 đã lọc org_id ở SELECT target); nếu người gọi
// CHÍNH LÀ target thì bị chặn sớm hơn bởi check "không thể tự xoá tài khoản đang đăng
// nhập" (đứng trước trong route); nếu người gọi là admin KHÁC cùng org thì org đó đã có
// >=2 admin, không rơi vào <=1. Bản vá org_id cho COUNT trong DELETE vẫn đúng/cần thiết
// (phòng thủ theo chiều sâu, nhất quán với PATCH và với SELECT target đã lọc org_id) —
// chỉ là không có kịch bản API hợp lệ nào để chứng minh riêng nó chặn được kẻ tấn công,
// vì 2 lớp chặn khác (tự xoá mình + lọc org_id ở SELECT target) đã đóng đường tấn công
// trước khi chạm tới COUNT. Ca dưới đây kiểm đúng hành vi THẬT của DELETE khi org A chỉ
// còn 1 admin: tự xoá mình bị chặn bởi lớp "tự xoá" (400, khác thông điệp "Admin cuối
// cùng" nhưng cùng hệ quả — không ai xoá được admin duy nhất của org A).
test(
  "DELETE /api/users/:id: org chỉ có 1 admin — admin đó không tự xoá được mình (lớp chặn khác, cùng hệ quả)",
  S,
  async () => {
    const orgA = await taoToChuc("lastadmin-del-A");
    const projectA = await taoDuAn("lastadmin-del-A", orgA);
    const adminA = await taoUser("admin", "lastadmin-del-A", { orgId: orgA });

    const orgB = await taoToChuc("lastadmin-del-B");
    await taoUser("admin", "lastadmin-del-B", { orgId: orgB });

    await dangNhapDuAn(adminA, projectA);
    const { DELETE } = await import("@/app/api/users/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(adminA.id) }),
    });
    assert.equal(res.status, 400);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id = ?`, adminA.id);
    assert.ok(row, "admin duy nhất của org A không bị xoá nhầm");
  },
);

test(
  "DELETE /api/users/:id: org có 2 admin (kèm admin org khác gây nhiễu) → xoá 1 người vẫn chạy được",
  S,
  async () => {
    const orgA = await taoToChuc("twoadmin-del");
    const projectA = await taoDuAn("twoadmin-del", orgA);
    const admin1 = await taoUser("admin", "twoadmin-del1", { orgId: orgA });
    const admin2 = await taoUser("admin", "twoadmin-del2", { orgId: orgA });

    // Admin org khác gây nhiễu — trước bản vá, COUNT(*) toàn hệ thống bị cộng dồn qua org.
    const orgB = await taoToChuc("twoadmin-del-B");
    await taoUser("admin", "twoadmin-del-B", { orgId: orgB });

    await dangNhapDuAn(admin1, projectA);
    const { DELETE } = await import("@/app/api/users/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(admin2.id) }),
    });
    assert.equal(res.status, 200);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id = ?`, admin2.id);
    assert.equal(row, undefined, "vẫn xoá được vì org A còn admin khác (admin1)");
  },
);

test(
  "PATCH /api/users/:id: org có 2 admin → hạ cấp 1 người vẫn chạy được (không chặn nhầm)",
  S,
  async () => {
    const orgA = await taoToChuc("twoadmin-patch");
    const projectA = await taoDuAn("twoadmin-patch", orgA);
    const admin1 = await taoUser("admin", "twoadmin-patch1", { orgId: orgA });
    const admin2 = await taoUser("admin", "twoadmin-patch2", { orgId: orgA });

    await dangNhapDuAn(admin1, projectA);
    const { PATCH } = await import("@/app/api/users/[id]/route");
    const res = await PATCH(jreq("/x", { role: "pm" }), {
      params: Promise.resolve({ id: String(admin2.id) }),
    });
    assert.equal(res.status, 200);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = ?`, admin2.id);
    assert.equal(row?.role, "pm");
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

test("DELETE /api/users/:id: BUG THẬT (đã sửa) — org khác không xoá được", S, async () => {
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
});

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
