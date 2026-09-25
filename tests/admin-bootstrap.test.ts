import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: không chạm DB production
import { test } from "node:test";
import assert from "node:assert/strict";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import {
  BOOTSTRAP_ADMIN_EMAIL,
  bootstrapAdmin,
  requireAdminPassword,
  resetBootstrapAdminPassword,
} from "@/lib/bao-mat/admin-bootstrap";
import { verifyPassword } from "@/lib/bao-mat/auth";

const PASSWORD = "test-only-bootstrap-password";

test("bootstrap: mật khẩu bắt buộc, đủ dài; không có fallback demo", () => {
  for (const invalid of [undefined, null, "", "admin123", " ".repeat(16), "x".repeat(1025)]) {
    assert.throws(() => requireAdminPassword(invalid), /XBOSS_ADMIN_PASSWORD/);
  }
  assert.equal(requireAdminPassword(PASSWORD), PASSWORD);
});

test(
  "bootstrap/reset: một admin, idempotent, không nâng quyền và thu hồi phiên",
  { skip: !HAS_TEST_DB },
  async () => {
    // Chỉ ở TEST_DATABASE_URL. Toàn bộ truncate/seed được rollback, kể cả khi assertion lỗi.
    const rollback = new Error("rollback test fixture");
    await assert.rejects(
      withTransaction(async () => {
        await run("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
        assert.equal(await bootstrapAdmin(PASSWORD), "created");
        const before = await query<{ email: string; role: string; password_hash: string }>(
          "SELECT email, role, password_hash FROM users",
        );
        assert.equal(before.length, 1);
        assert.equal(before[0].email, BOOTSTRAP_ADMIN_EMAIL);
        assert.equal(before[0].role, "admin");
        assert.equal(verifyPassword(PASSWORD, before[0].password_hash), true);

        assert.equal(await bootstrapAdmin("another-test-only-password"), "already-initialized");
        const unchanged = await queryOne<{ password_hash: string; session_version: number }>(
          "SELECT password_hash, session_version FROM users WHERE email = ?",
          BOOTSTRAP_ADMIN_EMAIL,
        );
        assert.equal(unchanged?.password_hash, before[0].password_hash);
        await resetBootstrapAdminPassword("reset-test-only-password");
        const reset = await queryOne<{ password_hash: string; session_version: number }>(
          "SELECT password_hash, session_version FROM users WHERE email = ?",
          BOOTSTRAP_ADMIN_EMAIL,
        );
        assert.ok(reset);
        assert.equal(verifyPassword("reset-test-only-password", reset.password_hash), true);
        assert.equal(reset.session_version, Number(unchanged?.session_version) + 1);

        // Một tài khoản trùng email nhưng không còn là admin không được tự nâng quyền.
        await run("UPDATE users SET role = 'engineer' WHERE email = ?", BOOTSTRAP_ADMIN_EMAIL);
        await assert.rejects(resetBootstrapAdminPassword(PASSWORD), /Không có admin/);
        assert.equal(await bootstrapAdmin(PASSWORD), "already-initialized");
        const final = await queryOne<{ role: string }>(
          "SELECT role FROM users WHERE email = ?",
          BOOTSTRAP_ADMIN_EMAIL,
        );
        assert.equal(final?.role, "engineer");
        throw rollback;
      }),
      (error: unknown) => error === rollback,
    );
  },
);
