import { HAS_TEST_DB } from "./setup"; // không được dùng DATABASE_URL thật
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import dns from "node:dns";
import * as net from "node:net";
import ts from "typescript";

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
    AbortSignal,
    process: { env: { NODE_ENV: "test" } },
    require: (name: string) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Chưa stub dependency: ${name}`);
    },
  });
  return mod.exports as T;
}

type HookModule = typeof import("@/lib/bao-mat/webhooks");
type Row = Record<string, unknown>;

function harness(due: Row[] = [], context?: { userId?: number; orgId?: number }) {
  const writes: { sql: string; args: unknown[] }[] = [];
  const requests: string[] = [];
  const hooks = load<HookModule>("lib/bao-mat/webhooks.ts", {
    "node:crypto": crypto,
    "node:dns": dns,
    "node:net": net,
    undici: {
      Agent: class {},
      fetch: async (url: string) => {
        requests.push(url);
        return { status: 200 };
      },
    },
    "@/lib/db": {
      query: async () => due,
      queryOne: async (_sql: string, projectId: number) =>
        projectId === 22 ? { orgId: 2 } : undefined,
      run: async (sql: string, ...args: unknown[]) => writes.push({ sql, args }),
      withTransaction: async (fn: () => Promise<unknown>) => fn(),
    },
    "@/lib/nen/log": { log: { error() {}, warn() {} } },
    "@/lib/nen/request-context": { getRequestContext: () => context },
  });
  return { hooks, writes, requests };
}

test("webhook: admin không thể gắn webhook vào dự án của org khác", async () => {
  let inserts = 0;
  const route = load<{ POST(req: unknown): Promise<Response> }>("app/api/admin/webhooks/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "node:crypto": crypto,
    "@/lib/bao-mat/auth": {
      getCurrentUser: async () => ({ id: 7, orgId: 1, role: "admin" }),
      CAN: { manageIntegrations: () => true },
    },
    "@/lib/db": {
      queryOne: async (_sql: string, id: number, orgId: number) =>
        id === 11 && orgId === 1 ? { id } : undefined,
      insertId: async () => ++inserts,
    },
    "@/lib/bao-mat/webhooks": harness().hooks,
  });
  const request = (projectId: number | null) => ({
    json: async () => ({ url: "https://hook.example.test/events", events: ["ping"], projectId }),
  });
  assert.equal((await route.POST(request(22))).status, 404);
  assert.equal(inserts, 0);
  assert.equal((await route.POST(request(11))).status, 201);
  assert.equal((await route.POST(request(null))).status, 201);
  assert.equal(inserts, 2);
});

test("webhook: thiếu dự án và context đã xác thực thì không fanout toàn hệ", async () => {
  for (const context of [undefined, {}, { orgId: 2 }, { userId: 7 }]) {
    const { hooks, writes } = harness([], context);
    await hooks.emitWebhook("payment_cert.approved", null, { certId: 1 });
    assert.equal(writes.length, 0);
  }
  const { hooks, writes } = harness([], { userId: 7, orgId: 2 });
  await hooks.emitWebhook("payment_cert.approved", null, { certId: 1 });
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(String(writes[0].args[1])).orgId, 2);
});

test("webhook: dự án không tồn tại không được biến thành sự kiện toàn cục", async () => {
  const { hooks, writes } = harness([], { userId: 7, orgId: 2 });
  await hooks.emitWebhook("task.approved", 999, { taskId: 1 });
  assert.equal(writes.length, 0);
});

const validDelivery = (id = 1): Row => ({
  id,
  event: "task.approved",
  payload: { event: "task.approved", projectId: 22, data: { taskId: 1 } },
  attempts: 0,
  url: `https://hook.example.test/${id}`,
  secret: "test-only",
  orgId: 2,
  webhookProjectId: null,
  webhookProjectOrgId: null,
  payloadProjectOrgId: 2,
  active: true,
  events: ["task.approved"],
});

test("webhook: hàng đợi cũ sai tenant/scope bị đánh dấu failed, không gọi HTTP", async () => {
  const rows = [
    { ...validDelivery(1), orgId: 1 },
    { ...validDelivery(2), webhookProjectId: 11, webhookProjectOrgId: 1 },
    { ...validDelivery(3), payload: { event: "task.approved", projectId: null, data: {} } },
    { ...validDelivery(4), active: false },
    { ...validDelivery(5), events: ["variation.approved"] },
    { ...validDelivery(6), payload: { event: "task.approved", projectId: 22, orgId: 1 } },
    { ...validDelivery(7), payloadProjectOrgId: null },
    { ...validDelivery(8), url: "https://127.0.0.1/hook" },
  ];
  const { hooks, writes, requests } = harness(rows);
  const result = await hooks.deliverDueWebhooks();
  assert.equal(result.sent, 0);
  assert.equal(result.failed, rows.length);
  assert.equal(requests.length, 0);
  assert.equal(writes.length, rows.length);
  for (const write of writes) {
    assert.match(write.sql, /status = 'failed'/);
    assert.doesNotMatch(write.sql, /DELETE/i);
  }
});

