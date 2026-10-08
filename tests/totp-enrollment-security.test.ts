import { HAS_TEST_DB } from "./setup";
import { dangNhap, datCookie, requestRieng } from "./helpers/phien";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import { query, queryOne, insertId, run } from "@/lib/db";
import { hashPassword, getCurrentUser } from "@/lib/bao-mat/auth";
import { COOKIE, parseToken } from "@/lib/bao-mat/session-token";
import { decryptTotpSecret, encryptTotpSecret, generateNewTotpSecret } from "@/lib/bao-mat/totp";
import { POST as setup } from "@/app/api/auth/totp/setup/route";
import { POST as confirm } from "@/app/api/auth/totp/confirm/route";
import { DELETE as disable } from "@/app/api/auth/totp/route";

const S = { skip: !HAS_TEST_DB };
let sequence = 0;
const prefix = Date.now().toString(36);
const password = "mat-khau-test-totp";
const ownedUsers: number[] = [];

after(async () => {
  if (!HAS_TEST_DB) return;
  for (const id of ownedUsers) {
    await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, id);
    await run(
      `DELETE FROM login_rate_limits WHERE key IN (?, ?)`,
      `totp-confirm:${id}`,
      `totp-disable:${id}`,
    );
    await run(`DELETE FROM users WHERE id = ?`, id);
  }
});

