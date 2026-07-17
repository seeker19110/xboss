import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test trường tuỳ biến custom_field_defs (M52 PR2). Tích hợp thật với TEST_DATABASE_URL, tự
// skip nếu không có (giống recompute.test.ts). Kiểm: validateCustom (đúng type/options/required,
// chặn key lạ), merge shallow custom khi PATCH (không đè field khác), keyInUse (đầu vào guard
// 409 khi đổi type lúc đã có dữ liệu).

test(
  "custom-fields: validateCustom đúng type/options/required + chặn key lạ",
  { skip: !HAS_TEST_DB },
  async () => {
    const cf = await import("@/lib/custom-fields");
    const { run } = await import("@/lib/db");

    // Dọn + tạo 4 def áp mọi dự án cho entity 'task'.
    await run(`DELETE FROM custom_field_defs WHERE entity_type = 'task' AND project_id IS NULL`);
    await run(
      `INSERT INTO custom_field_defs (project_id, entity_type, key, label, type, options, required, sort, active)
     VALUES (NULL, 'task', 'so_luong', 'Số lượng', 'number', NULL, TRUE, 0, TRUE),
            (NULL, 'task', 'ngay_kt', 'Ngày KT', 'date', NULL, FALSE, 1, TRUE),
            (NULL, 'task', 'muc_do', 'Mức độ', 'select', ?::jsonb, FALSE, 2, TRUE),
            (NULL, 'task', 'da_kiem', 'Đã kiểm', 'checkbox', NULL, FALSE, 3, TRUE)`,
      JSON.stringify(["cao", "thap"]),
    );

    // Số hợp lệ (ép từ chuỗi) + checkbox + select + date.
    const okRes = await cf.validateCustom("task", null, {
      so_luong: "12",
      ngay_kt: "2026-07-20",
      muc_do: "cao",
      da_kiem: true,
    });
    assert.ok(okRes.ok, "phải hợp lệ");
    if (okRes.ok) {
      assert.equal(okRes.value.so_luong, 12); // ép về number
      assert.equal(okRes.value.ngay_kt, "2026-07-20");
      assert.equal(okRes.value.muc_do, "cao");
      assert.equal(okRes.value.da_kiem, true);
    }

    // Số sai định dạng → 422.
    const badNum = await cf.validateCustom("task", null, { so_luong: "abc" });
    assert.equal(badNum.ok, false);
    if (!badNum.ok) assert.equal(badNum.status, 422);

    // Ngày sai định dạng → 422.
    const badDate = await cf.validateCustom("task", null, { ngay_kt: "20/07/2026" });
    assert.equal(badDate.ok, false);

    // Select ngoài danh sách → 422.
    const badSelect = await cf.validateCustom("task", null, { muc_do: "trung_binh" });
    assert.equal(badSelect.ok, false);

    // Key không có def → 422 (chặn rác).
    const unknown = await cf.validateCustom("task", null, { key_la: "x" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.status, 422);

    // Required nhưng set về rỗng → 422.
    const missReq = await cf.validateCustom("task", null, { so_luong: "" });
    assert.equal(missReq.ok, false);

    // patch không phải object → 422.
    const notObj = await cf.validateCustom("task", null, "x");
    assert.equal(notObj.ok, false);
  },
);

test(
  "custom-fields: PATCH merge shallow không đè field khác + keyInUse",
  { skip: !HAS_TEST_DB },
  async () => {
    const cf = await import("@/lib/custom-fields");
    const { insertId, run, queryOne } = await import("@/lib/db");

    // Dựng chuỗi WBS tối thiểu để có 1 task thật.
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test custom-fields')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp CF')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'CFT', 'Sheet CF')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'F1', 'Nhóm CF')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, custom) VALUES (?, 'F1,01', 'Task CF', ?::jsonb)`,
      pkgId,
      JSON.stringify({ giu_nguyen: "abc", so_luong: 1 }),
    );

    // Def cho task để validate merge patch.
    await run(
      `DELETE FROM custom_field_defs WHERE entity_type = 'task' AND project_id = ?`,
      projectId,
    );
    await run(
      `INSERT INTO custom_field_defs (project_id, entity_type, key, label, type, required, sort, active)
     VALUES (?, 'task', 'so_luong', 'Số lượng', 'number', FALSE, 0, TRUE),
            (?, 'task', 'giu_nguyen', 'Giữ nguyên', 'text', FALSE, 1, TRUE)`,
      projectId,
      projectId,
    );

    // Chỉ set so_luong → merge shallow qua `custom || patch` (đúng cách route PATCH làm).
    const v = await cf.validateCustom("task", projectId, { so_luong: 99 });
    assert.ok(v.ok);
    if (v.ok) {
      await run(
        `UPDATE tasks SET custom = custom || ?::jsonb WHERE id = ?`,
        JSON.stringify(v.value),
        taskId,
      );
    }

    const row = await queryOne<{ custom: Record<string, unknown> }>(
      `SELECT custom FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(row?.custom.so_luong, 99, "field vừa set phải đổi");
    assert.equal(row?.custom.giu_nguyen, "abc", "field khác phải giữ nguyên");

    // keyInUse: task đang lưu key 'so_luong' → true (đầu vào guard 409 chặn đổi type).
    assert.equal(await cf.keyInUse("task", "so_luong"), true);
    // Key chưa ai dùng → false (đổi type được).
    assert.equal(await cf.keyInUse("task", "chua_dung"), false);
  },
);
