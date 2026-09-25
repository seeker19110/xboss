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

function fixture(allowed = true, signedIn = true) {
  const actor = { id: randomInt(100, 10000), role: "pm", orgId: randomInt(100, 10000) };
  const scopeCalls: number[] = [];
  const route = load<{ POST(req: unknown): Promise<Reply> }>("app/api/project/select/route.ts", {
    "next/server": next,
    "@/lib/bao-mat/auth": { getCurrentUser: async () => (signedIn ? actor : null) },
    "@/lib/ha-tang/projects": {
      PROJECT_COOKIE: "xboss_project",
      chotProjectIdChoDoc: async (user: unknown, projectId: number) => {
        assert.equal(user, actor);
        scopeCalls.push(projectId);
        return allowed ? { ok: true, projectId } : { ok: false };
      },
    },
  });
  return { route, scopeCalls };
}

const invalid: unknown[] = [
  null,
  undefined,
  true,
  false,
  [],
  {},
  { valueOf: null, toString: null },
  0,
  -1,
  2.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  "",
  "0",
  "-2",
  "2.0",
  "2e2",
  "0x10",
  "+2",
  " 2",
  "2 ",
  "02",
  "２",
  "٢",
  "9007199254740992",
  "1".repeat(20000),
];
for (const [index, value] of invalid.entries()) {
  test(`project/select: từ chối input không canonical #${index}`, async () => {
    const f = fixture();
    const res = await f.route.POST({ json: async () => ({ projectId: value }) });
    assert.equal(res.status, 400);
    assert.equal(f.scopeCalls.length, 0);
    assert.equal(res.cookieWrites.length, 0);
  });
}

for (const asString of [false, true]) {
  test(`project/select: giữ input hợp lệ, chuỗi=${asString}`, async () => {
    const projectId = randomInt(100, 10000);
    const f = fixture();
    const res = await f.route.POST({
      json: async () => ({ projectId: asString ? String(projectId) : projectId }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(f.scopeCalls, [projectId]);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(res.cookieWrites.length, 1);
    assert.equal(res.cookieWrites[0][0], "xboss_project");
    assert.equal(res.cookieWrites[0][1], String(projectId));
  });
}

test("project/select: giữ biên safe integer nhưng vẫn phải qua policy", async () => {
  const f = fixture(false);
  const res = await f.route.POST({
    json: async () => ({ projectId: String(Number.MAX_SAFE_INTEGER) }),
  });
  assert.deepEqual(f.scopeCalls, [Number.MAX_SAFE_INTEGER]);
  assert.equal(res.status, 403);
  assert.equal(res.cookieWrites.length, 0);
});

test("project/select: user chưa đăng nhập không parse body hoặc gọi policy", async () => {
  const f = fixture(true, false);
  const res = await f.route.POST({ json: () => assert.fail("Không được đọc body") });
  assert.equal(res.status, 401);
  assert.equal(f.scopeCalls.length, 0);
});

test("project/select: JSON lỗi trả 400", async () => {
  const f = fixture();
  const res = await f.route.POST({
    json: async () => {
      throw new Error("bad JSON");
    },
  });
  assert.equal(res.status, 400);
  assert.equal(f.scopeCalls.length, 0);
});
