import "./setup"; // chặn DATABASE_URL thật trước mọi kiểm thử
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as https from "node:https";
import dns from "node:dns";
import ts from "typescript";
import { safeLookup, validateWebhookUrl } from "@/lib/bao-mat/webhooks";
import * as loi from "@/lib/nen/loi";

// Chạy code thật, chỉ mock biên DB/HTTP; không dùng DB, secret hay mạng production.
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const file = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const mod = { exports: {} };
  runInNewContext(outputText, {
    module: mod,
    exports: mod.exports,
    URL,
    process: { env: { VAPID_PUBLIC_KEY: "test-only", VAPID_PRIVATE_KEY: "test-only" } },
    require: (name: string) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Chưa stub dependency: ${name}`);
    },
  });
  return mod.exports as T;
}

type Subscription = { id: number; endpoint: string; p256dh: string; auth: string };
type Push = typeof import("@/lib/van-hanh/push");
type Options = { agent: https.Agent; timeout: number };

function pushModule(subs: Subscription[] = []) {
  const sends: { endpoint: string; options: Options }[] = [];
  const push = load<Push>("lib/van-hanh/push.ts", {
    "node:https": https,
    "@/lib/db": { query: async () => subs, run: async () => ({ changes: 1 }) },
    "@/lib/nen/log": { log: { error() {}, warn() {} } },
    "@/lib/bao-mat/webhooks": { safeLookup, validateWebhookUrl },
    "web-push": {
      setVapidDetails() {},
      sendNotification: async (sub: Subscription, _body: string, options: Options) => {
        sends.push({ endpoint: sub.endpoint, options });
      },
    },
  });
  return { push, sends };
}

const forbidden = [
  "https://127.0.0.1:8443/private-api",
  "https://2130706433/private-api",
  "https://0x7f000001/private-api",
  "https://10.0.0.2/push",
  "https://192.168.1.2/push",
  "https://172.16.0.2/push",
  "https://169.254.169.254/latest/meta-data",
  "https://100.64.0.2/push",
  "https://localhost/push",
  "https://[::1]/push",
  "https://[::ffff:127.0.0.1]/push",
  "https://[fd00::1]/push",
  "https://[fe80::1]/push",
  "http://push.example.test/push",
  "https://name:password@push.example.test/push",
  "file:///etc/passwd",
  "not-a-url",
];

test("push: đăng ký endpoint nội bộ/scheme sai bị chặn trước khi ghi DB", async () => {
  const { push } = pushModule();
  let writes = 0;
  const route = load<{ POST(req: unknown): Promise<Response> }>("app/api/push/subscribe/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/db": { run: async () => writes++ },
    "@/lib/bao-mat/auth": {
      getCurrentUser: async () => ({ id: 77, role: "engineer", orgId: 1 }),
    },
    "@/lib/van-hanh/push": push,
    // Tiện ích thuần (DELETE bắt 23503 → 409) — dùng module thật, không cần stub.
    "@/lib/nen/loi": loi,
  });
  for (const endpoint of forbidden) {
    const response = await route.POST({
      json: async () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    });
    assert.equal(response.status, 400, endpoint);
  }
  assert.equal(writes, 0);

  const response = await route.POST({
    json: async () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-only",
      keys: { p256dh: "p", auth: "a" },
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
});

test("push: dữ liệu cũ chứa endpoint nội bộ không tới biên gửi HTTP", async () => {
  const { push, sends } = pushModule(
    forbidden.map((endpoint, id) => ({ id, endpoint, p256dh: "p", auth: "a" })),
  );
  assert.equal(await push.sendPushToUsers([77], { title: "t", body: "b" }), 0);
  assert.equal(sends.length, 0);
});

test("push: dịch vụ public vẫn gửi qua HTTPS Agent chặn DNS và có socket timeout", async () => {
  const endpoints = [
    "https://fcm.googleapis.com/fcm/send/test-only",
    "https://updates.push.services.mozilla.com/wpush/v2/test-only",
    "https://web.push.apple.com/test-only",
    "https://custom-push.example.test/push",
  ];
  const { push, sends } = pushModule(
    endpoints.map((endpoint, id) => ({ id, endpoint, p256dh: "p", auth: "a" })),
  );
  assert.equal(await push.sendPushToUsers([77], { title: "t", body: "b" }), endpoints.length);
  assert.deepEqual(
    sends.map((s) => s.endpoint),
    endpoints,
  );
  for (const call of sends) {
    assert.ok(call.options.agent instanceof https.Agent);
    assert.equal(call.options.agent.options.lookup, safeLookup);
    assert.equal(call.options.timeout, 10_000);
  }

  const lookup = sends[0].options.agent.options.lookup!;
  // Domain hợp lệ lúc đăng ký nhưng DNS đổi thành nội bộ khi mở socket: fail closed,
  // kể cả câu trả lời chứa đồng thời một IP public và một IP private.
  const resolver = mock.method(dns.promises, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);
  try {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolveError) => {
      lookup("custom-push.example.test", { all: true }, (err) => resolveError(err));
    });
    assert.equal(error?.code, "EAI_SSRF_BLOCKED");
  } finally {
    resolver.mock.restore();
  }
});
