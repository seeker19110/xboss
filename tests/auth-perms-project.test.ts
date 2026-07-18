import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M61 PR1 — Override quyền THEO DỰ ÁN (role_permissions.project_id). Tích hợp thật với
// TEST_DATABASE_URL, tự skip nếu không có. Kiểm: thứ tự 3 tầng (dự án > toàn hệ > mặc
// định), hasProjectOverrides, giải quyền qua CAN + request-context (siết ở dự án A không
// ảnh hưởng B / không-context), upsert theo sentinel COALESCE(project_id,0), CASCADE khi
// xoá dự án, invalidatePermissionCache nạp dòng theo dự án ngay.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

// Helper: chạy write override trong ngữ cảnh admin (để trigger audit M43 ghi actor).
async function asAdmin(fn: () => Promise<void>): Promise<void> {
  const { runWithRequestContext } = await import("@/lib/request-context");
  await runWithRequestContext({ userId: 1, role: "admin" }, fn);
}

test(
  "perm-project: getPermissionOverride đúng thứ tự 3 tầng (dự án > toàn hệ > undefined)",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { setPermissionOverride, getPermissionOverride, invalidatePermissionCache } =
      await import("@/lib/permissions");

    await run(`DELETE FROM role_permissions`);
    const a = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Perm A', 'PJT-PMA')`);
    const b = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Perm B', 'PJT-PMB')`);

    await asAdmin(async () => {
      // engineer/editProgress: chỉ có override THEO DỰ ÁN A (không có toàn hệ).
      await setPermissionOverride("engineer", "editProgress", false, 1, a);
      // viewer/viewPayments: có toàn hệ (true) + dự án A (false).
      await setPermissionOverride("viewer", "viewPayments", true, 1, null);
      await setPermissionOverride("viewer", "viewPayments", false, 1, a);
    });
    await invalidatePermissionCache();

    // Tầng 1 (dự án) ưu tiên: A trả override dự án; B không có → về toàn hệ/undefined.
    assert.equal(
      getPermissionOverride("engineer", "editProgress", a),
      false,
      "dự án A: override dự án",
    );
    assert.equal(
      getPermissionOverride("engineer", "editProgress", b),
      undefined,
      "dự án B: không có → undefined",
    );
    assert.equal(
      getPermissionOverride("engineer", "editProgress"),
      undefined,
      "không context: undefined",
    );

    assert.equal(
      getPermissionOverride("viewer", "viewPayments", a),
      false,
      "dự án A: override dự án thắng toàn hệ",
    );
    assert.equal(
      getPermissionOverride("viewer", "viewPayments", b),
      true,
      "dự án B: rơi về toàn hệ",
    );
    assert.equal(getPermissionOverride("viewer", "viewPayments"), true, "không context: toàn hệ");

    await run(`DELETE FROM role_permissions`);
    await invalidatePermissionCache();
  },
);

test(
  "perm-project: hasProjectOverrides false khi chỉ có override toàn hệ, true khi có dòng dự án",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { setPermissionOverride, hasProjectOverrides, invalidatePermissionCache } =
      await import("@/lib/permissions");

    await run(`DELETE FROM role_permissions`);
    const a = await insertId(`INSERT INTO projects (name, code) VALUES ('DA HPO', 'PJT-HPO')`);

    // Chỉ override toàn hệ → hasProjectOverrides false.
    await asAdmin(async () => {
      await setPermissionOverride("pm", "approve", false, 1, null);
    });
    await invalidatePermissionCache();
    assert.equal(hasProjectOverrides(), false, "chỉ toàn hệ → false");

    // Thêm 1 override theo dự án → true.
    await asAdmin(async () => {
      await setPermissionOverride("engineer", "editProgress", false, 1, a);
    });
    await invalidatePermissionCache();
    assert.equal(hasProjectOverrides(), true, "có dòng theo dự án → true");

    await run(`DELETE FROM role_permissions`);
    await invalidatePermissionCache();
    assert.equal(hasProjectOverrides(), false, "sạch bảng → false");
  },
);

