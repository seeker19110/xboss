import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M56 PR1 — 2FA/TOTP. Unit: lib/totp.ts (mã hoá secret, sinh/verify mã, recovery codes)
// + lib/auth.ts (token tạm "chờ 2FA"). Integration (cần Postgres qua TEST_DATABASE_URL):
// login route thật khi user đã bật 2FA → need2fa+pending → /api/auth/login/2fa xác minh
// TOTP/recovery → set cookie phiên. Login/login-2fa route không gọi getCurrentUser()
// (không chạm next/headers) nên gọi handler trực tiếp được, giống pattern tests/api-keys.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { generate } from "otplib";

process.env.XBOSS_SECRET = "test-secret-for-totp-unit";

// ===== Unit: lib/totp.ts =====

test("encryptTotpSecret/decryptTotpSecret: round-trip đúng, ciphertext khác nhau mỗi lần (iv ngẫu nhiên)", async () => {
  const { encryptTotpSecret, decryptTotpSecret } = await import("@/lib/totp");
  const secret = "JBSWY3DPEHPK3PXP";
  const enc1 = encryptTotpSecret(secret);
  const enc2 = encryptTotpSecret(secret);
  assert.notEqual(enc1, enc2);
  assert.equal(decryptTotpSecret(enc1), secret);
  assert.equal(decryptTotpSecret(enc2), secret);
});

test("generateNewTotpSecret: sinh secret khác nhau mỗi lần", async () => {
  const { generateNewTotpSecret } = await import("@/lib/totp");
  const a = generateNewTotpSecret();
  const b = generateNewTotpSecret();
  assert.notEqual(a, b);
  assert.ok(a.length >= 16);
});

