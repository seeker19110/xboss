import "./setup"; // Không cho test đọc cấu hình DB production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { randomInt } from "node:crypto";
import ts from "typescript";

// Chạy source thật; chỉ giả lập biên framework/storage. Không thay test DB/browser.
function load<T>(path: string, mocks: Record<string, unknown>, globals = {}): T {
  const filename = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const evaluatedModule = { exports: {} };
  runInNewContext(
    outputText,
    {
      module: evaluatedModule,
      exports: evaluatedModule.exports,
      Buffer,
      require: (name: string) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw new Error(`Dependency chưa được giả lập: ${name}`);
      },
      ...globals,
    },
    { filename, timeout: 1000 },
  );
  return evaluatedModule.exports as T;
}

type Reply = {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
  cookieWrites: unknown[][];
};
const next = {
  NextResponse: {
    json: (
      body: Record<string, unknown>,
      init?: { status?: number; headers?: Record<string, string> },
    ) => {
      const cookieWrites: unknown[][] = [];
      return {
        status: init?.status ?? 200,
        body: JSON.parse(JSON.stringify(body)) as Record<string, unknown>,
        headers: new Headers(init?.headers),
        cookieWrites,
        cookies: { set: (...args: unknown[]) => cookieWrites.push(args) },
      };
    },
  },
};

type TestUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  password_hash: string;
  totp_enabled_at: string | null;
  org_id: number;
  session_version: number;
};
function fixture(opts: { user?: TestUser; wait?: number; setup2fa?: boolean } = {}) {
  const events: string[] = [];
  let tokenArgs: unknown[] | undefined;
  let receivedPassword: unknown;
  const route = load<{ POST(req: unknown): Promise<Reply> }>("app/api/auth/login/route.ts", {
    "next/server": next,
    "@/lib/db": {
      queryOne: async (_sql: string, email: unknown) => {
        events.push(`query:${email}`);
        return opts.user;
      },
    },
    "@/lib/bao-mat/auth": {
      verifyPassword: (password: unknown) => {
        receivedPassword = password;
        return true;
      },
      makeToken: (...args: unknown[]) => {
        tokenArgs = args;
        return "test-session";
      },
      makeTotpPendingToken: () => "test-pending",
      requiredRoles: async () => new Set(),
      computeMustSetup2fa: () => opts.setup2fa ?? false,
      isSecureCookie: () => true,
      COOKIE: "xboss_session",
      COOKIE_MAX_AGE: 3600,
      ensureDefaultUsers: () => assert.fail("Không seed từ HTTP"),
    },
    "@/lib/bao-mat/ratelimit": {
      loginBlockedSeconds: async (_ip: string, email: string) => {
        events.push(`limit:${email}`);
        return opts.wait ?? 0;
      },
      recordLoginFailure: async () => {
        events.push("failure");
      },
      recordLoginSuccess: async () => {
        events.push("success");
      },
    },
  });
  return { route, events, tokenArgs: () => tokenArgs, receivedPassword: () => receivedPassword };
}

const invalidBodies = [
  null,
  undefined,
  [],
  ["a", "b"],
  true,
  false,
  7,
  "text",
  {},
  { email: "a@example.invalid", password: 10 },
  { email: 10, password: "x" },
  { email: "a@example.invalid", password: "" },
];
for (const [index, body] of invalidBodies.entries()) {
  test(`login: JSON không đúng cấu trúc #${index} trả 400, không truy cập DB`, async () => {
    const f = fixture();
    const res = await f.route.POST({ json: async () => body, headers: new Headers() });
    assert.equal(res.status, 400);
    assert.deepEqual(f.events, []);
    assert.equal(res.cookieWrites.length, 0);
  });
}

test("login: malformed JSON giữ 400 thay vì ngoại lệ", async () => {
  const f = fixture();
  const res = await f.route.POST({
    json: async () => {
      throw new Error("bad JSON");
    },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(f.events, []);
});

test("login: không có user giữ 401 và bộ đếm brute-force", async () => {
  const f = fixture();
  const res = await f.route.POST({
    json: async () => ({ email: "  TEST@example.invalid  ", password: "x" }),
    headers: new Headers(),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(f.events, [
    "limit:test@example.invalid",
    "query:test@example.invalid",
    "failure",
  ]);
  assert.equal(res.cookieWrites.length, 0);
});

test("login: bị rate-limit giữ Retry-After, không query user", async () => {
  const f = fixture({ wait: 75 });
  const res = await f.route.POST({
    json: async () => ({ email: "test@example.invalid", password: "x" }),
    headers: new Headers(),
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "75");
  assert.deepEqual(f.events, ["limit:test@example.invalid"]);
});

for (const mode of ["normal", "pending-2fa", "must-setup-2fa"]) {
  test(`login: giữ giao thức token/2FA (${mode})`, async () => {
    const user: TestUser = {
      id: randomInt(100, 10000),
      name: "Fixture",
      email: "test@example.invalid",
      role: "admin",
      password_hash: "fixture-hash",
      totp_enabled_at: mode === "pending-2fa" ? "fixture-date" : null,
      org_id: randomInt(100, 10000),
      session_version: randomInt(100, 10000),
    };
    const f = fixture({ user, setup2fa: mode === "must-setup-2fa" });
    const password = "  password-with-spaces  ";
    const res = await f.route.POST({
      json: async () => ({ email: user.email, password }),
      headers: new Headers(),
    });
    assert.equal(res.status, 200);
    assert.equal(f.receivedPassword(), password);
    assert.deepEqual(f.events, [
      "limit:test@example.invalid",
      "query:test@example.invalid",
      "success",
    ]);
    if (mode === "pending-2fa") {
      assert.deepEqual(res.body, { need2fa: true, pending: "test-pending" });
      assert.equal(res.cookieWrites.length, 0);
      assert.equal(f.tokenArgs(), undefined);
    } else {
      assert.deepEqual(f.tokenArgs(), [
        user.id,
        user.password_hash,
        mode === "must-setup-2fa",
        user.session_version,
        user.org_id,
      ]);
      assert.deepEqual(res.body, {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
      assert.equal(res.cookieWrites.length, 1);
    }
  });
}
