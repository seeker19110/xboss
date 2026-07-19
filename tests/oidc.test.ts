import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { resolveSsoUser } from "@/lib/oidc";

// ===== Unit thuần: resolveSsoUser (không chạm DB, không cần IdP) =====

test("resolveSsoUser: thiếu email → error", () => {
  assert.deepEqual(resolveSsoUser({}), { error: "IdP không trả email" });
  assert.deepEqual(resolveSsoUser({ email: "   " }), { error: "IdP không trả email" });
});

test("resolveSsoUser: email chuẩn hoá lowercase + trim, name mặc định từ email", () => {
  const r = resolveSsoUser({ email: "  Nguyen.Van@Company.VN  " });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.email, "nguyen.van@company.vn");
  assert.equal(r.name, "nguyen.van");
  assert.equal(r.roleFromClaim, null);
});

test("resolveSsoUser: email_verified=false → error, không tin email chưa xác minh", () => {
  assert.deepEqual(resolveSsoUser({ email: "a@b.vn", email_verified: false }), {
    error: "IdP chưa xác minh email này",
  });
});

test("resolveSsoUser: thiếu email_verified (IdP không gửi field) → vẫn coi là hợp lệ", () => {
  const r = resolveSsoUser({ email: "a@b.vn" });
  assert.ok(!("error" in r));
});

test("resolveSsoUser: email_verified=true → hợp lệ", () => {
  const r = resolveSsoUser({ email: "a@b.vn", email_verified: true });
  assert.ok(!("error" in r));
});

test("resolveSsoUser: giữ name từ claim khi có", () => {
  const r = resolveSsoUser({ email: "a@b.vn", name: "  Trần B  " });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.name, "Trần B");
});

test("resolveSsoUser: không đặt OIDC_ROLE_CLAIM → roleFromClaim null", () => {
  delete process.env.OIDC_ROLE_CLAIM;
  const r = resolveSsoUser({ email: "a@b.vn", role: "pm" });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.roleFromClaim, null);
});

test("resolveSsoUser: OIDC_ROLE_CLAIM string hợp lệ → map role", () => {
  process.env.OIDC_ROLE_CLAIM = "xboss_role";
  try {
    const r = resolveSsoUser({ email: "a@b.vn", xboss_role: "engineer" });
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.roleFromClaim, "engineer");
  } finally {
    delete process.env.OIDC_ROLE_CLAIM;
  }
});

test("resolveSsoUser: OIDC_ROLE_CLAIM giá trị lạ → null", () => {
  process.env.OIDC_ROLE_CLAIM = "xboss_role";
  try {
    const r = resolveSsoUser({ email: "a@b.vn", xboss_role: "super-duper" });
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.roleFromClaim, null);
  } finally {
    delete process.env.OIDC_ROLE_CLAIM;
  }
});

test("resolveSsoUser: OIDC_ROLE_CLAIM mảng → phần tử đầu khớp ROLES", () => {
  process.env.OIDC_ROLE_CLAIM = "groups";
  try {
    const r = resolveSsoUser({ email: "a@b.vn", groups: ["khong-phai-role", "pm", "admin"] });
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.roleFromClaim, "pm");
  } finally {
    delete process.env.OIDC_ROLE_CLAIM;
  }
});

// ===== Route khi SSO tắt (không cần DB) =====

test("SSO tắt: status.enabled=false, login/callback trả 404", async () => {
  for (const k of ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "APP_URL"])
    delete process.env[k];

  const status = await import("@/app/api/auth/oidc/status/route");
  const statusRes = await status.GET();
  assert.deepEqual(await statusRes.json(), { enabled: false });

  const login = await import("@/app/api/auth/oidc/login/route");
  const loginRes = await login.GET();
  assert.equal(loginRes.status, 404);

  const callback = await import("@/app/api/auth/oidc/callback/route");
  const cbRes = await callback.GET(
    new NextRequest("http://localhost/api/auth/oidc/callback?code=x&state=y"),
  );
  assert.equal(cbRes.status, 404);
});

test("callback: SSO bật nhưng thiếu cookie xboss_oidc → redirect error=oidc_expired", async () => {
  process.env.OIDC_ISSUER = "https://idp.example.com";
  process.env.OIDC_CLIENT_ID = "client";
  process.env.OIDC_CLIENT_SECRET = "secret";
  process.env.APP_URL = "https://app.example.com";
  try {
    const callback = await import("@/app/api/auth/oidc/callback/route");
    // Không gắn cookie xboss_oidc → nhánh oidc_expired (trả về TRƯỚC khi chạm DB/discovery).
    const res = await callback.GET(
      new NextRequest("http://localhost/api/auth/oidc/callback?code=x&state=y"),
    );
    assert.ok(res.status >= 300 && res.status < 400);
    assert.match(res.headers.get("location") ?? "", /error=oidc_expired/);
  } finally {
    for (const k of ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "APP_URL"])
      delete process.env[k];
  }
});

