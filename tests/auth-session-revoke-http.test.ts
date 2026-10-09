import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, datCookie, dangXuat } from "./helpers/phien";
import { goi, jreq, P } from "./helpers/chuoi-nghiep-vu";
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// A1-AC07 (GAP-6): token đã ký đúng vẫn phải hết hiệu lực qua ROUTE THẬT khi:
// (1) admin thu hồi phiên (users.session_version tăng) → getCurrentUser() null + route 401;
// (2) user đổi mật khẩu (pwFrag đổi) → token cũ 401, cookie mới cấp lại vẫn dùng được;
// (3) token cờ bắt buộc 2FA (flag2fa=1) → proxy.ts chặn mọi /api ngoài /api/auth/*.

const S = { skip: !HAS_TEST_DB };

async function taoUser(
  role: string,
  matKhau: string,
): Promise<{ id: number; passwordHash: string }> {
  const { insertId } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/bao-mat/auth");
  const passwordHash = hashPassword(matKhau);
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, 1)`,
    `A1-AC07 ${role}`,
    `a1ac07-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
    passwordHash,
    role,
  );
  return { id, passwordHash };
}

async function xoaUser(ids: number[]): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM login_rate_limits WHERE key = ANY(?::text[])`,
    ids.map((i) => `password:${i}`),
  ).catch(() => {});
  await run(`DELETE FROM users WHERE id = ANY(?::int[])`, ids);
}

test(
  "A1-AC07: admin thu hồi phiên (session_version +1) ⇒ token cũ: getCurrentUser null, route 401",
  S,
  async () => {
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { POST: revoke } = await import("@/app/api/users/[id]/revoke-sessions/route");
    const { GET: listContracts } = await import("@/app/api/contracts/route");
    const { getCurrentUser } = await import("@/lib/bao-mat/auth");
    const admin = await taoUser("admin", "admin-pass-1");
    const victim = await taoUser("pm", "victim-pass-1");
    try {
      dangNhap(victim);
      assert.equal((await goi(me())).status, 200, "token hợp lệ trước khi thu hồi");
      assert.equal((await getCurrentUser())?.id, victim.id);

      dangNhap(admin);
      assert.equal(
        (await goi(revoke(jreq(`/api/users/${victim.id}/revoke-sessions`, {}), P(victim.id))))
          .status,
        200,
      );

      dangNhap(victim); // cookie cũ (session_version 0) của nạn nhân
      assert.equal(await getCurrentUser(), null);
      assert.equal((await goi(me())).status, 401);
      assert.equal(
        (await goi(listContracts(new NextRequest("http://localhost/api/contracts")))).status,
        401,
        "route nghiệp vụ cũng phải 401",
      );
      // Token phát với session_version mới vẫn hợp lệ (thu hồi không khoá tài khoản).
      dangNhap({ ...victim, sessionVersion: 1 });
      assert.equal((await goi(me())).status, 200);
    } finally {
      dangXuat();
      await xoaUser([victim.id, admin.id]);
    }
  },
);

test(
  "A1-AC07: đổi mật khẩu qua PATCH /api/auth/password ⇒ token cũ 401, cookie mới dùng được",
  S,
  async () => {
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { PATCH } = await import("@/app/api/auth/password/route");
    const { COOKIE } = await import("@/lib/bao-mat/session-token");
    const u = await taoUser("engineer", "mat-khau-cu-1");
    try {
      dangNhap(u);
      const r = await PATCH(
        jreq(
          "/api/auth/password",
          { oldPassword: "mat-khau-cu-1", newPassword: "mat-khau-moi-2" },
          "PATCH",
        ),
      );
      assert.equal(r.status, 200);
      const cookieMoi = r.cookies.get(COOKIE)?.value;
      assert.ok(cookieMoi, "route phải cấp lại cookie phiên");

      dangNhap(u); // token cũ (pwFrag của hash cũ)
      assert.equal((await goi(me())).status, 401);

      datCookie(COOKIE, cookieMoi);
      assert.equal((await goi(me())).status, 200);
    } finally {
      dangXuat();
      await xoaUser([u.id]);
    }
  },
);

function proxyEnv(t: TestContext) {
  // Không gửi traffic ra mạng thật trong test.
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
}

test("A1-AC07: token flag2fa=1 ⇒ proxy chặn /api ngoài /api/auth/*, cho /api/auth/* qua", async (t) => {
  proxyEnv(t);
  const { proxy } = await import("@/proxy");
  const { COOKIE, makeToken } = await import("@/lib/bao-mat/session-token");
  const req = (path: string, flag: boolean) =>
    new NextRequest(`http://localhost${path}`, {
      headers: { cookie: `${COOKIE}=${makeToken(9_001, "hash-proxy-2fa", flag, 0, 1)}` },
    });
  for (const path of ["/api/tasks", "/api/contracts", "/api/payment-certs", "/api/authx"]) {
    const res = proxy(req(path, true));
    assert.equal(res.status, 403, path);
    assert.equal((await res.json()).code, "2fa_required", path);
  }
  for (const path of ["/api/auth/me", "/api/auth/totp", "/api/auth/logout"]) {
    assert.equal(proxy(req(path, true)).status, 200, `${path} phải qua để hoàn tất bật 2FA`);
  }
  // Đối chứng: cùng đường dẫn, cờ = 0 → không bị chặn.
  assert.equal(proxy(req("/api/tasks", false)).status, 200);
});
