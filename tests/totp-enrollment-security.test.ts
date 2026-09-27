import { HAS_TEST_DB } from "./setup";
import { dangNhap } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import { query, queryOne, insertId, run } from "@/lib/db";
import { hashPassword } from "@/lib/bao-mat/auth";
import { COOKIE, parseToken } from "@/lib/bao-mat/session-token";
import { decryptTotpSecret, encryptTotpSecret, generateNewTotpSecret } from "@/lib/bao-mat/totp";
import { POST as setup } from "@/app/api/auth/totp/setup/route";
import { POST as confirm } from "@/app/api/auth/totp/confirm/route";
import { DELETE as disable } from "@/app/api/auth/totp/route";

const S = { skip: !HAS_TEST_DB };
let sequence = 0;
const prefix = Date.now().toString(36);
const password = "mat-khau-test-totp";

async function taoTaiKhoan(enabled: boolean) {
  const passwordHash = hashPassword(password);
  const secret = generateNewTotpSecret();
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id, totp_secret,
                        totp_enabled_at, totp_last_step)
     VALUES ('Test 2FA', ?, ?, 'engineer', 1, ?, ?, NULL)`,
    `totp-enrollment-${prefix}-${++sequence}@test.local`,
    passwordHash,
    encryptTotpSecret(secret),
    enabled ? new Date().toISOString() : null,
  );
  await run(
    `INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
    id,
    hashPassword("abcde-12345"),
  );
  dangNhap({ id, passwordHash });
  return { id, secret };
}

async function trangThai(id: number) {
  const user = await queryOne<{
    totp_secret: string;
    totp_enabled_at: string | null;
    totp_last_step: number | null;
  }>(`SELECT totp_secret, totp_enabled_at, totp_last_step FROM users WHERE id = ?`, id);
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
  const before = await trangThai(u.id);
  assert.ok(before.user.totp_enabled_at);
  assert.equal((await setup()).status, 409);
  assert.deepEqual(await trangThai(u.id), before);
});

test("setup và confirm đồng thời: chỉ trạng thái tuần tự hợp lệ được lưu", S, async () => {
  const u = await taoTaiKhoan(false);
  const code = await generate({ secret: u.secret, digits: 6, period: 30 });
  const [confirmation, replacement] = await Promise.all([confirm(yeuCau(code)), setup()]);
  const after = await trangThai(u.id);
  if (confirmation.status === 200) {
    assert.equal(replacement.status, 409);
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
});