test(
  "perm-project: CAN qua request-context — siết ở dự án A không ảnh hưởng B/không-context",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { CAN } = await import("@/lib/auth");
    const { setPermissionOverride, invalidatePermissionCache } = await import("@/lib/permissions");

    await run(`DELETE FROM role_permissions`);
    const a = await insertId(`INSERT INTO projects (name, code) VALUES ('DA CAN A', 'PJT-CANA')`);
    const b = await insertId(`INSERT INTO projects (name, code) VALUES ('DA CAN B', 'PJT-CANB')`);

    // Siết editProgress của engineer CHỈ ở dự án A.
    await asAdmin(async () => {
      await setPermissionOverride("engineer", "editProgress", false, 1, a);
    });
    await invalidatePermissionCache();

    assert.equal(
      runWithRequestContext({ projectId: a }, () => CAN.editProgress("engineer")),
      false,
      "dự án A: engineer bị chặn editProgress",
    );
    assert.equal(
      runWithRequestContext({ projectId: b }, () => CAN.editProgress("engineer")),
      true,
      "dự án B: engineer vẫn editProgress (mặc định)",
    );
    assert.equal(
      CAN.editProgress("engineer"),
      true,
      "không context: mặc định (không né được vì cần context)",
    );

    // Mở viewPayments cho viewer TOÀN HỆ + siết ở A → A=false, B=true, không-context=true.
    await asAdmin(async () => {
      await setPermissionOverride("viewer", "viewPayments", true, 1, null);
      await setPermissionOverride("viewer", "viewPayments", false, 1, a);
    });
    await invalidatePermissionCache();

    assert.equal(
      runWithRequestContext({ projectId: a }, () => CAN.viewPayments("viewer")),
      false,
      "A: siết",
    );
    assert.equal(
      runWithRequestContext({ projectId: b }, () => CAN.viewPayments("viewer")),
      true,
      "B: kế thừa toàn hệ",
    );
    assert.equal(CAN.viewPayments("viewer"), true, "không context: toàn hệ");

    await run(`DELETE FROM role_permissions`);
    await invalidatePermissionCache();
  },
);

test(
  "perm-project: upsert 2 lần cùng (role, perm, NULL) không sinh 2 dòng (sentinel 0)",
  S,
  async () => {
    const { run, query } = await import("@/lib/db");
    const { setPermissionOverride, invalidatePermissionCache } = await import("@/lib/permissions");

    await run(`DELETE FROM role_permissions`);
    await asAdmin(async () => {
      await setPermissionOverride("pm", "approve", false, 1, null);
      await setPermissionOverride("pm", "approve", false, 1, null); // lần 2 phải UPDATE, không INSERT
    });
    const rows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM role_permissions WHERE role = 'pm' AND perm_key = 'approve' AND project_id IS NULL`,
    );
    assert.equal(Number(rows[0].n), 1, "chỉ 1 dòng cho (pm, approve, NULL)");

    await run(`DELETE FROM role_permissions`);
    await invalidatePermissionCache();
  },
);

test("perm-project: xoá dự án → override theo dự án tự mất (CASCADE)", S, async () => {
  const { insertId, run, query } = await import("@/lib/db");
  const { setPermissionOverride, invalidatePermissionCache } = await import("@/lib/permissions");

  await run(`DELETE FROM role_permissions`);
  const a = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Cascade', 'PJT-CAS')`);

  await asAdmin(async () => {
    await setPermissionOverride("engineer", "editProgress", false, 1, a);
    await setPermissionOverride("pm", "approve", false, 1, null); // toàn hệ, KHÔNG bị xoá theo
  });

  let cnt = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM role_permissions WHERE project_id = ?`,
    a,
  );
  assert.equal(Number(cnt[0].n), 1, "trước khi xoá: 1 override dự án");

  await run(`DELETE FROM projects WHERE id = ?`, a);

  cnt = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM role_permissions WHERE project_id = ?`,
    a,
  );
  assert.equal(Number(cnt[0].n), 0, "sau khi xoá dự án: override dự án bị CASCADE");
  const globalCnt = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM role_permissions WHERE project_id IS NULL`,
  );
  assert.equal(Number(globalCnt[0].n), 1, "override toàn hệ KHÔNG bị ảnh hưởng");

  await run(`DELETE FROM role_permissions`);
  await invalidatePermissionCache();
});

test("perm-project: invalidatePermissionCache nạp dòng theo dự án ngay", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { getPermissionOverride, invalidatePermissionCache, _resetPermissionCacheForTests } =
    await import("@/lib/permissions");

  await run(`DELETE FROM role_permissions`);
  const a = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Invalidate', 'PJT-INV')`);

  // Ghi thẳng DB (không qua setPermissionOverride) rồi invalidate → cache thấy ngay.
  await run(
    `INSERT INTO role_permissions (role, perm_key, allowed, project_id) VALUES ('engineer', 'editProgress', false, ?)`,
    a,
  );
  await invalidatePermissionCache();
  assert.equal(
    getPermissionOverride("engineer", "editProgress", a),
    false,
    "nạp dòng dự án ngay sau invalidate",
  );

  await run(`DELETE FROM role_permissions`);
  await invalidatePermissionCache();
  _resetPermissionCacheForTests();
});
