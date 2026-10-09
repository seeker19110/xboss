import "./setup"; // chặn DATABASE_URL thật trước mọi kiểm thử
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

// Chạy CHÍNH code route/helper, chỉ thay các biên Next/DB bằng stub kiểm soát được.
// Không thay thế test Postgres/RLS: phần đó nằm trong admin-bootstrap.test.ts/rls.test.ts.
function load<T>(
  path: string,
  mocks: Record<string, unknown>,
  env: Record<string, string> = {},
): T {
  const file = resolve(path);
  const result = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const evaluatedModule = { exports: {} };
  runInNewContext(
    result.outputText,
    {
      module: evaluatedModule,
      exports: evaluatedModule.exports,
      process: { env },
      Buffer,
      require: (name: string) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw new Error(`Chưa stub dependency: ${name}`);
      },
    },
    { filename: file },
  );
  return evaluatedModule.exports as T;
}

type Response = {
  status: number;
  body: Record<string, unknown>;
  cookieWrites: unknown[][];
  cookies: { set: (...args: unknown[]) => void };
};
type Route = {
  GET: (req?: unknown) => Promise<Response>;
  POST: (req: unknown) => Promise<Response>;
};
const next = {
  NextResponse: {
    json: (body: Record<string, unknown>, options?: { status?: number }) => {
      const cookieWrites: unknown[][] = [];
      return {
        body,
        status: options?.status ?? 200,
        cookieWrites,
        cookies: { set: (...args: unknown[]) => cookieWrites.push(args) },
      };
    },
  },
};
const noSeed = () => {
  throw new Error("HTTP không được seed tài khoản");
};

// Route login/me import `@/lib/nen/loi` (503 schema_not_ready, S16); ca này không dựng tình huống
// schema thiếu nên chỉ cần stub "không phải lỗi schema".
const LOI_STUB = {
  laLoiSchemaChuaSan: () => false,
  phanHoiSchemaChuaSan: () => {
    throw new Error("không dùng trong ca này");
  },
};
test("audit: helper demo không chạm DB ở production dù có mật khẩu admin", async () => {
  let writes = 0;
  const auth = load<{ ensureDefaultUsers: () => Promise<void> }>(
    "lib/bao-mat/auth.ts",
    {
      "node:crypto": crypto,
      "next/headers": {},
      "@/lib/db": { run: async () => writes++ },
      "@/lib/nen/request-context": {},
      "@/lib/nen/log": {},
      "@/lib/nen/roles": { ROLES: [], VIEW_ONLY_ROLES: [], PAYMENT_VIEW_ROLES: [] },
      "@/lib/bao-mat/permissions": {},
      "@/lib/ha-tang/projects": {},
      "@/lib/ha-tang/code-lists": {},
      "@/lib/bao-mat/session-token": {},
    },
    { NODE_ENV: "production", XBOSS_ADMIN_PASSWORD: "test-only-long-password" },
  );
  await auth.ensureDefaultUsers();
  await auth.ensureDefaultUsers();
  assert.equal(writes, 0);
});

test("audit: GET auth/me chưa đăng nhập không khởi tạo tài khoản", async () => {
  const route = load<Route>("app/api/auth/me/route.ts", {
    "next/server": next,
    "@/lib/nen/loi": LOI_STUB,
    "next/headers": {},
    "@/lib/bao-mat/auth": { getCurrentUser: async () => null, ensureDefaultUsers: noSeed },
    "@/lib/bao-mat/session-token": { dauRangBuocPhien: () => null },
  });
  assert.equal((await route.GET()).status, 401);
});

