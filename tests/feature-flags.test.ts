import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cờ tính năng theo dự án feature_flags (M52 PR4). Tích hợp thật với
// TEST_DATABASE_URL, tự skip nếu không có (giống code-lists.test.ts). Kiểm: mặc định
// bật khi bảng rỗng, toggle qua setFlag + cache version invalidate, assertModuleEnabled
// (dùng trực tiếp trong app/api/project-documents/route.ts) trả 404 đúng lúc module tắt.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

test("feature-flags: bảng rỗng → module thường mặc định bật, module thuNghiem mặc định tắt", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const ff = await import("@/lib/ha-tang/feature-flags");
  const { MODULES } = await import("@/lib/nen/modules");

  const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF1', 'PJT-FF1')`);
  try {
    await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
    ff.bumpFeatureFlagsVersion();

    assert.equal(await ff.isModuleEnabled("documents", p), true);
    // W3: dự án mới (chưa có dòng override nào) → module thuNghiem TẮT, module lõi BẬT.
    assert.equal(await ff.isModuleEnabled("engineering-autonomy", p), false);
    const flags = await ff.getModuleFlags(p);
    for (const m of MODULES) assert.equal(flags.get(m.key), !m.thuNghiem, `sai mặc định: ${m.key}`);
  } finally {
    // projects.code là UNIQUE — không dọn thì lần chạy sau đụng khoá trùng (fail giả).
    await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
});

test(
  "feature-flags: setFlag tắt/bật → cache tự vô hiệu, isModuleEnabled đọc đúng ngay",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ff = await import("@/lib/ha-tang/feature-flags");

    const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF2', 'PJT-FF2')`);
    const u = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('FFTest','ff-test@x.vn','admin','x')`,
    );
    try {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      ff.bumpFeatureFlagsVersion();

      assert.equal(await ff.isModuleEnabled("documents", p), true);

      await ff.setFlag("documents", p, false, u, 1);
      assert.equal(await ff.isModuleEnabled("documents", p), false);

      await ff.setFlag("documents", p, true, u, 1);
      assert.equal(await ff.isModuleEnabled("documents", p), true);

      // Module khác không bị ảnh hưởng bởi override của module này.
      assert.equal(await ff.isModuleEnabled("tracking", p), true);
    } finally {
      // projects.code và users.email đều UNIQUE — phải dọn để chạy lại được.
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      await run(`DELETE FROM projects WHERE id = ?`, p);
      await run(`DELETE FROM users WHERE id = ?`, u);
    }
  },
);

test(
  "feature-flags: assertModuleEnabled trả 404 khi tắt, null khi bật/chưa xác định dự án",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ff = await import("@/lib/ha-tang/feature-flags");

    const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF3', 'PJT-FF3')`);
    const u = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('FFTest2','ff-test2@x.vn','admin','x')`,
    );
    try {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      ff.bumpFeatureFlagsVersion();

      // projectId null (chưa xác định được dự án) → không chặn, để route tự xử lý theo logic riêng.
      assert.equal(await ff.assertModuleEnabled("documents", null), null);

      // Module bật (mặc định) → không chặn.
      assert.equal(await ff.assertModuleEnabled("documents", p), null);

      // Tắt module → 404.
      await ff.setFlag("documents", p, false, u, 1);
      const blocked = await ff.assertModuleEnabled("documents", p);
      assert.ok(blocked, "phải trả về response chặn");
      assert.equal(blocked!.status, 404);

      // Bật lại → không chặn nữa.
      await ff.setFlag("documents", p, true, u, 1);
      assert.equal(await ff.assertModuleEnabled("documents", p), null);
    } finally {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      await run(`DELETE FROM projects WHERE id = ?`, p);
      await run(`DELETE FROM users WHERE id = ?`, u);
    }
  },
);

test("feature-flags: findModuleByRoute khớp đúng tiền tố dài nhất", S, async () => {
  const ff = await import("@/lib/ha-tang/feature-flags");
  assert.equal(ff.findModuleByRoute("/api/project-documents/5"), "documents");
  assert.equal(ff.findModuleByRoute("/api/tasks?sheet=ogtd"), "tracking");
  assert.equal(ff.findModuleByRoute("/api/khong-ton-tai"), undefined);
  // W3: route con của module thuNghiem phải khớp đúng module con (prefix dài hơn),
  // KHÔNG rơi về module "engineering" chung — nếu không, override tắt riêng module con
  // sẽ không có tác dụng gì (khớp nhầm sang module cha luôn bật).
  assert.equal(ff.findModuleByRoute("/api/engineering/autonomy/kill-switch"), "engineering-autonomy");
  assert.equal(ff.findModuleByRoute("/api/engineering/suggestions"), "engineering");
});

test(
  "feature-flags (W3): dự án mới → module thuNghiem tắt; Admin setFlag vẫn bật được (override thắng)",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ff = await import("@/lib/ha-tang/feature-flags");

    const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF4', 'PJT-FF4')`);
    const u = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('FFTest3','ff-test3@x.vn','admin','x')`,
    );
    try {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      ff.bumpFeatureFlagsVersion();

      // Dự án mới (chưa có override) → module thuNghiem TẮT, module lõi BẬT.
      assert.equal(await ff.isModuleEnabled("engineering-autonomy", p), false);
      assert.equal(await ff.isModuleEnabled("tracking", p), true);

      // Admin bật thủ công per-project → override thắng mặc định thuNghiem.
      await ff.setFlag("engineering-autonomy", p, true, u, 1);
      assert.equal(await ff.isModuleEnabled("engineering-autonomy", p), true);

      // Tắt lại → về đúng trạng thái override (không rơi về mặc định).
      await ff.setFlag("engineering-autonomy", p, false, u, 1);
      assert.equal(await ff.isModuleEnabled("engineering-autonomy", p), false);
    } finally {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      await run(`DELETE FROM projects WHERE id = ?`, p);
      await run(`DELETE FROM users WHERE id = ?`, u);
    }
  },
);
