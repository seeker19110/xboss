import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cờ tính năng theo dự án feature_flags (M52 PR4). Tích hợp thật với
// TEST_DATABASE_URL, tự skip nếu không có (giống code-lists.test.ts). Kiểm: mặc định
// bật khi bảng rỗng, toggle qua setFlag + cache version invalidate, assertModuleEnabled
// (dùng trực tiếp trong app/api/project-documents/route.ts) trả 404 đúng lúc module tắt.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { ModuleDef } from "@/lib/nen/modules";

const S = { skip: !HAS_TEST_DB };

// 2026-09-22: 6 module `thuNghiem: true` (autonomy/predictions/graph/subcon-ai/nextgen-apex/
// combine) đã bị xoá hẳn khỏi sản phẩm (audit xác nhận không ai bật) — xem PROGRESS.md. Không
// còn module thật nào mang cờ `thuNghiem` để test cơ chế, nên mock hẳn `@/lib/nen/modules` với
// 1 module giả `module-thu-nghiem-gia` — test này kiểm CƠ CHẾ chung (`isModuleEnabled`/
// `assertModuleEnabled`/`findModuleByRoute` đọc đúng cờ `thuNghiem`), không phụ thuộc module
// thật nào đang tồn tại. mock.module chỉ đặt ĐƯỢC MỘT LẦN cho mỗi định danh trong 1 tiến trình
// test (pattern tests/google-sheets.test.ts) nên mock đúng 1 lần ở đây, trước mọi import
// @/lib/ha-tang/feature-flags (module đó `import { MODULES }` tĩnh nên phải thấy bản mock).
const MODULES_GIA: ModuleDef[] = [
  { key: "documents", nav: [], permKeys: [], routePrefix: ["/api/project-documents"] },
  { key: "tracking", nav: [], permKeys: [], routePrefix: ["/api/tasks"] },
  { key: "engineering", nav: [], permKeys: [], routePrefix: ["/api/engineering"] },
  {
    key: "module-thu-nghiem-gia",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/thu-nghiem-gia"],
    thuNghiem: true,
  },
];
mock.module("@/lib/nen/modules", { namedExports: { MODULES: MODULES_GIA } });

test(
  "feature-flags: bảng rỗng → module thường mặc định bật, module thuNghiem mặc định tắt",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ff = await import("@/lib/ha-tang/feature-flags");

    const p = await insertId(`INSERT INTO projects (name, code) VALUES ('DA FF1', 'PJT-FF1')`);
    try {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      ff.bumpFeatureFlagsVersion();

      assert.equal(await ff.isModuleEnabled("documents", p), true);
      // Dự án mới (chưa có dòng override nào) → module thuNghiem TẮT, module lõi BẬT.
      assert.equal(await ff.isModuleEnabled("module-thu-nghiem-gia", p), false);
      const flags = await ff.getModuleFlags(p);
      for (const m of MODULES_GIA)
        assert.equal(flags.get(m.key), !m.thuNghiem, `sai mặc định: ${m.key}`);
    } finally {
      // projects.code là UNIQUE — không dọn thì lần chạy sau đụng khoá trùng (fail giả).
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      await run(`DELETE FROM projects WHERE id = ?`, p);
    }
  },
);

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
  // Route con của module thuNghiem phải khớp đúng module con (prefix dài hơn), KHÔNG rơi về
  // module cha "engineering" — nếu không, override tắt riêng module con sẽ không có tác dụng
  // gì (khớp nhầm sang module cha luôn bật).
  assert.equal(ff.findModuleByRoute("/api/engineering/thu-nghiem-gia/x"), "module-thu-nghiem-gia");
  assert.equal(ff.findModuleByRoute("/api/engineering/objects"), "engineering");
});

test(
  "feature-flags: dự án mới → module thuNghiem tắt; Admin setFlag vẫn bật được (override thắng)",
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
      assert.equal(await ff.isModuleEnabled("module-thu-nghiem-gia", p), false);
      assert.equal(await ff.isModuleEnabled("tracking", p), true);

      // Admin bật thủ công per-project → override thắng mặc định thuNghiem.
      await ff.setFlag("module-thu-nghiem-gia", p, true, u, 1);
      assert.equal(await ff.isModuleEnabled("module-thu-nghiem-gia", p), true);

      // Tắt lại → về đúng trạng thái override (không rơi về mặc định).
      await ff.setFlag("module-thu-nghiem-gia", p, false, u, 1);
      assert.equal(await ff.isModuleEnabled("module-thu-nghiem-gia", p), false);

      // assertModuleEnabled — 2 dòng mà mọi route con của module thuNghiem gọi trước khi chạm
      // dữ liệu — phải trả 404 khi tắt (mặc định, dự án mới), null (không chặn) khi Admin bật
      // thủ công.
      const blockedDefault = await ff.assertModuleEnabled("module-thu-nghiem-gia", p);
      assert.ok(blockedDefault, "module thuNghiem mặc định phải bị chặn");
      assert.equal(blockedDefault!.status, 404);

      await ff.setFlag("module-thu-nghiem-gia", p, true, u, 1);
      assert.equal(await ff.assertModuleEnabled("module-thu-nghiem-gia", p), null);
    } finally {
      await run(`DELETE FROM feature_flags WHERE project_id = ?`, p);
      await run(`DELETE FROM projects WHERE id = ?`, p);
      await run(`DELETE FROM users WHERE id = ?`, u);
    }
  },
);