test("webhook: giữ delivery cũ đúng org, dấu nguồn mới và ping quản trị hợp lệ", async () => {
  const rows = [
    validDelivery(1),
    { ...validDelivery(2), webhookProjectId: 22, webhookProjectOrgId: 2 },
    {
      ...validDelivery(3),
      payload: { event: "task.approved", projectId: null, orgId: 2, data: {} },
      payloadProjectOrgId: null,
    },
    {
      ...validDelivery(4),
      event: "ping",
      payload: { event: "ping", projectId: null, data: { message: "Kiểm tra" } },
      payloadProjectOrgId: null,
    },
  ];
  const { hooks, requests } = harness(rows);
  const result = await hooks.deliverDueWebhooks();
  assert.equal(result.sent, rows.length);
  assert.equal(result.failed, 0);
  assert.equal(requests.length, rows.length);
});

test(
  "webhook Postgres: global hook chỉ nhận event cùng org, chặn cả hàng đợi lịch sử",
  {
    skip: !HAS_TEST_DB,
  },
  async () => {
    const { insertId, query, queryOne, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { emitWebhook, deliverDueWebhooks, webhookHttp } = await import("@/lib/bao-mat/webhooks");
    await runWithRequestContext({}, async () => {
      const orgA = await insertId(`INSERT INTO organizations (name) VALUES ('Audit hook A')`);
      const orgB = await insertId(`INSERT INTO organizations (name) VALUES ('Audit hook B')`);
      const projectB = await insertId(
        `INSERT INTO projects (name, org_id) VALUES ('Audit hook B', ?)`,
        orgB,
      );
      const user = await insertId(
        `INSERT INTO users (name, email, password_hash, role, org_id)
       VALUES ('Audit hook', ?, 'test-only', 'admin', ?)`,
        `audit-hook-${crypto.randomUUID()}@example.invalid`,
        orgA,
      );
      const hook = (orgId: number, projectId: number | null) =>
        insertId(
          `INSERT INTO webhooks (project_id, url, secret, events, active, created_by, org_id)
       VALUES (?, ?, 'test-only', ?, TRUE, ?, ?)`,
          projectId,
          `https://org-${orgId}.example.test/${projectId ?? "global"}`,
          ["payment_cert.approved"],
          user,
          orgId,
        );
      const globalA = await hook(orgA, null);
      const foreignA = await hook(orgA, projectB); // dữ liệu xấu từ phiên bản trước
      const globalB = await hook(orgB, null);
      const scopedB = await hook(orgB, projectB);
      await emitWebhook("payment_cert.approved", projectB, { certId: 123, code: "TEST-IPC" });
      const ids = [globalA, foreignA, globalB, scopedB];
      const emitted = await query<{ webhookId: number }>(
        `SELECT webhook_id AS "webhookId" FROM webhook_deliveries WHERE webhook_id = ANY(?)`,
        ids,
      );
      assert.deepEqual(
        emitted.map((r) => r.webhookId).sort((a, b) => a - b),
        [globalB, scopedB],
      );

      const legacyId = await insertId(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload) VALUES (?, ?, ?::jsonb)`,
        globalA,
        "payment_cert.approved",
        JSON.stringify({
          event: "payment_cert.approved",
          projectId: projectB,
          data: { certId: 123 },
        }),
      );
      const requests: string[] = [];
      const originalFetch = webhookHttp.fetch;
      webhookHttp.fetch = (async (url: unknown) => {
        requests.push(String(url));
        return { status: 200 };
      }) as unknown as typeof webhookHttp.fetch;
      try {
        await deliverDueWebhooks();
      } finally {
        webhookHttp.fetch = originalFetch;
      }
      assert.ok(requests.some((url) => url.includes(`org-${orgB}.example.test`)));
      assert.ok(!requests.some((url) => url.includes(`org-${orgA}.example.test`)));
      assert.equal(
        (
          await queryOne<{ status: string }>(
            `SELECT status FROM webhook_deliveries WHERE id = ?`,
            legacyId,
          )
        )?.status,
        "failed",
      );
      await run(`DELETE FROM webhooks WHERE id = ANY(?)`, ids);
    });
  },
);
