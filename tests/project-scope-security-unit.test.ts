import "./setup";
import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { getRequestContext, runWithRequestContext } from "@/lib/nen/request-context";

const projects = [
  { id: 101, orgId: 10 },
  { id: 102, orgId: 10 },
  { id: 201, orgId: 20 },
];
const actor = { id: 11, role: "pm" as const, orgId: 10 };
let assigned: number[] = [];
// Số dòng user_projects của NGƯỜI KHÁC — >0 nghĩa là hệ thống đã bắt đầu cấu hình gán dự án.
let otherMemberships = 1;
let cookie: string | undefined;
let businessReads: number[] = [];

mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({ get: () => (cookie === undefined ? undefined : { value: cookie }) }),
  },
});
mock.module("@/lib/db", {
  namedExports: {
    todayISO: () => "2026-09-27",
    query: async (sql: string, ...args: unknown[]) => {
      if (sql.includes("COUNT(*) AS n FROM user_projects"))
        return [{ n: assigned.length + otherMemberships }];
      if (sql.includes("FROM user_projects"))
        return projects
          .filter((p) => assigned.includes(p.id) && p.orgId === args[1])
          .map((p) => ({ projectId: p.id }));
      if (sql.includes("FROM projects WHERE org_id"))
        return projects.filter((p) => p.orgId === args[0]);
      throw new Error("Truy vấn ngoài phạm vi fixture scope");
    },
    queryOne: async (_sql: string, id: unknown) => projects.find((p) => p.id === id) ?? null,
  },
});
mock.module("@/lib/bao-mat/auth", {
  namedExports: { getCurrentUser: async () => actor, CAN: { viewEngineeringGraph: () => true } },
});
mock.module("@/lib/ky-thuat/engineering-cashflow", {
  namedExports: {
    listCashflowForecasts: async (projectId: number) => {
      businessReads.push(projectId);
      return [];
    },
  },
});

beforeEach(() => {
  assigned = [];
  otherMemberships = 1;
  cookie = undefined;
  businessReads = [];
});

test("phạm vi: non-admin không có membership thấy rỗng; admin chỉ thấy cùng org", async () => {
  const { visibleProjectIds } = await import("@/lib/ha-tang/projects");
  assert.deepEqual(await visibleProjectIds(actor), []);
  assert.deepEqual(await visibleProjectIds({ ...actor, role: "admin" }), [101, 102]);
  assert.deepEqual(await visibleProjectIds({ ...actor, orgId: 0 }), []);
});

test("phạm vi: chưa cấu hình gán dự án nào → thấy mọi dự án CÙNG tổ chức, không xuyên org", async () => {
  otherMemberships = 0;
  const { visibleProjectIds } = await import("@/lib/ha-tang/projects");
  assert.deepEqual(await visibleProjectIds(actor), [101, 102]);
  assert.deepEqual(await visibleProjectIds({ ...actor, orgId: 20 }), [201]);
  assert.deepEqual(await visibleProjectIds({ ...actor, orgId: 0 }), []);
});

test("phạm vi: membership trỏ khác org không làm lộ dự án", async () => {
  assigned = [101, 201];
  const { visibleProjectIds } = await import("@/lib/ha-tang/projects");
  assert.deepEqual(await visibleProjectIds(actor), [101]);
});

test("phạm vi ghi: luôn kiểm dự án hiện tại và không tự dùng dự án 1", async () => {
  const { chotProjectIdChoGhi } = await import("@/lib/ha-tang/projects");
  assert.deepEqual(await chotProjectIdChoGhi(actor, undefined, null), { ok: false });
  assert.deepEqual(await chotProjectIdChoGhi(actor, undefined, 101), { ok: false });
  assigned = [101];
  assert.deepEqual(await chotProjectIdChoGhi(actor, undefined, 101), { ok: true, projectId: 101 });
  assert.deepEqual(await chotProjectIdChoGhi(actor, "101", null), { ok: true, projectId: 101 });
  assert.deepEqual(await chotProjectIdChoGhi(actor, 201, 101), { ok: false });
  // Chuỗi rỗng (form để trống) = dùng dự án đang chọn, vẫn qua kiểm quyền.
  assert.deepEqual(await chotProjectIdChoGhi(actor, "", 101), { ok: true, projectId: 101 });
  assert.deepEqual(await chotProjectIdChoGhi(actor, "", null), { ok: false });
});

test("phạm vi ghi: không ép input sai thành dự án hợp lệ", async () => {
  assigned = [101];
  const { chotProjectIdChoGhi } = await import("@/lib/ha-tang/projects");
  for (const input of [true, [101], {}, "0101", "1.01e2", "0x65", " 101", -1, Infinity, 1.5])
    assert.deepEqual(await chotProjectIdChoGhi(actor, input, 101), { ok: false });
});

test("dự án hiện tại: không tái dùng context cũ sau khi mất membership", async () => {
  const { getCurrentProjectId } = await import("@/lib/ha-tang/projects");
  assigned = [101];
  cookie = "101";
  await runWithRequestContext({ projectId: 201 }, async () => {
    assert.equal(await getCurrentProjectId(actor), 101);
    assigned = [];
    assert.equal(await getCurrentProjectId(actor), null);
    assert.equal(getRequestContext()?.projectId, undefined);
  });
});

test("dự án hiện tại: cookie thiếu/sai/ngoài quyền → dự án đầu trong quyền, không bao giờ ngoài org", async () => {
  const { getCurrentProjectId } = await import("@/lib/ha-tang/projects");
  assigned = [101, 102];
  // Không trả null ở đây: nhiều route còn coi dự án null là "không lọc" (audit PR #544).
  assert.equal(await getCurrentProjectId(actor), 101);
  cookie = "201";
  assert.equal(await getCurrentProjectId(actor), 101);
  cookie = "abc";
  assert.equal(await getCurrentProjectId(actor), 101);
  cookie = "102";
  assert.equal(await getCurrentProjectId(actor), 102);
});

test("route dự báo: thiếu scope trả 404 trước query; membership hợp lệ giữ hành vi", async () => {
  const { GET } = await import("@/app/api/engineering/cashflow/forecasts/route");
  assert.equal((await GET()).status, 404);
  assert.deepEqual(businessReads, []);
  assigned = [101];
  assert.equal((await GET()).status, 200);
  assert.deepEqual(businessReads, [101]);
});
