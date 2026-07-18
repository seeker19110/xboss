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
  // M56 PR2: token phiên nay có 5 phần (userId.exp.pwFrag.flag.mac) — cùng số phần với
  // token pending 2FA, nhưng phần thứ 4 là cờ "0"/"1", KHÁC "2fa" → vẫn bị từ chối.
  const sessionToken = makeToken(7, hash, false);
  assert.equal(parseTotpPendingToken(sessionToken), null);
});

test("parseTotpPendingToken: token bị sửa (tamper) → null", async () => {
  const { makeTotpPendingToken, parseTotpPendingToken, hashPassword } = await import("@/lib/auth");
  const hash = hashPassword("pw123");
  const token = makeTotpPendingToken(7, hash);
  const tampered = token.replace(/^\d+/, "999");
  assert.equal(parseTotpPendingToken(tampered), null);
});

// ===== Unit: M56 PR2 — Bắt buộc 2FA theo vai trò =====

test("computeMustSetup2fa: role bắt buộc + chưa bật 2FA → true; các biên còn lại → false", async () => {
  const { computeMustSetup2fa } = await import("@/lib/auth");
  const required = new Set(["engineer"]) as Set<import("@/lib/roles").Role>;
  // role trong danh sách + chưa bật → true
  assert.equal(computeMustSetup2fa("engineer", null, required), true);
  assert.equal(computeMustSetup2fa("engineer", undefined, required), true);
  // role trong danh sách + ĐÃ bật (totp_enabled_at có giá trị) → false
  assert.equal(computeMustSetup2fa("engineer", "2026-01-01T00:00:00Z", required), false);
  // role KHÔNG trong danh sách → luôn false (kể cả chưa bật)
  assert.equal(computeMustSetup2fa("admin", null, required), false);
  // danh sách rỗng (domain require_2fa_roles chưa có dòng nào) → luôn false = hành vi trước PR2
  assert.equal(computeMustSetup2fa("engineer", null, new Set()), false);
});

test("parseToken: round-trip cờ mustSetup2fa (0/1); từ chối token pending 2FA (flag lạ)", async () => {
  const { makeToken, parseToken, hashPassword, makeTotpPendingToken } = await import("@/lib/auth");
  const hash = hashPassword("pw");
  assert.equal(parseToken(makeToken(9, hash, true))?.mustSetup2fa, true);
  const t0 = parseToken(makeToken(9, hash, false));
  assert.equal(t0?.mustSetup2fa, false);
  assert.equal(t0?.uid, 9);
  // Token tạm "chờ 2FA" (phần thứ 4 = "2fa", cũng 5 phần) KHÔNG được nhận là cookie phiên.
  assert.equal(parseToken(makeTotpPendingToken(9, hash)), null);
});

