import "./setup";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { runWithRequestContext, patchRequestContext } from "@/lib/nen/request-context";

type Row = {
  role: string;
  permKey: string;
  allowed: boolean;
  projectId: number | null;
  projectOrgId: number | null;
};
let read: (orgId: number) => Promise<Row[]> = async () => [];
mock.module("@/lib/db", {
  namedExports: {
    query: async (_sql: string, orgId: number) => read(orgId),
    queryOne: async () => undefined,
    run: async () => ({ changes: 0 }),
    insertId: async () => 1,
    todayISO: () => "2026-09-27",
    withTransaction: async (fn: () => Promise<unknown>) => fn(),
  },
});

test("snapshot: đang nạp không mở quyền; nạp xong giữ deny và quyền mặc định đúng", async () => {
  const { CAN } = await import("@/lib/bao-mat/auth");
  const { invalidatePermissionCache } = await import("@/lib/bao-mat/permissions");
  let finish!: (rows: Row[]) => void;
  read = async () =>
    new Promise<Row[]>((resolve) => {
      finish = resolve;
    });
  await runWithRequestContext({ userId: 1, orgId: 1, role: "pm", projectId: 10 }, async () => {
    assert.equal(CAN.approve("pm"), false);
    const loading = invalidatePermissionCache(1);
    assert.equal(CAN.approve("pm"), false);
    assert.equal(CAN.editStructure("pm"), false);
    finish([{ role: "pm", permKey: "approve", allowed: false, projectId: 10, projectOrgId: 1 }]);
    await loading;
    assert.equal(CAN.approve("pm"), false);
    assert.equal(CAN.editStructure("pm"), true);
  });
});

test("snapshot: DB lỗi khi refresh xóa allow cũ; request mới không thừa hưởng snapshot", async () => {
  const { CAN } = await import("@/lib/bao-mat/auth");
  const { invalidatePermissionCache } = await import("@/lib/bao-mat/permissions");
  read = async () => [];
  await runWithRequestContext({ userId: 1, orgId: 1, role: "pm" }, async () => {
    await invalidatePermissionCache(1);
    assert.equal(CAN.approve("pm"), true);
    read = async () => {
      throw new Error("DB tạm lỗi");
    };
    await assert.rejects(invalidatePermissionCache(1), /DB tạm lỗi/);
    assert.equal(CAN.approve("pm"), false);
  });
  runWithRequestContext({ userId: 1, orgId: 1, role: "pm" }, () => {
    assert.equal(CAN.approve("pm"), false);
  });
});

test("snapshot: hai org cùng vai trò có quyền độc lập, đổi actor/org/role phải nạp lại", async () => {
  const { CAN } = await import("@/lib/bao-mat/auth");
  const { invalidatePermissionCache } = await import("@/lib/bao-mat/permissions");
  read = async (orgId) => [
    {
      role: "viewer",
      permKey: "viewPayments",
      allowed: orgId === 2,
      projectId: null,
      projectOrgId: null,
    },
  ];
  const results = await Promise.all(
    [1, 2].map((orgId) =>
      runWithRequestContext({ userId: orgId, orgId, role: "viewer" }, async () => {
        await invalidatePermissionCache(orgId);
        return CAN.viewPayments("viewer");
      }),
    ),
  );
  assert.deepEqual(results, [false, true]);
  for (const patch of [{ orgId: 1 }, { userId: 9 }, { role: "admin" }]) {
    await runWithRequestContext({ userId: 2, orgId: 2, role: "viewer" }, async () => {
      await invalidatePermissionCache(2);
      assert.equal(CAN.viewPayments("viewer"), true);
      patchRequestContext(patch);
      assert.equal(CAN.viewPayments("viewer"), false);
    });
  }
});

test("snapshot: sai org dự án, nguồn thay đổi giữa lúc nạp và override mở quyền ghi đều không cấp quyền", async () => {
  const { CAN } = await import("@/lib/bao-mat/auth");
  const { invalidatePermissionCache } = await import("@/lib/bao-mat/permissions");
  // Dòng trỏ dự án org khác: bỏ qua (không cấp quyền), nhưng KHÔNG throw — throw làm mọi
  // user của org lỗi 500 ở getCurrentUser (audit PR #544).
  read = async () => [
    { role: "viewer", permKey: "viewPayments", allowed: true, projectId: 10, projectOrgId: 2 },
  ];
  await runWithRequestContext({ userId: 1, orgId: 1, role: "viewer", projectId: 10 }, async () => {
    await invalidatePermissionCache(1);
    assert.equal(CAN.viewPayments("viewer"), false);
  });
  let finish!: (rows: Row[]) => void;
  read = async () =>
    new Promise<Row[]>((resolve) => {
      finish = resolve;
    });
  await runWithRequestContext({ userId: 1, orgId: 1, role: "pm" }, async () => {
    const loading = invalidatePermissionCache(1);
    patchRequestContext({ orgId: 2 });
    finish([]);
    await assert.rejects(loading, /Ngữ cảnh xác thực đã thay đổi/);
    assert.equal(CAN.approve("pm"), false);
  });
  read = async () => [
    { role: "viewer", permKey: "approve", allowed: true, projectId: null, projectOrgId: null },
  ];
  await runWithRequestContext({ userId: 1, orgId: 1, role: "viewer" }, async () => {
    await invalidatePermissionCache(1);
    assert.equal(CAN.approve("viewer"), false);
  });
});
