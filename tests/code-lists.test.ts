import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test danh mục mềm code_lists (M52 PR1). Tích hợp thật với TEST_DATABASE_URL, tự skip nếu
// không có (giống recompute.test.ts). Kiểm: CRUD, cache version invalidate khi ghi, và số
// bản ghi tham chiếu (đầu vào của guard 409 ở route DELETE /api/admin/code-lists).

test("code_lists: seed migration đúng 6 nguyên nhân trễ", { skip: !HAS_TEST_DB }, async () => {
  const { getList } = await import("@/lib/code-lists");
  const items = await getList("delay_reason", { includeInactive: true });
  assert.equal(items.length, 6);
  const codes = items.map((i) => i.code).sort();
  assert.deepEqual(codes, [
    "cho_mat_bang",
    "doi_thiet_ke",
    "khac",
    "thieu_nhan_luc",
    "thieu_vat_tu",
    "thoi_tiet",
  ]);
});

test("code_lists: CRUD + cache version invalidate khi ghi", { skip: !HAS_TEST_DB }, async () => {
  const cl = await import("@/lib/code-lists");
  const domain = "test_cache";

  // Đọc lần đầu (rỗng) → nạp cache.
  const before = await cl.getList(domain, { includeInactive: true });
  assert.equal(before.length, 0);
  const v0 = cl.codeListVersion();

  // Tạo mục → version bump → lần đọc sau thấy ngay (cache đã bị vô hiệu).
  const created = await cl.createItem({ domain, code: "aaa", label: "Nhãn A", sort: 0 });
  assert.ok(typeof created !== "string", "tạo phải thành công");
  assert.ok(cl.codeListVersion() > v0, "ghi phải tăng version");
  const afterCreate = await cl.getList(domain, { includeInactive: true });
  assert.equal(afterCreate.length, 1);
  assert.equal(afterCreate[0].label, "Nhãn A");
  const id = (created as { id: number }).id;

  // Trùng (domain, code) → trả chuỗi lỗi (nguồn của 409).
  const dup = await cl.createItem({ domain, code: "aaa", label: "Trùng", sort: 1 });
  assert.equal(typeof dup, "string");

  // Sửa nhãn + tắt active → getList mặc định (chỉ active) không còn thấy.
  await cl.updateItem(id, { label: "Nhãn A2", active: false });
  const activeOnly = await cl.getList(domain);
  assert.equal(activeOnly.length, 0);
  const all = await cl.getList(domain, { includeInactive: true });
  assert.equal(all[0].label, "Nhãn A2");
  assert.equal(all[0].active, false);

  // Xoá → biến mất.
  await cl.deleteItem(id);
  const gone = await cl.getList(domain, { includeInactive: true });
  assert.equal(gone.length, 0);
});

test(
  "code_lists: countReferences chặn xoá khi còn task tham chiếu",
  { skip: !HAS_TEST_DB },
  async () => {
    const cl = await import("@/lib/code-lists");
    const { insertId, run } = await import("@/lib/db");

    // Thêm 1 mã nguyên nhân trễ mới, chưa ai dùng → xoá được (0 tham chiếu).
    const r = await cl.createItem({
      domain: "delay_reason",
      code: "test_ref_reason",
      label: "Lý do test",
      sort: 99,
    });
    assert.ok(typeof r !== "string");
    const refId = (r as { id: number }).id;
    assert.equal(await cl.countReferences("delay_reason", "test_ref_reason"), 0);

    // Dựng chuỗi WBS tối thiểu rồi gán delay_reason cho 1 task.
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test code_lists')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp CL')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'CLT', 'Sheet CL')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'C1', 'Nhóm CL')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, delay_reason) VALUES (?, 'C1,01', 'Task CL', 'test_ref_reason')`,
      pkgId,
    );

    // Còn 1 task tham chiếu → guard route sẽ trả 409.
    assert.equal(await cl.countReferences("delay_reason", "test_ref_reason"), 1);

    // Gỡ tham chiếu → xoá được lại.
    await run(`UPDATE tasks SET delay_reason = NULL WHERE id = ?`, taskId);
    assert.equal(await cl.countReferences("delay_reason", "test_ref_reason"), 0);
    assert.equal(await cl.deleteItem(refId), true);
  },
);
