import "./setup";
import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import { encryptTotpSecret, generateNewTotpSecret } from "@/lib/bao-mat/totp";
import { makeToken, parseToken, COOKIE, COOKIE_MAX_AGE } from "@/lib/bao-mat/session-token";

// Test route thật, thay đúng biên DB/danh tính; không cần secret hoặc DB bên ngoài.
const user = { id: 17, name: "Test", email: "unit@test.local", role: "admin", orgId: 1 };
let state: {
  totp_secret: string | null;
  totp_enabled_at: string | null;
  totp_last_step: number | null;
  password_hash: string;
  session_version: number;
  org_id: number;
};
let recovery: string[];
let plainSecret: string;
let writes = 0;
let blocked = false;

mock.module("@/lib/bao-mat/ratelimit", {
  namedExports: { hitRateLimit: async () => blocked },
});

mock.module("@/lib/bao-mat/auth", {
  namedExports: {
    getCurrentUser: async () => user,
    hashPassword: (value: string) => `hash:${value}`,
    verifyPassword: (value: string, stored: string) => stored === `hash:${value}`,
    makeToken,
    COOKIE,
    COOKIE_MAX_AGE,
    isSecureCookie: () => false,
    CAN: { manageUsers: () => true },
    ROLES: ["admin", "engineer"],
  },
});
mock.module("@/lib/db", {
  namedExports: {
    queryOne: async () => ({ id: user.id, role: user.role, ...state }),
    query: async () => recovery.map((code_hash) => ({ code_hash })),
    withTransaction: async (fn: () => Promise<unknown>) => fn(),
    run: async (sql: string, ...values: unknown[]) => {
      writes++;
      if (sql.includes("SET totp_secret = ?")) {
        state.totp_secret = String(values[0]);
        state.totp_enabled_at = null;
        state.totp_last_step = null;
      } else if (sql.includes("SET totp_enabled_at = now()")) {
        state.totp_enabled_at = new Date().toISOString();
        state.totp_last_step = Number(values[0]);
      } else if (sql.includes("SET totp_secret = NULL")) {
        state.totp_secret = null;
        state.totp_enabled_at = null;
        state.totp_last_step = null;
      } else if (sql.startsWith("DELETE FROM totp_recovery_codes")) {
        recovery = [];
      } else if (sql.includes("INSERT INTO totp_recovery_codes")) {
        recovery.push(String(values[1]));
      } else {
        throw new Error("Câu ghi ngoài phạm vi test 2FA");
      }
      if (sql.includes("session_version = session_version + 1")) state.session_version++;
    },
  },
});

beforeEach(() => {
  plainSecret = generateNewTotpSecret();
  state = {
    totp_secret: encryptTotpSecret(plainSecret),
    totp_enabled_at: "2026-01-01T00:00:00Z",
    totp_last_step: 123,
    password_hash: "hash:mat-khau-test",
    session_version: 0,
    org_id: 1,
  };
  recovery = ["hash:ma-du-phong-cu"];
  writes = 0;
  blocked = false;
});

test("setup từ chối 2FA đang bật và không thay đổi dữ liệu xác thực", async () => {
  const { POST: setup } = await import("@/app/api/auth/totp/setup/route");
  const before = structuredClone({ state, recovery });
  const response = await setup();
  assert.equal(response.status, 409);
  assert.equal(writes, 0);
  assert.deepEqual({ state, recovery }, before);
  assert.equal("recoveryCodes" in (await response.json()), false);
});

test("setup chờ xác nhận vẫn trả QR và bộ mã dự phòng mới", async () => {
  const { POST: setup } = await import("@/app/api/auth/totp/setup/route");
  state.totp_enabled_at = null;
  const response = await setup();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.otpauthUri, /^otpauth:\/\//);
  assert.equal(body.recoveryCodes.length, 8);
  assert.equal(recovery.length, 8);
  assert.equal(state.totp_enabled_at, null);
});

test("confirm cấu hình chờ hoàn tất rồi setup từ chối thay thế", async () => {
  const { POST: setup } = await import("@/app/api/auth/totp/setup/route");
  const { POST: confirm } = await import("@/app/api/auth/totp/confirm/route");
  state.totp_enabled_at = null;
  const code = await generate({ secret: plainSecret, digits: 6, period: 30 });
  const response = await confirm(
    new NextRequest("http://localhost/api/auth/totp/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  );
  assert.equal(response.status, 200);
  assert.ok(response.cookies.get(COOKIE));
  assert.equal(state.session_version, 1);
  assert.equal(parseToken(response.cookies.get(COOKIE)!.value)?.sessionVersion, 1);
  const before = structuredClone({ state, recovery });
  assert.equal((await setup()).status, 409);
  assert.deepEqual({ state, recovery }, before);
});

test("confirm đã bật trả 409 và giữ nguyên bước TOTP đã dùng", async () => {
  const { POST: confirm } = await import("@/app/api/auth/totp/confirm/route");
  const before = structuredClone({ state, recovery });
  const code = await generate({ secret: plainSecret, digits: 6, period: 30 });
  const response = await confirm(
    new NextRequest("http://localhost/api/auth/totp/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  );
  assert.equal(response.status, 409);
  assert.equal(writes, 0);
  assert.deepEqual({ state, recovery }, before);
});

test("confirm và disable vượt giới hạn trả 429 trước khi ghi trạng thái", async () => {
  const { POST: confirm } = await import("@/app/api/auth/totp/confirm/route");
  const { DELETE: disable } = await import("@/app/api/auth/totp/route");
  blocked = true;
  const confirmation = await confirm(
    new NextRequest("http://localhost/api/auth/totp/confirm", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    }),
  );
  const disabling = await disable(
    new NextRequest("http://localhost/api/auth/totp", {
      method: "DELETE",
      body: JSON.stringify({ code: "123456", password: "mat-khau-test" }),
    }),
  );
  assert.equal(confirmation.status, 429);
  assert.equal(disabling.status, 429);
  assert.equal(confirmation.headers.get("Retry-After"), "900");
  assert.equal(disabling.headers.get("Retry-After"), "900");
  assert.equal(writes, 0);
});

test("disable thành công tăng phiên và xoá cookie đang dùng", async () => {
  const { DELETE: disable } = await import("@/app/api/auth/totp/route");
  const code = await generate({ secret: plainSecret, digits: 6, period: 30 });
  const response = await disable(
    new NextRequest("http://localhost/api/auth/totp", {
      method: "DELETE",
      body: JSON.stringify({ code, password: "mat-khau-test" }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(state.session_version, 1);
  assert.equal(response.cookies.get(COOKIE)?.value, "");
  assert.equal(response.cookies.get(COOKIE)?.maxAge, 0);
});

test("admin đặt lại 2FA tăng phiên và xoá toàn bộ mã dự phòng", async () => {
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const response = await PATCH(
    new NextRequest("http://localhost/api/users/17", {
      method: "PATCH",
      body: JSON.stringify({ disable2fa: true }),
    }),
    { params: Promise.resolve({ id: "17" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(state.session_version, 1);
  assert.equal(state.totp_secret, null);
  assert.equal(state.totp_enabled_at, null);
  assert.deepEqual(recovery, []);
});
