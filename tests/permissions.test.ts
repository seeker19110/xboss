import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== M50 PR1 — Override quyền trong DB (role_permissions) + cache + luật LOCKED_PERMS =====
// Route handler gọi next/headers nên không gọi trực tiếp ngoài request scope; test kiểm 2
// lớp: (1) validatePermOverride (hàm thuần) đúng luật 422; (2) tích hợp — ghi/xoá override
// qua setPermissionOverride rồi kiểm CAN.x phản ánh đúng sau invalidate, và audit_log ghi.

// ── Lớp thuần: luật validate (không cần DB) ──────────────────────────────────────
test("validatePermOverride: chặn role/permKey sai + luật mở quyền ghi", async () => {
  const { validatePermOverride, LOCKED_PERMS, PERM_KEYS } = await import("@/lib/auth");

  // Vai trò không hợp lệ.
  assert.equal(typeof validatePermOverride("khong_ton_tai", "approve", false), "string");
  // Mã quyền không tồn tại.
  assert.equal(typeof validatePermOverride("pm", "khong_co_quyen_nay", true), "string");

  // Mở (allowed=true) quyền GHI (approve ∈ LOCKED_PERMS) → lỗi, cho mọi vai trò.
  assert.ok(LOCKED_PERMS.includes("approve"));
  assert.equal(typeof validatePermOverride("viewer", "approve", true), "string");
  assert.equal(typeof validatePermOverride("engineer", "approve", true), "string");
  // Siết (false) quyền ghi → hợp lệ.
  assert.equal(validatePermOverride("pm", "approve", false), null);
  // Xoá override (null) quyền ghi → hợp lệ.
  assert.equal(validatePermOverride("pm", "approve", null), null);
  // Mở quyền XEM (viewPayments không ∈ LOCKED_PERMS) → hợp lệ.
  assert.ok(!LOCKED_PERMS.includes("viewPayments"));
  assert.equal(validatePermOverride("viewer", "viewPayments", true), null);

  // LOCKED_PERMS = mọi quyền không bắt đầu "view" và khác "export".
  for (const k of PERM_KEYS) {
    const write = !k.startsWith("view") && k !== "export";
    assert.equal(LOCKED_PERMS.includes(k), write, `LOCKED_PERMS phân loại sai: ${k}`);
  }

  // Chống tự khoá hệ thống: admin không được SIẾT (false) manageUsers của chính admin.
  assert.equal(typeof validatePermOverride("admin", "manageUsers", false), "string");
  // Nhưng vẫn xoá override (null) được, và siết manageUsers của vai trò KHÁC vẫn ok.
  assert.equal(validatePermOverride("admin", "manageUsers", null), null);
  assert.equal(validatePermOverride("pm", "manageUsers", false), null);
});

// ── Lớp tích hợp: cache + CAN + audit (cần Postgres) ─────────────────────────────
test(
  "override: default → siết pm.approve → xoá về default; mở viewer.viewPayments; audit ghi",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { CAN } = await import("@/lib/auth");
    const { setPermissionOverride, invalidatePermissionCache, _resetPermissionCacheForTests } =
      await import("@/lib/permissions");

    // Sạch bảng để test tất định (bảng cấu hình toàn hệ, không theo dự án).
    await run(`DELETE FROM role_permissions`);
    await invalidatePermissionCache();

    // (1) Không override → CAN.x = default.
    assert.equal(CAN.approve("pm"), true, "mặc định pm được approve");
    assert.equal(CAN.approve("engineer"), false, "mặc định engineer không approve");
    assert.equal(CAN.viewPayments("viewer"), false, "mặc định viewer không xem thanh toán");

    // (2) Siết approve của pm → false thật sau khi ghi (setPermissionOverride tự invalidate).
    await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
      await setPermissionOverride("pm", "approve", false, 1);
    });
    assert.equal(CAN.approve("pm"), false, "sau siết: pm không còn approve");
    assert.equal(CAN.approve("admin"), true, "siết pm không ảnh hưởng admin");

    // (6) Cache đã invalidate NGAY trong cùng process (không cần chờ TTL).
    const { getPermissionOverride } = await import("@/lib/permissions");
    assert.equal(getPermissionOverride("pm", "approve"), false);

    // (4) Mở quyền XEM viewPayments cho viewer → true.
    await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
      await setPermissionOverride("viewer", "viewPayments", true, 1);
    });
    assert.equal(CAN.viewPayments("viewer"), true, "sau mở: viewer xem được thanh toán");

    // Audit: mỗi thay đổi override có dòng audit_log (trigger M43). 2 INSERT ở trên.
    const audit = await query<{ action: string; actorId: number | null }>(
      `SELECT action, actor_id AS "actorId" FROM audit_log
        WHERE entity_type = 'role_permissions' ORDER BY id`,
    );
    assert.ok(audit.length >= 2, "phải có ≥2 dòng audit cho role_permissions");
    assert.ok(
      audit.some((a) => a.actorId === 1),
      "audit ghi được actor từ request-context",
    );

    // (5) Xoá override (allowed=null) → về default.
    await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
      await setPermissionOverride("pm", "approve", null, 1);
    });
    assert.equal(CAN.approve("pm"), true, "sau xoá override: pm approve về mặc định");
    assert.equal(getPermissionOverride("pm", "approve"), undefined);

    // Dọn dẹp + reset cache để không rò rỉ sang file test khác.
    await run(`DELETE FROM role_permissions`);
    await invalidatePermissionCache();
    _resetPermissionCacheForTests();
  },
);

// Cold start: snapshot rỗng chưa nạp → getPermissionOverride trả undefined (an toàn: default),
// KHÔNG throw dù chưa reload lần nào.
test("cache cold start trả undefined, không throw", async () => {
  const { getPermissionOverride, _resetPermissionCacheForTests } =
    await import("@/lib/permissions");
  _resetPermissionCacheForTests();
  assert.equal(getPermissionOverride("pm", "approve"), undefined);
});
