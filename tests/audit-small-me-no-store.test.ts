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

for (const state of ["anonymous", "valid", "must-setup-2fa", "missing-token", "invalid-token"]) {
  test(`auth/me: no-store và giữ hợp đồng response (${state})`, async () => {
    const actor = { id: randomInt(100, 10000), role: "pm", orgId: randomInt(100, 10000) };
    let cookieReads = 0;
    let parses = 0;
    const route = load<{ GET(): Promise<Reply> }>("app/api/auth/me/route.ts", {
      "next/server": next,
      "next/headers": {
        cookies: async () => {
          cookieReads++;
          return { get: () => (state === "missing-token" ? undefined : { value: "test-token" }) };
        },
      },
      "@/lib/bao-mat/auth": {
        COOKIE: "xboss_session",
        getCurrentUser: async () => (state === "anonymous" ? null : actor),
        parseToken: () => {
          parses++;
          return state === "invalid-token" ? null : { mustSetup2fa: state === "must-setup-2fa" };
        },
        ensureDefaultUsers: () => assert.fail("GET auth/me không được seed user"),
      },
    });
    const res = await route.GET();
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.cookieWrites.length, 0);
    if (state === "anonymous") {
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { user: null });
      assert.equal(cookieReads, 0);
    } else {
      assert.equal(res.status, 200);
      assert.equal(cookieReads, 1);
      assert.equal(parses, state === "missing-token" ? 0 : 1);
      if (state === "must-setup-2fa") {
        assert.deepEqual(res.body, {
          user: actor,
          error: "Cần bật xác thực 2 lớp trước khi tiếp tục",
          code: "2fa_required",
        });
      } else assert.deepEqual(res.body, { user: actor });
    }
  });
}