test("totpAuthUri: chứa issuer XBoss + secret + email", async () => {
  const { totpAuthUri } = await import("@/lib/totp");
  const uri = totpAuthUri("user@xboss.vn", "JBSWY3DPEHPK3PXP");
  assert.match(uri, /^otpauth:\/\/totp\//);
  const url = new URL(uri);
  assert.equal(url.searchParams.get("secret"), "JBSWY3DPEHPK3PXP");
  assert.equal(url.searchParams.get("issuer"), "XBoss");
});

test("generateRecoveryCodes: 8 mã đúng định dạng xxxxx-xxxxx, không trùng nhau", async () => {
  const { generateRecoveryCodes } = await import("@/lib/totp");
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  for (const c of codes) assert.match(c, /^[0-9a-f]{5}-[0-9a-f]{5}$/);
  assert.equal(new Set(codes).size, 8);
});

test("verifyTotpCode: mã đúng theo thời điểm hiện tại → valid true", async () => {
  const { generateNewTotpSecret, verifyTotpCode } = await import("@/lib/totp");
  const secret = generateNewTotpSecret();
  const token = await generate({ secret });
  const result = await verifyTotpCode(secret, token);
  assert.equal(result.valid, true);
});

test("verifyTotpCode: mã sai → valid false", async () => {
  const { generateNewTotpSecret, verifyTotpCode } = await import("@/lib/totp");
  const secret = generateNewTotpSecret();
  const result = await verifyTotpCode(secret, "000000");
  assert.equal(result.valid, false);
});

test("verifyTotpCode: chuỗi không phải 6 số → valid false (không gọi thư viện)", async () => {
  const { generateNewTotpSecret, verifyTotpCode } = await import("@/lib/totp");
  const secret = generateNewTotpSecret();
  const result = await verifyTotpCode(secret, "abcdef");
  assert.equal(result.valid, false);
});

// ===== Unit: lib/auth.ts — token tạm "chờ 2FA" =====

test("makeTotpPendingToken/parseTotpPendingToken: round-trip đúng userId + pwFrag", async () => {
  const { makeTotpPendingToken, parseTotpPendingToken, hashPassword } = await import("@/lib/auth");
  const hash = hashPassword("pw123");
  const token = makeTotpPendingToken(7, hash);
  const parsed = parseTotpPendingToken(token);
  assert.ok(parsed);
  assert.equal(parsed?.uid, 7);
  assert.equal(parsed?.pwFrag, hash.slice(0, 12));
});

test("parseTotpPendingToken: token phiên đăng nhập thường (không có purpose 2fa) bị từ chối", async () => {
  const { makeToken, parseTotpPendingToken, hashPassword } = await import("@/lib/auth");
  const hash = hashPassword("pw123");
  const sessionToken = makeToken(7, hash); // 4 phần, không phải token pending 2FA (5 phần)
  assert.equal(parseTotpPendingToken(sessionToken), null);
});

test("parseTotpPendingToken: token bị sửa (tamper) → null", async () => {
  const { makeTotpPendingToken, parseTotpPendingToken, hashPassword } = await import("@/lib/auth");
  const hash = hashPassword("pw123");
  const token = makeTotpPendingToken(7, hash);
  const tampered = token.replace(/^\d+/, "999");
  assert.equal(parseTotpPendingToken(tampered), null);
});

// ===== Integration: luồng login 2 bước thật qua route =====

const S = { skip: !HAS_TEST_DB };

function postJson(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test(
  "login 2 bước: user bật 2FA → bước 1 trả need2fa+pending, bước 2 mã TOTP đúng → set cookie",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { hashPassword } = await import("@/lib/auth");
    const { encryptTotpSecret, generateNewTotpSecret } = await import("@/lib/totp");

    const secret = generateNewTotpSecret();
    const suffix = Date.now().toString(36);
    const email = `totp-login-${suffix}@x.vn`;
    await insertId(
      `INSERT INTO users (name, email, role, password_hash, totp_secret, totp_enabled_at)
       VALUES ('TOTP Login Test', ?, 'engineer', ?, ?, now())`,
      email,
      hashPassword("matkhau123"),
      encryptTotpSecret(secret),
    );

    const { POST: loginPost } = await import("@/app/api/auth/login/route");
    const res1 = await loginPost(postJson("/api/auth/login", { email, password: "matkhau123" }));
    assert.equal(res1.status, 200);
    const j1 = await res1.json();
    assert.equal(j1.need2fa, true);
    assert.ok(j1.pending);

    const { POST: totpPost } = await import("@/app/api/auth/login/2fa/route");
    const token = await generate({ secret });
    const res2 = await totpPost(postJson("/api/auth/login/2fa", { pending: j1.pending, code: token }));
    assert.equal(res2.status, 200);
    assert.ok(res2.headers.get("set-cookie")?.includes("xboss_session="));

    // Chống replay: dùng lại đúng mã đó lần 2 trong cùng step phải bị chặn.
    const res3 = await totpPost(postJson("/api/auth/login/2fa", { pending: j1.pending, code: token }));
    assert.equal(res3.status, 401);

    await run(`DELETE FROM users WHERE email = ?`, email);
  },
);

test(
  "login 2 bước: recovery code hợp lệ → đăng nhập được, dùng lại lần 2 bị từ chối",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { hashPassword } = await import("@/lib/auth");
    const { encryptTotpSecret, generateNewTotpSecret, generateRecoveryCodes } = await import(
      "@/lib/totp"
    );

    const secret = generateNewTotpSecret();
    const suffix = Date.now().toString(36);
    const email = `totp-recovery-${suffix}@x.vn`;
    const uid = await insertId(
      `INSERT INTO users (name, email, role, password_hash, totp_secret, totp_enabled_at)
       VALUES ('TOTP Recovery Test', ?, 'engineer', ?, ?, now())`,
      email,
      hashPassword("matkhau123"),
      encryptTotpSecret(secret),
    );
    const codes = generateRecoveryCodes();
    await run(
      `INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
      uid,
      hashPassword(codes[0]),
    );

    const { POST: loginPost } = await import("@/app/api/auth/login/route");
    const res1 = await loginPost(postJson("/api/auth/login", { email, password: "matkhau123" }));
    const j1 = await res1.json();

    const { POST: totpPost } = await import("@/app/api/auth/login/2fa/route");
    const res2 = await totpPost(
      postJson("/api/auth/login/2fa", { pending: j1.pending, code: codes[0] }),
    );
    assert.equal(res2.status, 200);

    const res3 = await totpPost(
      postJson("/api/auth/login/2fa", { pending: j1.pending, code: codes[0] }),
    );
    assert.equal(res3.status, 401);

    await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, uid);
    await run(`DELETE FROM users WHERE id = ?`, uid);
  },
);

test("login: user chưa bật 2FA → hành vi cũ (không đổi), set cookie ngay", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/auth");

  const suffix = Date.now().toString(36);
  const email = `no-totp-${suffix}@x.vn`;
  await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('No TOTP', ?, 'engineer', ?)`,
    email,
    hashPassword("matkhau123"),
  );

  const { POST: loginPost } = await import("@/app/api/auth/login/route");
  const res = await loginPost(postJson("/api/auth/login", { email, password: "matkhau123" }));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.need2fa, undefined);
  assert.ok(res.headers.get("set-cookie")?.includes("xboss_session="));

  await run(`DELETE FROM users WHERE email = ?`, email);
});
