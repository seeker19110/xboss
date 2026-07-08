import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("resolveProjectId: cookie hợp lệ → dùng; cookie lạ/rỗng → mặc định dự án đầu; rỗng → null", async () => {
  const { resolveProjectId } = await import("@/lib/projects");

  assert.equal(resolveProjectId([1, 2, 3], "2"), 2);
  assert.equal(
    resolveProjectId([1, 2, 3], "99"),
    1,
    "id không nằm trong dự án thấy được → mặc định",
  );
  assert.equal(resolveProjectId([1, 2, 3], "abc"), 1, "cookie không phải số → mặc định");
  assert.equal(resolveProjectId([1, 2, 3], undefined), 1, "không có cookie → dự án đầu");
  assert.equal(resolveProjectId([], "1"), null, "không có dự án nào → null");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "visibleProjectIds: admin thấy mọi dự án; user theo user_projects; bảng rỗng = mọi user thấy hết",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { visibleProjectIds } = await import("@/lib/projects");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA test 1', 'PJT-T1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA test 2', 'PJT-T2')`);
    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin ProjTest', 'proj-admin@xboss.vn', 'x', 'admin')`,
    );
    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM ProjTest', 'proj-pm@xboss.vn', 'x', 'pm')`,
    );

    // Bảng user_projects rỗng toàn hệ thống → mọi user (kể cả không phải admin) thấy hết.
    const pmSeesAllInitially = await visibleProjectIds({ id: pmId, role: "pm" });
    assert.ok(pmSeesAllInitially.includes(p1) && pmSeesAllInitially.includes(p2));

    // Admin luôn thấy mọi dự án, bất kể user_projects.
    const adminIds = await visibleProjectIds({ id: adminId, role: "admin" });
    assert.ok(adminIds.includes(p1) && adminIds.includes(p2));

    // Có bản ghi user_projects (cho user khác) → PM này giờ chỉ thấy đúng dự án được gán.
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmId, p1);
    const pmIds = await visibleProjectIds({ id: pmId, role: "pm" });
    assert.deepEqual(pmIds, [p1]);

    await run(`DELETE FROM user_projects WHERE user_id = ?`, pmId);
    await run(`DELETE FROM users WHERE id IN (?, ?)`, adminId, pmId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