async function taoTaiKhoan(enabled: boolean) {
  const passwordHash = hashPassword(password);
  const secret = generateNewTotpSecret();
  const email = `totp-enrollment-${prefix}-${++sequence}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id, totp_secret,
                        totp_enabled_at, totp_last_step)
     VALUES ('Test 2FA', ?, ?, 'engineer', 1, ?, ?, NULL)`,
    email,
    passwordHash,
    encryptTotpSecret(secret),
    enabled ? new Date().toISOString() : null,
  );
  ownedUsers.push(id);
  await run(
    `INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
    id,
    hashPassword("abcde-12345"),
  );
  dangNhap({ id, passwordHash });
  return { id, secret, passwordHash, email };
}

async function trangThai(id: number) {
  const user = await queryOne<{
    totp_secret: string;
    totp_enabled_at: string | null;
    totp_last_step: number | null;
    session_version: number;
  }>(
    `SELECT totp_secret, totp_enabled_at, totp_last_step, session_version FROM users WHERE id = ?`,
    id,
  );
  const recovery = await query(
    `SELECT id, code_hash, used_at FROM totp_recovery_codes WHERE user_id = ? ORDER BY id`,
    id,
  );
  return { user: user!, recovery };
}

function yeuCau(code: string, method = "POST") {
  return new NextRequest("http://localhost/api/auth/totp/confirm", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, password }),
  });
}

test("setup: giữ nguyên toàn bộ cấu hình và mã dự phòng khi 2FA đã bật", S, async () => {
  const u = await taoTaiKhoan(true);
  const before = await trangThai(u.id);
  const response = await setup();
  assert.equal(response.status, 409);
  assert.deepEqual(await trangThai(u.id), before);
  assert.equal("otpauthUri" in (await response.json()), false);
});

test("setup: cho phép tạo lại cấu hình còn chờ xác nhận", S, async () => {
  const u = await taoTaiKhoan(false);
  const before = await trangThai(u.id);
  const response = await setup();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recoveryCodes.length, 8);
  const after = await trangThai(u.id);
  assert.equal(after.user.totp_enabled_at, null);
  assert.notEqual(after.user.totp_secret, before.user.totp_secret);
  assert.equal(after.recovery.length, 8);
  assert.equal(
    decryptTotpSecret(after.user.totp_secret),
    new URL(body.otpauthUri).searchParams.get("secret"),
  );
});

test("confirm: hoàn tất cấu hình chờ, phát cookie rồi bảo vệ cấu hình đã bật", S, async () => {
  const u = await taoTaiKhoan(false);
  const code = await generate({ secret: u.secret, digits: 6, period: 30 });
  const response = await confirm(yeuCau(code));
  assert.equal(response.status, 200);
  const cookie = response.cookies.get(COOKIE);
  assert.ok(cookie);
  assert.equal(parseToken(cookie.value)?.mustSetup2fa, false);
  assert.equal(parseToken(cookie.value)?.sessionVersion, 1);
  assert.equal(await getCurrentUser(), null, "cookie trước lúc bật 2FA đã bị thu hồi");
  datCookie(COOKIE, cookie.value);
  assert.equal((await getCurrentUser())?.id, u.id);
  const before = await trangThai(u.id);
  assert.ok(before.user.totp_enabled_at);
  assert.equal((await setup()).status, 409);
  assert.deepEqual(await trangThai(u.id), before);
});

test("setup và confirm đồng thời: chỉ trạng thái tuần tự hợp lệ được lưu", S, async () => {
  const u = await taoTaiKhoan(false);
  const code = await generate({ secret: u.secret, digits: 6, period: 30 });
  const [confirmation, replacement] = await Promise.all([
    requestRieng(() => confirm(yeuCau(code))),
    requestRieng(() => setup()),
  ]);
  const after = await trangThai(u.id);
  if (confirmation.status === 200) {
    assert.ok([401, 409].includes(replacement.status));
    assert.ok(after.user.totp_enabled_at);
    assert.equal(decryptTotpSecret(after.user.totp_secret), u.secret);
    assert.equal(after.recovery.length, 1);
  } else {
    assert.equal(confirmation.status, 401);
    assert.equal(replacement.status, 200);
    assert.equal(after.user.totp_enabled_at, null);
    assert.notEqual(decryptTotpSecret(after.user.totp_secret), u.secret);
    assert.equal(after.recovery.length, 8);
  }
});

test("disable: mã hợp lệ xoá cấu hình và mã dự phòng trong cùng thao tác", S, async () => {
  const u = await taoTaiKhoan(true);
  const code = await generate({ secret: u.secret, digits: 6, period: 30 });
  const response = await disable(yeuCau(code, "DELETE"));
  assert.equal(response.status, 200);
  const after = await trangThai(u.id);
  assert.equal(after.user.totp_secret, null);
  assert.equal(after.user.totp_enabled_at, null);
  assert.equal(after.recovery.length, 0);
  assert.equal(after.user.session_version, 1);
  assert.equal(response.cookies.get(COOKIE)?.value, "");
  assert.equal(await getCurrentUser(), null, "cookie trước lúc tắt 2FA đã bị thu hồi");
});

test("confirm đã bật giữ nguyên cấu hình và không cấp lại cookie", S, async () => {
  const u = await taoTaiKhoan(true);
  const before = await trangThai(u.id);
  const code = await generate({ secret: u.secret, digits: 6, period: 30 });
  const response = await confirm(yeuCau(code));
  assert.equal(response.status, 409);
  assert.equal(response.cookies.get(COOKIE), undefined);
  assert.deepEqual(await trangThai(u.id), before);
});

test("confirm giới hạn số lần thử theo tài khoản", S, async () => {
  const u = await taoTaiKhoan(false);
  const before = await trangThai(u.id);
  for (let attempt = 1; attempt <= 11; attempt++) {
    const response = await confirm(yeuCau("ma-khong-hop-le"));
    assert.equal(response.status, attempt <= 10 ? 401 : 429);
  }
  assert.deepEqual(await trangThai(u.id), before);
  await taoTaiKhoan(false);
  assert.equal((await confirm(yeuCau("ma-khong-hop-le"))).status, 401);
});

test("disable giới hạn số lần thử và giữ nguyên cấu hình khi mã sai", S, async () => {
  const u = await taoTaiKhoan(true);
  const before = await trangThai(u.id);
  for (let attempt = 1; attempt <= 11; attempt++) {
    const response = await disable(yeuCau("ma-khong-hop-le", "DELETE"));
    assert.equal(response.status, attempt <= 10 ? 401 : 429);
  }
  assert.deepEqual(await trangThai(u.id), before);
});

test("admin đặt lại 2FA thu hồi phiên cũ và xoá mã dự phòng", S, async () => {
  const u = await taoTaiKhoan(true);
  const adminHash = hashPassword(password);
  const adminId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Admin reset MFA', ?, ?, 'admin', 1)`,
    `totp-reset-admin-${prefix}-${++sequence}@test.local`,
    adminHash,
  );
  ownedUsers.push(adminId);
  dangNhap({ id: adminId, passwordHash: adminHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const response = await PATCH(
    new NextRequest(`http://localhost/api/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ disable2fa: true }),
    }),
    { params: Promise.resolve({ id: String(u.id) }) },
  );
  assert.equal(response.status, 200);
  const after = await trangThai(u.id);
  assert.equal(after.user.session_version, 1);
  assert.equal(after.user.totp_secret, null);
  assert.equal(after.recovery.length, 0);
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  assert.equal(await getCurrentUser(), null);
});

test("sau khi tắt 2FA, đăng nhập lại vẫn áp dụng yêu cầu theo vai trò", S, async () => {
  const { bumpCodeListVersion } = await import("@/lib/ha-tang/code-lists");
  const existing = await queryOne<{ id: number; active: boolean }>(
    `SELECT id, active FROM code_lists WHERE domain = 'require_2fa_roles' AND code = 'engineer'`,
  );
  const itemId =
    existing?.id ??
    (await insertId(
      `INSERT INTO code_lists (domain, code, label, org_id) VALUES ('require_2fa_roles', 'engineer', 'Kỹ sư', 1)`,
    ));
  await run(`UPDATE code_lists SET active = TRUE WHERE id = ?`, itemId);
  bumpCodeListVersion();
  try {
    const u = await taoTaiKhoan(true);
    const code = await generate({ secret: u.secret, digits: 6, period: 30 });
    assert.equal((await disable(yeuCau(code, "DELETE"))).status, 200);
    const { POST: login } = await import("@/app/api/auth/login/route");
    const response = await login(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: u.email, password }),
        headers: { "x-forwarded-for": `totp-policy-test-${u.id}` },
      }),
    );
    assert.equal(response.status, 200);
    const token = parseToken(response.cookies.get(COOKIE)!.value);
    assert.equal(token?.sessionVersion, 1);
    assert.equal(token?.mustSetup2fa, true);
  } finally {
    if (existing)
      await run(`UPDATE code_lists SET active = ? WHERE id = ?`, existing.active, itemId);
    else await run(`DELETE FROM code_lists WHERE id = ?`, itemId);
    bumpCodeListVersion();
  }
});
