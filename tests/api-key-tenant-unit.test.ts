import "./setup";
import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { getRequestContext, runWithRequestContext } from "@/lib/nen/request-context";

// Biên DB giả lập hai tổ chức; gọi nguyên handler và logic xác thực của sản phẩm.
const projects = new Map([
  [101, 10],
  [202, 20],
]);
const rawKey = "xbk_" + "1".repeat(64);
let projectId: number | null = null;
let inserted: unknown[][] = [];
let projectReads = 0;

mock.module("@/lib/bao-mat/auth", {
  namedExports: {
    getCurrentUser: async () => ({ id: 11, role: "admin", orgId: 10 }),
    CAN: { manageIntegrations: () => true },
  },
});
mock.module("@/lib/bao-mat/ratelimit", {
  namedExports: { hitRateLimit: async () => false },
});
mock.module("@/lib/db", {
  namedExports: {
    queryOne: async (sql: string, ...values: unknown[]) => {
      if (sql.includes("FROM api_keys"))
        return { id: 1, projectId, orgId: 10, scopes: ["read"], createdBy: 11 };
      if (sql.includes("FROM projects")) {
        projectReads++;
        const orgId = projects.get(Number(values[0]));
        return orgId && (values.length === 1 || orgId === values[1]) ? { exists: 1 } : null;
      }
      throw new Error("Câu đọc ngoài phạm vi test tenant API key");
    },
    query: async () => [],
    run: async () => undefined,
    insertId: async (_sql: string, ...values: unknown[]) => {
      inserted.push(values);
      return 5;
    },
  },
});

beforeEach(() => {
  projectId = null;
  inserted = [];
  projectReads = 0;
});

function request(project: number) {
  return new NextRequest(`http://localhost/api/v1/tasks?project=${project}`, {
    headers: { authorization: `Bearer ${rawKey}` },
  });
}

test("tạo key: dự án ngoài tổ chức trả 404 và không ghi key", async () => {
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const response = await POST(
    new NextRequest("http://localhost/api/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "Test", projectId: 202 }),
    }),
  );
  assert.equal(response.status, 404);
  assert.equal(inserted.length, 0);
});

test("tạo key: dự án cùng tổ chức vẫn được cấp key", async () => {
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const response = await POST(
    new NextRequest("http://localhost/api/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "Test", projectId: 101 }),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(inserted[0][2], 101);
  assert.equal(inserted[0][5], 10);
});

test("key toàn cục: từ chối dự án khác tổ chức và không đặt ngữ cảnh", async () => {
  const { requireApiKey } = await import("@/lib/bao-mat/api-keys");
  await runWithRequestContext({}, async () => {
    const response = await requireApiKey(request(202), "read");
    assert.ok(response instanceof Response);
    assert.equal(response.status, 404);
    assert.deepEqual(getRequestContext(), {});
  });
});

test("key gắn dự án: cấu hình cũ sai tổ chức bị từ chối", async () => {
  const { requireApiKey } = await import("@/lib/bao-mat/api-keys");
  projectId = 202;
  const response = await requireApiKey(request(101), "read");
  assert.ok(response instanceof Response);
  assert.equal(response.status, 404);
});

test("key hợp lệ: ngữ cảnh chứa đúng tổ chức, dự án và người tạo", async () => {
  const { requireApiKey } = await import("@/lib/bao-mat/api-keys");
  await runWithRequestContext({}, async () => {
    const result = await requireApiKey(request(101), "read");
    assert.ok(!(result instanceof Response));
    assert.equal(result.auth.orgId, 10);
    assert.deepEqual(getRequestContext(), { orgId: 10, projectId: 101, userId: 11 });
  });
});

test("key toàn cục: dự án đã xoá hoặc không tồn tại trả 404", async () => {
  const { requireApiKey } = await import("@/lib/bao-mat/api-keys");
  const response = await requireApiKey(request(303), "read");
  assert.ok(response instanceof Response);
  assert.equal(response.status, 404);
});

test("tạo key: ID không chuẩn bị từ chối trước truy vấn dự án", async () => {
  const { POST } = await import("@/app/api/admin/api-keys/route");
  for (const invalid of [
    true,
    [101],
    {},
    0,
    -1,
    1.5,
    "0101",
    "1e2",
    "0x65",
    "101 ",
    "101x",
    "9007199254740992",
  ]) {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Invalid ID", projectId: invalid }),
      }),
    );
    assert.equal(response.status, 400, JSON.stringify(invalid));
  }
  assert.equal(projectReads, 0);
  assert.equal(inserted.length, 0);
});

test("key toàn cục: query ID chỉ nhận chuỗi thập phân chuẩn", async () => {
  const { requireApiKey } = await import("@/lib/bao-mat/api-keys");
  for (const invalid of ["", "0101", "1e2", "0x65", "101 ", "-1", "1.5", "9007199254740992"]) {
    const req = new NextRequest(
      `http://localhost/api/v1/tasks?project=${encodeURIComponent(invalid)}`,
      {
        headers: { authorization: `Bearer ${rawKey}` },
      },
    );
    const response = await requireApiKey(req, "read");
    assert.ok(response instanceof Response);
    assert.equal(response.status, 422, invalid);
  }
  assert.equal(projectReads, 0);
});

test("tạo key: chuỗi ID thập phân chuẩn vẫn hợp lệ", async () => {
  const { POST } = await import("@/app/api/admin/api-keys/route");
  const response = await POST(
    new NextRequest("http://localhost/api/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "String ID", projectId: "101" }),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(inserted[0][2], 101);
});
