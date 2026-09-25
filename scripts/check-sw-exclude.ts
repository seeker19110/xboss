// Cổng CI S04: chạy handler SW thật với mọi path registry khai cần network-only.
// Không chỉ grep literal: cache thao tác bất kỳ hoặc che lỗi mạng/401 đều làm gate đỏ.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { MODULES } from "@/lib/nen/modules";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swSource = readFileSync(join(root, "public/sw.js"), "utf8");
const paths = new Set(["/api/auth/me", "/api/costs", "/api/audit-new-module/probe"]);
for (const mod of MODULES) {
  for (const path of mod.swExclude ?? []) {
    assert.ok(path.startsWith("/api/"), `swExclude ngoài API cần review: ${path}`);
    paths.add(path);
    paths.add(`${path}${path.endsWith("/") ? "" : "/"}probe`);
  }
}

type FetchEventStub = {
  request: Request;
  respondWith: (value: Promise<Response> | Response) => void;
  waitUntil: (value: Promise<unknown>) => void;
};

async function check(path: string, offline: boolean): Promise<void> {
  const handlers = new Map<string, (event: FetchEventStub) => void>();
  let calls = 0;
  const unavailable = new Error("mất mạng thử nghiệm");
  const denied = new Response(null, { status: 401 });
  const request = new Request(`https://xboss.test${path}`);
  runInNewContext(swSource, {
    self: {
      addEventListener: (name: string, handler: (event: FetchEventStub) => void) => {
        handlers.set(name, handler);
      },
    },
    location: { origin: "https://xboss.test" },
    URL,
    Request,
    Response,
    caches: new Proxy({}, { get: () => assert.fail(`SW chạm cache ở ${path}`) }),
    fetch: (input: Request, init: RequestInit) => {
      calls++;
      assert.equal(input, request);
      assert.equal(init.cache, "no-store");
      return offline ? Promise.reject(unavailable) : Promise.resolve(denied);
    },
  });
  let response: Promise<Response> | undefined;
  handlers.get("fetch")?.({
    request,
    respondWith: (value) => {
      response = Promise.resolve(value);
    },
    waitUntil: () => assert.fail(`API không được ghi cache nền: ${path}`),
  });
  assert.ok(response, `SW chưa bảo vệ request ${path}`);
  if (offline) await assert.rejects(response, (error: unknown) => error === unavailable);
  else assert.equal(await response, denied);
  assert.equal(calls, 1);
}

async function main(): Promise<void> {
  for (const path of paths) {
    await check(path, false);
    await check(path, true);
  }
  console.log(`[OK] ${paths.size} path registry/API chỉ qua mạng; giữ nguyên 401/lỗi mạng.`);
}

main().catch((error: unknown) => {
  console.error("[LỖI] Chính sách cache SW không khớp registry:", error);
  process.exitCode = 1;
});
