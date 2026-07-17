import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cờ tính năng theo dự án feature_flags (M52 PR4). Tích hợp thật với
// TEST_DATABASE_URL, tự skip nếu không có (giống code-lists.test.ts). Kiểm: mặc định
// bật khi bảng rỗng, toggle qua setFlag + cache version invalidate, assertModuleEnabled
// (dùng trực tiếp trong app/api/project-documents/route.ts) trả 404 đúng lúc module tắt.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

test("feature-flags: bảng rỗng → mọi module coi như bật (mặc định)", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const ff = await import("@/lib/feature-flags");

  const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF1', 'PJT-FF1')`);
  await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
  ff.bumpFeatureFlagsVersion();

  assert.equal(await ff.isModuleEnabled("documents", p), true);
  const flags = await ff.getModuleFlags(p);
  for (const enabled of flags.values()) assert.equal(enabled, true);
});

test(
  "feature-flags: setFlag tắt/bật → cache tự vô hiệu, isModuleEnabled đọc đúng ngay",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ff = await import("@/lib/feature-flags");

    const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF2', 'PJT-FF2')`);
    const u = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('FFTest','ff-test@x.vn','admin','x')`,
    );
    await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
    ff.bumpFeatureFlagsVersion();

    assert.equal(await ff.isModuleEnabled("documents", p), true);

    await ff.setFlag("documents", p, false, u);
    assert.equal(await ff.isModuleEnabled("documents", p), false);

    await ff.setFlag("documents", p, true, u);
    assert.equal(await ff.isModuleEnabled("documents", p), true);

    // Module khác không bị ảnh hưởng bởi override của module này.
    assert.equal(await ff.isModuleEnabled("tracking", p), true);
  },
);

test(
  "feature-flags: assertModuleEnabled trả 404 khi tắt, null khi bật/chưa xác định dự án",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ff = await import("@/lib/feature-flags");

    const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF3', 'PJT-FF3')`);
    const u = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('FFTest2','ff-test2@x.vn','admin','x')`,
    );
    await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
    ff.bumpFeatureFlagsVersion();

    // projectId null (chưa xác định được dự án) → không chặn, để route tự xử lý theo logic riêng.
    assert.equal(await ff.assertModuleEnabled("documents", null), null);

    // Module bật (mặc định) → không chặn.
    assert.equal(await ff.assertModuleEnabled("documents", p), null);

    // Tắt module → 404.
    await ff.setFlag("documents", p, false, u);
    const blocked = await ff.assertModuleEnabled("documents", p);
    assert.ok(blocked, "phải trả về response chặn");
    assert.equal(blocked!.status, 404);

    // Bật lại → không chặn nữa.
    await ff.setFlag("documents", p, true, u);
    assert.equal(await ff.assertModuleEnabled("documents", p), null);
  },
);

test("feature-flags: findModuleByRoute khớp đúng tiền tố dài nhất", S, async () => {
  const ff = await import("@/lib/feature-flags");
  assert.equal(ff.findModuleByRoute("/api/project-documents/5"), "documents");
  assert.equal(ff.findModuleByRoute("/api/tasks?sheet=ogtd"), "tracking");
  assert.equal(ff.findModuleByRoute("/api/khong-ton-tai"), undefined);
});
