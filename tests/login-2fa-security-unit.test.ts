import "./setup";
import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import { encryptTotpSecret, generateNewTotpSecret } from "@/lib/bao-mat/totp";
import { makeToken, COOKIE, COOKIE_MAX_AGE } from "@/lib/bao-mat/session-token";

// Biên DB mô phỏng khoá row theo transaction; handler thật vẫn kiểm/tiêu thụ mã.
const tx = new AsyncLocalStorage<{ release?: () => void }>();
let waiting = Promise.resolve();
let plainSecret: string;
let usedRecovery = false;
let user: {
  id: number;
  name: string;
  email: string;
  role: string;
  password_hash: string;
  totp_secret: string;
  totp_enabled_at: string | null;
  totp_last_step: number | null;
  session_version: number;
  org_id: number;
};

mock.module("@/lib/bao-mat/auth", {
  namedExports: {
    parseTotpPendingToken: () => ({ uid: 17, pwFrag: "hash:" }),
    verifyPassword: (value: string, stored: string) => stored === `hash:${value}`,
    makeToken,
    COOKIE,
    COOKIE_MAX_AGE,
    isSecureCookie: () => false,
  },
});
mock.module("@/lib/bao-mat/ratelimit", {
  namedExports: { hitRateLimit: async () => false },
});
mock.module("@/lib/db", {
  namedExports: {
    withTransaction: async (fn: () => Promise<unknown>) => {
      const current: { release?: () => void } = {};
      try {
        return await tx.run(current, fn);
      } finally {
        current.release?.();
      }
    },
    queryOne: async (sql: string) => {
      if (sql.includes("FOR UPDATE")) {
        const current = tx.getStore();
        assert.ok(current, "khoá phải được giữ trong transaction");
        const previous = waiting;
        waiting = new Promise<void>((resolve) => {
          current.release = resolve;
        });
        await previous;
      }
      return { ...user };
    },
    query: async () => (usedRecovery ? [] : [{ id: 1, code_hash: "hash:abcde-12345" }]),
    run: async (sql: string, ...values: unknown[]) => {
      if (sql.includes("UPDATE users SET totp_last_step")) user.totp_last_step = Number(values[0]);
      else if (sql.includes("UPDATE totp_recovery_codes")) usedRecovery = true;
      else throw new Error("Câu ghi ngoài phạm vi test đăng nhập 2FA");
    },
  },
});

beforeEach(() => {
  waiting = Promise.resolve();
  usedRecovery = false;
  plainSecret = generateNewTotpSecret();
  user = {
    id: 17,
    name: "Test",
    email: "unit@test.local",
    role: "engineer",
    password_hash: "hash:test",
    totp_secret: encryptTotpSecret(plainSecret),
    totp_enabled_at: "2026-01-01T00:00:00Z",
    totp_last_step: null,
    session_version: 0,
    org_id: 1,
  };
});

function request(code: string) {
  return new NextRequest("http://localhost/api/auth/login/2fa", {
    method: "POST",
    body: JSON.stringify({ pending: "pending-unit-test", code }),
  });
}

test("hai lần xác nhận đồng thời chỉ tiêu thụ TOTP một lần", async () => {
  const { POST } = await import("@/app/api/auth/login/2fa/route");
  const code = await generate({ secret: plainSecret, digits: 6, period: 30 });
  const responses = await Promise.all([POST(request(code)), POST(request(code))]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  assert.equal(responses.filter((r) => r.cookies.get(COOKIE)).length, 1);
});

test("hai lần xác nhận đồng thời chỉ tiêu thụ mã dự phòng một lần", async () => {
  const { POST } = await import("@/app/api/auth/login/2fa/route");
  const responses = await Promise.all([POST(request("abcde-12345")), POST(request("abcde-12345"))]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  assert.equal(responses.filter((r) => r.cookies.get(COOKIE)).length, 1);
  assert.equal(usedRecovery, true);
});

test("cấu hình TOTP chưa kích hoạt không cấp phiên đăng nhập", async () => {
  const { POST } = await import("@/app/api/auth/login/2fa/route");
  user.totp_enabled_at = null;
  const code = await generate({ secret: plainSecret, digits: 6, period: 30 });
  const response = await POST(request(code));
  assert.equal(response.status, 401);
  assert.equal(response.cookies.get(COOKIE), undefined);
  assert.equal(user.totp_last_step, null);
});
