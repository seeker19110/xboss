import { HAS_TEST_DB } from "./setup";
import { requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import { insertId, queryOne, run } from "@/lib/db";
import { hashPassword, makeTotpPendingToken, COOKIE } from "@/lib/bao-mat/auth";
import { encryptTotpSecret, generateNewTotpSecret } from "@/lib/bao-mat/totp";
import { POST } from "@/app/api/auth/login/2fa/route";

const S = { skip: !HAS_TEST_DB };
const prefix = Date.now().toString(36);
let sequence = 0;
const ownedUsers: number[] = [];

after(async () => {
  if (!HAS_TEST_DB) return;
  for (const id of ownedUsers) {
    await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, id);
    await run(`DELETE FROM login_rate_limits WHERE key = ?`, `totp|login-2fa-test-${id}`);
    await run(`DELETE FROM users WHERE id = ?`, id);
  }
});

async function fixture(enabled = true) {
  const passwordHash = hashPassword("mat-khau-test-login-2fa");
  const secret = generateNewTotpSecret();
  const id = await insertId(
    `INSERT INTO users (name, email, role, password_hash, org_id, totp_secret, totp_enabled_at)
     VALUES ('Test login 2FA', ?, 'engineer', ?, 1, ?, ?)`,
    `login-2fa-security-${prefix}-${++sequence}@test.local`,
    passwordHash,
    encryptTotpSecret(secret),
    enabled ? new Date().toISOString() : null,
  );
  ownedUsers.push(id);
  const pending = makeTotpPendingToken(id, passwordHash);
  const recoveryId = await insertId(
    `INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
    id,
    hashPassword("abcde-12345"),
  );
  function request(code: string) {
    return new NextRequest("http://localhost/api/auth/login/2fa", {
      method: "POST",
      headers: { "x-forwarded-for": `login-2fa-test-${id}` },
      body: JSON.stringify({ pending, code }),
    });
  }
  return { id, secret, request, recoveryId };
}

test("login 2FA: mã TOTP chỉ cấp một cookie khi xác nhận đồng thời", S, async () => {
  const f = await fixture();
  const code = await generate({ secret: f.secret, digits: 6, period: 30 });
  const responses = await Promise.all([
    requestRieng(() => POST(f.request(code))),
    requestRieng(() => POST(f.request(code))),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  assert.equal(responses.filter((r) => r.cookies.get(COOKIE)).length, 1);
});

test("login 2FA: mã dự phòng chỉ cấp một cookie khi xác nhận đồng thời", S, async () => {
  const f = await fixture();
  const responses = await Promise.all([
    requestRieng(() => POST(f.request("abcde-12345"))),
    requestRieng(() => POST(f.request("abcde-12345"))),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  assert.equal(responses.filter((r) => r.cookies.get(COOKIE)).length, 1);
  const recovery = await queryOne<{ used_at: string | null }>(
    `SELECT used_at FROM totp_recovery_codes WHERE id = ?`,
    f.recoveryId,
  );
  assert.ok(recovery?.used_at);
});

test("login 2FA: cấu hình chờ xác nhận không phát cookie", S, async () => {
  const f = await fixture(false);
  const code = await generate({ secret: f.secret, digits: 6, period: 30 });
  const response = await POST(f.request(code));
  assert.equal(response.status, 401);
  assert.equal(response.cookies.get(COOKIE), undefined);
});