test("proxy: cờ mustSetup2fa=1 chặn API ngoài whitelist (403 2fa_required); /api/auth/* đi qua", async () => {
  const { makeToken, hashPassword } = await import("@/lib/auth");
  const { proxy } = await import("@/proxy");
  const hash = hashPassword("pw");
  const locked = makeToken(1, hash, true);
  const free = makeToken(1, hash, false);
  const reqWith = (path: string, token?: string): NextRequest =>
    new NextRequest(
      `http://localhost${path}`,
      token ? { headers: { cookie: `xboss_session=${token}` } } : {},
    );

  // Bị khoá → API ngoài whitelist trả 403 + code 2fa_required
  const blocked = proxy(reqWith("/api/tasks", locked));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, "2fa_required");

  // Whitelist /api/auth/* KHÔNG bị chặn (login/2fa/logout/me/totp cần để bật 2FA hoặc đăng xuất)
  for (const p of [
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/login",
    "/api/auth/login/2fa",
    "/api/auth/totp",
    "/api/auth/totp/setup",
    "/api/auth/totp/confirm",
  ]) {
    assert.notEqual(proxy(reqWith(p, locked)).status, 403, `${p} không được bị chặn`);
  }

  // flag=0 (đã bật 2FA / không bắt buộc) → không chặn. Đây cũng là trạng thái cookie sau khi
  // /api/auth/totp/confirm phát lại token → gọi lại API ngoài whitelist thành công ngay.
  assert.notEqual(proxy(reqWith("/api/tasks", free)).status, 403);
  // Không có cookie (chưa đăng nhập) → không chặn ở proxy; route tự trả 401.
  assert.notEqual(proxy(reqWith("/api/tasks")).status, 403);
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
    const res2 = await totpPost(
      postJson("/api/auth/login/2fa", { pending: j1.pending, code: token }),
    );
    assert.equal(res2.status, 200);
    assert.ok(res2.headers.get("set-cookie")?.includes("xboss_session="));

    // Chống replay: dùng lại đúng mã đó lần 2 trong cùng step phải bị chặn.
    const res3 = await totpPost(
      postJson("/api/auth/login/2fa", { pending: j1.pending, code: token }),
    );
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
    const { encryptTotpSecret, generateNewTotpSecret, generateRecoveryCodes } =
      await import("@/lib/totp");

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

// M56 PR2 integration: bật bắt buộc 2FA cho vai trò engineer qua code_lists → user engineer
// chưa bật 2FA đăng nhập → cookie có cờ mustSetup2fa=1 → proxy chặn /api/tasks (403) nhưng
// cho /api/auth/* đi qua. User admin (không trong danh sách) → cờ=0, không bị chặn.
test(
  "M56 PR2: role bắt buộc + chưa bật 2FA → cookie mustSetup2fa=1 + proxy chặn; role không bắt buộc → không ảnh hưởng",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { hashPassword, parseToken } = await import("@/lib/auth");
    const { createItem, deleteItem } = await import("@/lib/code-lists");
    const { proxy } = await import("@/proxy");
    const { POST: loginPost } = await import("@/app/api/auth/login/route");

    const created = await createItem({
      domain: "require_2fa_roles",
      code: "engineer",
      label: "Kỹ sư",
    });
    const codeItemId = typeof created === "string" ? null : created.id;
    assert.ok(codeItemId, "tạo được dòng require_2fa_roles=engineer");

    const suffix = Date.now().toString(36);
    const engEmail = `req2fa-eng-${suffix}@x.vn`;
    const admEmail = `req2fa-adm-${suffix}@x.vn`;
    const engId = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Eng Req2FA', ?, 'engineer', ?)`,
      engEmail,
      hashPassword("matkhau123"),
    );
    const admId = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Adm Req2FA', ?, 'admin', ?)`,
      admEmail,
      hashPassword("matkhau123"),
    );

    try {
      const cookieOf = async (email: string): Promise<string> => {
        const res = await loginPost(postJson("/api/auth/login", { email, password: "matkhau123" }));
        assert.equal(res.status, 200);
        const setCookie = res.headers.get("set-cookie") ?? "";
        const m = setCookie.match(/xboss_session=([^;]+)/);
        assert.ok(m, "có set-cookie phiên");
        return m![1];
      };

      // Engineer (bắt buộc, chưa bật) → cờ = 1
      const engTok = await cookieOf(engEmail);
      assert.equal(parseToken(engTok)?.mustSetup2fa, true, "engineer bị buộc bật 2FA");

      const cookieHdr = `xboss_session=${engTok}`;
      const blocked = proxy(
        new NextRequest("http://localhost/api/tasks", { headers: { cookie: cookieHdr } }),
      );
      assert.equal(blocked.status, 403);
      assert.equal((await blocked.json()).code, "2fa_required");
      assert.notEqual(
        proxy(new NextRequest("http://localhost/api/auth/me", { headers: { cookie: cookieHdr } }))
          .status,
        403,
        "/api/auth/me phải đi qua",
      );

      // Admin (không trong danh sách bắt buộc) → cờ = 0, không bị chặn
      const admTok = await cookieOf(admEmail);
      assert.equal(parseToken(admTok)?.mustSetup2fa, false, "admin không bị buộc");
      assert.notEqual(
        proxy(
          new NextRequest("http://localhost/api/tasks", {
            headers: { cookie: `xboss_session=${admTok}` },
          }),
        ).status,
        403,
      );
    } finally {
      await run(`DELETE FROM users WHERE id IN (?, ?)`, engId, admId);
      if (codeItemId) await deleteItem(codeItemId);
    }
  },
);
