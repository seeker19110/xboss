import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

type Session = typeof import("../lib/bao-mat/session-token");
const NOW = 1_800_000_000_000;
const TEST_SECRET = "fixture-only-session-key-not-a-real-secret";

function load(env: Record<string, string> = {}): Session {
  const filename = resolve("lib/bao-mat/session-token.ts");
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const evaluated = { exports: {} };
  runInNewContext(js, {
    module: evaluated,
    exports: evaluated.exports,
    process: { env },
    Date: { now: () => NOW },
    Buffer,
    require: (name: string) => {
      assert.equal(name, "node:crypto");
      return crypto;
    },
  });
  return evaluated.exports as Session;
}

function signed(parts: string[], secret = TEST_SECRET): string {
  const payload = parts.join(".");
  const mac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

const fields = ["42", String(NOW + 1000), "abcdef123456", "0", "7", "9"];

for (const secret of [undefined, "", "   "]) {
  test(`phiên: production không có khóa hợp lệ (${JSON.stringify(secret)}) phải từ chối ký`, () => {
    const env: Record<string, string> = { NODE_ENV: "production" };
    if (secret !== undefined) env.XBOSS_SECRET = secret;
    const session = load(env); // Import vẫn được để build không cần khóa production.
    assert.throws(() => session.sign("payload"), /XBOSS_SECRET/);
    assert.throws(() => session.makeToken(42, "abcdef123456", false, 7, 9), /XBOSS_SECRET/);
    // Token ký bằng khóa dự phòng cũ cũng không được xác minh khi chưa có cấu hình.
    assert.throws(
      () => session.parseToken(signed(fields, "xboss-default-production-secret-min32char")),
      /XBOSS_SECRET/,
    );
  });
}

test("phiên: giữ chữ ký, thứ tự trường và cờ 2FA khi production có khóa", () => {
  const session = load({ NODE_ENV: "production", XBOSS_SECRET: TEST_SECRET });
  for (const flag of [false, true]) {
    const token = session.makeToken(42, "abcdef123456:rest", flag, 7, 9);
    const parsed = session.parseToken(token);
    assert.ok(parsed);
    assert.equal(parsed.uid, 42);
    assert.equal(parsed.orgId, 9);
    assert.equal(parsed.sessionVersion, 7);
    assert.equal(parsed.pwFrag, "abcdef123456");
    assert.equal(parsed.mustSetup2fa, flag);
    assert.equal(token, signed(token.split(".").slice(0, 6)));
  }
});

test("phiên: dev/test giữ khóa dự phòng hiện có, không sửa môi trường process thật", () => {
  for (const mode of ["development", "test"]) {
    const session = load({ NODE_ENV: mode });
    assert.ok(session.parseToken(signed(fields, "xboss-dev-secret-change-me")));
  }
});

for (const field of [0, 1, 4, 5]) {
  test(`phiên: trường số ${field} từ chối NaN, số vượt biên và biểu diễn không canonical`, () => {
    const session = load({ XBOSS_SECRET: TEST_SECRET });
    const invalid = ["NaN", "Infinity", "9007199254740992", "1e3", "-1", "01", "", " 1", "0x20"];
    for (const bad of invalid) {
      const changed = [...fields];
      changed[field] = bad;
      assert.equal(session.parseToken(signed(changed)), null, `${field}: ${bad}`);
    }
    const zero = [...fields];
    zero[field] = "0";
    assert.equal(session.parseToken(signed(zero)) === null, field !== 4);
  });
}

test("phiên: hết hạn ngay tại exp và trước exp; MAC dư hậu tố không được chấp nhận", () => {
  const session = load({ XBOSS_SECRET: TEST_SECRET });
  for (const exp of [NOW - 1, NOW]) {
    const changed = [...fields];
    changed[1] = String(exp);
    assert.equal(session.parseToken(signed(changed)), null);
  }
  const token = signed(fields);
  for (const suffix of ["0", "gg", "\n", "zz"]) {
    assert.equal(session.parseToken(token + suffix), null, suffix);
  }
  assert.ok(session.parseToken(token));
});

test("phiên: token sai kiểu, quá dài, sai cờ và sai chữ ký bị từ chối", () => {
  const session = load({ XBOSS_SECRET: TEST_SECRET });
  for (const token of [null, undefined, {}, 42, "x".repeat(513)]) {
    assert.equal(session.parseToken(token as string), null);
  }
  const changed = [...fields];
  changed[3] = "2fa";
  assert.equal(session.parseToken(signed(changed)), null);
  assert.equal(session.parseToken(signed(fields, "another-test-key")), null);
});