test("audit: POST login trên DB chưa có user không khởi tạo tài khoản", async () => {
  const attempts: boolean[] = [];
  const route = load<Route>("app/api/auth/login/route.ts", {
    "next/server": next,
    "@/lib/nen/loi": LOI_STUB,
    "@/lib/db": {
      queryOne: async () => undefined,
      withOrgScope: (_org: unknown, fn: () => Promise<unknown>) => fn(),
    },
    "@/lib/bao-mat/auth": { ensureDefaultUsers: noSeed },
    "@/lib/bao-mat/ratelimit": {
      loginBlockedSeconds: async () => 0,
      recordLoginFailure: async () => attempts.push(false),
      recordLoginSuccess: async () => attempts.push(true),
    },
  });
  const res = await route.POST({
    headers: new Headers(),
    json: async () => ({ email: "test@example.invalid", password: "x" }),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(attempts, [false]);
  assert.equal(res.cookieWrites.length, 0);
});

for (const projectId of [null, undefined, 0, -1, 1.5]) {
  test(`audit: costs từ chối phạm vi ${String(projectId)} trước mọi query chi phí`, async () => {
    const route = load<Route>("app/api/costs/route.ts", {
      "next/server": next,
      "@/lib/bao-mat/auth": {
        getCurrentUser: async () => ({ role: "admin" }),
        CAN: { viewPayments: () => true },
      },
      "@/lib/ha-tang/projects": { getCurrentProjectId: async () => projectId },
      "@/lib/nen/money": {},
      "@/lib/tai-chinh/cost": {
        getCostReport: () => assert.fail("Không được đọc báo cáo khi phạm vi không hợp lệ"),
      },
    });
    const res = await route.GET({
      nextUrl: new URL("https://test.invalid/api/costs"),
      headers: new Headers(),
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "project_required");
  });
}

test("audit: costs giải quyền sau dự án và đọc báo cáo đúng phạm vi đã kiểm", async () => {
  let projectResolved = false;
  let reads = 0;
  const projectId = 42;
  const route = load<Route>("app/api/costs/route.ts", {
    "next/server": next,
    "@/lib/bao-mat/auth": {
      getCurrentUser: async () => ({ role: "pm" }),
      CAN: {
        viewPayments: () => {
          assert.equal(projectResolved, true);
          return true;
        },
      },
    },
    "@/lib/ha-tang/projects": {
      getCurrentProjectId: async () => {
        projectResolved = true;
        return projectId;
      },
    },
    "@/lib/nen/money": {
      MONEY_FORMAT_HEADER: "X-XBoss-Money-Format",
      MONEY_FORMAT_DECIMAL_V1: "decimal-string-v1",
      moneyWireFormat: () => "legacy-number",
      isMoneyPrecisionError: () => false,
    },
    "@/lib/tai-chinh/cost": {
      getCostReport: async (scope: { kind: string; projectId: number }) => {
        reads++;
        // Object từ vm context khác realm → so theo giá trị JSON.
        assert.equal(JSON.stringify(scope), JSON.stringify({ kind: "project", projectId }));
        return { report: true };
      },
      costReportToWire: (report: unknown, format: string) => {
        assert.deepEqual(report, { report: true });
        assert.equal(format, "legacy-number");
        return { rows: [], alerts: [{ key: "MEP" }] };
      },
    },
  });
  const res = await route.GET({
    nextUrl: new URL("https://test.invalid/api/costs"),
    headers: new Headers(),
  });
  assert.equal(res.status, 200);
  assert.equal(reads, 1);
  assert.equal((res.body.alerts as unknown[]).length, 1);
});

for (const projectId of [null, true, [], {}, 0, -1, 1.5, "", "abc"]) {
  test(`audit: project/select từ chối input ${JSON.stringify(projectId)}`, async () => {
    const route = load<Route>("app/api/project/select/route.ts", {
      "next/server": next,
      "@/lib/bao-mat/auth": { getCurrentUser: async () => ({ role: "admin" }) },
      "@/lib/ha-tang/projects": {
        chotProjectIdChoDoc: () => assert.fail("Input sai không được chốt dự án"),
      },
    });
    const res = await route.POST({ json: async () => ({ projectId }) });
    assert.equal(res.status, 400);
    assert.equal(res.cookieWrites.length, 0);
  });
}

for (const allowed of [false, true]) {
  test(`audit: project/select chỉ đặt cookie sau chính sách đọc cho phép=${allowed}`, async () => {
    let checked = false;
    const route = load<Route>("app/api/project/select/route.ts", {
      "next/server": next,
      "@/lib/bao-mat/auth": { getCurrentUser: async () => ({ role: "admin" }) },
      "@/lib/ha-tang/projects": {
        PROJECT_COOKIE: "xboss_project",
        chotProjectIdChoDoc: async (_user: unknown, projectId: number) => {
          checked = true;
          assert.equal(projectId, 42);
          return allowed ? { ok: true, projectId } : { ok: false, lyDo: "khong-thay" };
        },
      },
    });
    const res = await route.POST({ json: async () => ({ projectId: "42" }) });
    assert.equal(checked, true);
    assert.equal(res.status, allowed ? 200 : 403);
    assert.equal(res.cookieWrites.length, allowed ? 1 : 0);
  });
}

for (const password of [123, true, [], {}]) {
  test(`audit: login giữ kiểm tra kiểu mật khẩu ${JSON.stringify(password)}`, async () => {
    const route = load<Route>("app/api/auth/login/route.ts", {
      "next/server": next,
      "@/lib/nen/loi": LOI_STUB,
      "@/lib/db": {},
      "@/lib/bao-mat/auth": { ensureDefaultUsers: noSeed },
      "@/lib/bao-mat/ratelimit": {},
    });
    const res = await route.POST({
      json: async () => ({ email: "test@example.invalid", password }),
    });
    assert.equal(res.status, 400);
  });
}

test("audit: login giữ xử lý JSON lỗi thành 400, không chạm DB", async () => {
  const route = load<Route>("app/api/auth/login/route.ts", {
    "next/server": next,
    "@/lib/nen/loi": LOI_STUB,
    "@/lib/db": {},
    "@/lib/bao-mat/auth": { ensureDefaultUsers: noSeed },
    "@/lib/bao-mat/ratelimit": {},
  });
  const res = await route.POST({ json: async () => Promise.reject(new Error("invalid JSON")) });
  assert.equal(res.status, 400);
});

for (const enabled2fa of [false, true]) {
  test(`audit: login giữ hợp đồng phiên/2FA, enabled=${enabled2fa}`, async () => {
    const user = {
      id: crypto.randomInt(1, 10000),
      name: "Test admin",
      email: "test@example.invalid",
      role: "admin",
      password_hash: "test-only-hash",
      totp_enabled_at: enabled2fa ? "2026-09-25" : null,
      session_version: 7,
      org_id: 42,
    };
    let recordedSuccess = false;
    let tokenArgs: unknown[] | undefined;
    const route = load<Route>("app/api/auth/login/route.ts", {
      "next/server": next,
      "@/lib/nen/loi": LOI_STUB,
      "@/lib/db": {
        queryOne: async () => user,
        withOrgScope: (_org: unknown, fn: () => Promise<unknown>) => fn(),
      },
      "@/lib/bao-mat/auth": {
        ensureDefaultUsers: noSeed,
        verifyPassword: () => true,
        requiredRoles: async () => new Set(),
        computeMustSetup2fa: () => false,
        isSecureCookie: () => true,
        COOKIE: "xboss_session",
        COOKIE_MAX_AGE: 3600,
        makeToken: (...args: unknown[]) => {
          tokenArgs = args;
          return "test-session";
        },
        makeTotpPendingToken: () => "test-pending",
      },
      "@/lib/bao-mat/ratelimit": {
        loginBlockedSeconds: async () => 0,
        recordLoginFailure: () => assert.fail("Không được ghi nhận lỗi khi mật khẩu đúng"),
        recordLoginSuccess: async () => {
          recordedSuccess = true;
        },
      },
    });
    const res = await route.POST({
      headers: new Headers(),
      json: async () => ({ email: user.email, password: "test-password" }),
    });
    assert.equal(res.status, 200);
    assert.equal(recordedSuccess, true);
    if (enabled2fa) {
      assert.equal(res.body.need2fa, true);
      assert.equal(res.body.pending, "test-pending");
      assert.equal(res.cookieWrites.length, 0);
      assert.equal(tokenArgs, undefined);
    } else {
      assert.equal(res.cookieWrites.length, 1);
      assert.deepEqual(tokenArgs, [user.id, user.password_hash, false, 7, 42]);
    }
  });
}