// ===== Integration: upsertSsoUser (cần Postgres — đặt TEST_DATABASE_URL) =====

test(
  "upsertSsoUser: tạo mới thoả NOT NULL + đăng nhập lại không tạo trùng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne, run } = await import("@/lib/db");
    const { upsertSsoUser } = await import("@/lib/oidc");
    const { makeToken } = await import("@/lib/auth");
    const email = `sso-new-${Date.now()}@example.com`;

    try {
      const u1 = await upsertSsoUser({ email, name: "SSO Mới", roleFromClaim: null });
      assert.equal(u1.email, email);
      assert.equal(u1.role, "viewer"); // default khi không có claim + không đặt OIDC_DEFAULT_ROLE
      assert.ok(u1.password_hash && u1.password_hash.length > 0); // NOT NULL thoả
      // Token phiên nhúng pwFrag từ hash — chứng minh makeToken hoạt động với hash ngẫu nhiên.
      // V5: token có 6 phần (thêm session_version); SSO luôn mustSetup2fa=false (MFA ở IdP).
      assert.ok(
        makeToken(u1.id, u1.password_hash, false, u1.session_version).split(".").length === 6,
      );

      // Gọi lần 2 cùng email → cùng id, không tạo trùng.
      const u2 = await upsertSsoUser({ email, name: "SSO Mới", roleFromClaim: null });
      assert.equal(u2.id, u1.id);
      const cnt = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM users WHERE email = ?`,
        email,
      );
      assert.equal(Number(cnt?.n), 1);
    } finally {
      await run(`DELETE FROM users WHERE email = ?`, email);
    }
  },
);

test(
  "upsertSsoUser: OIDC_DEFAULT_ROLE áp cho user mới khi không có claim",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run } = await import("@/lib/db");
    const { upsertSsoUser } = await import("@/lib/oidc");
    const email = `sso-def-${Date.now()}@example.com`;
    process.env.OIDC_DEFAULT_ROLE = "engineer";
    try {
      const u = await upsertSsoUser({ email, name: "SSO Def", roleFromClaim: null });
      assert.equal(u.role, "engineer");
    } finally {
      delete process.env.OIDC_DEFAULT_ROLE;
      await run(`DELETE FROM users WHERE email = ?`, email);
    }
  },
);

test(
  "upsertSsoUser: cập nhật role theo claim cho user không phải admin",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, queryOne } = await import("@/lib/db");
    const { upsertSsoUser } = await import("@/lib/oidc");
    const email = `sso-upd-${Date.now()}@example.com`;
    try {
      const u1 = await upsertSsoUser({ email, name: "SSO Upd", roleFromClaim: null });
      assert.equal(u1.role, "viewer");
      const u2 = await upsertSsoUser({ email, name: "SSO Upd", roleFromClaim: "engineer" });
      assert.equal(u2.id, u1.id);
      assert.equal(u2.role, "engineer");
      const db = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = ?`, u1.id);
      assert.equal(db?.role, "engineer");
    } finally {
      await run(`DELETE FROM users WHERE email = ?`, email);
    }
  },
);

test("upsertSsoUser: KHÔNG hạ cấp admin cuối cùng theo claim", { skip: !HAS_TEST_DB }, async () => {
  const { run, query } = await import("@/lib/db");
  const { upsertSsoUser } = await import("@/lib/oidc");
  const email = `sso-admin-${Date.now()}@example.com`;
  // Snapshot các admin hiện có để khôi phục sau (test chạy tuần tự theo file).
  const others = await query<{ id: number }>(`SELECT id FROM users WHERE role = 'admin'`);
  try {
    await run(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'admin', 'x')`,
      "SSO Admin",
      email,
    );
    // Biến user SSO thành admin DUY NHẤT còn lại.
    await run(`UPDATE users SET role = 'pm' WHERE role = 'admin' AND email != ?`, email);

    const u = await upsertSsoUser({ email, name: "SSO Admin", roleFromClaim: "engineer" });
    assert.equal(u.role, "admin"); // giữ nguyên — không tự khoá hệ thống
  } finally {
    // Khôi phục: xoá user test + trả các admin cũ về admin.
    await run(`DELETE FROM users WHERE email = ?`, email);
    for (const o of others) await run(`UPDATE users SET role = 'admin' WHERE id = ?`, o.id);
  }
});

// GHI CHÚ: flow HTTP thật với 1 IdP (discovery → redirect → callback đổi token) không tự
// động hoá được trong CI — verify thủ công với 1 IdP thật (Google Workspace / Entra) trước
// khi merge, ghi kết quả vào PR description (xem docs/nang-cap/M49-api-mo-sso.md §PR3 Test).
