import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp watermark sheet_versions (M53 PR2). Cần Postgres riêng (TEST_DATABASE_URL);
// không có thì tự skip. Kiểm bất biến: mọi thay đổi task hoặc di chuyển nhóm giữa sheet đều
// bump ĐÚNG version của (các) sheet liên quan — sheetVersion() trả về giá trị KHÁC trước đó.

// Dựng 1 bộ project→tower→sheet→package→task tối thiểu. Trả về các id + slug để thao tác.
async function seedSheet(suffix: string) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SV ${suffix}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${suffix}`,
  );
  const slug = `sv-${suffix}`;
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
    towerId,
    `SV${suffix}`,
    `Sheet ${suffix}`,
    slug,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, 'Nhóm')`,
    stId,
    `P${suffix}`,
  );
  return { projectId, towerId, stId, slug, pkgId };
}

async function cleanup(ids: { projectId: number }) {
  const { run } = await import("@/lib/db");
  // Xoá theo thứ tự phụ thuộc; sheet_versions tự dọn qua ON DELETE CASCADE khi xoá sheet_types.
  await run(
    `DELETE FROM task_history WHERE task_id IN
       (SELECT t.id FROM tasks t JOIN work_packages wp ON t.package_id = wp.id
          JOIN sheet_types st ON wp.sheet_type_id = st.id
          JOIN towers tw ON st.tower_id = tw.id WHERE tw.project_id = ?)`,
    ids.projectId,
  );
  await run(
    `DELETE FROM progress_dimensions WHERE task_id IN
       (SELECT t.id FROM tasks t JOIN work_packages wp ON t.package_id = wp.id
          JOIN sheet_types st ON wp.sheet_type_id = st.id
          JOIN towers tw ON st.tower_id = tw.id WHERE tw.project_id = ?)`,
    ids.projectId,
  );
  await run(
    `DELETE FROM tasks WHERE package_id IN
       (SELECT wp.id FROM work_packages wp JOIN sheet_types st ON wp.sheet_type_id = st.id
          JOIN towers tw ON st.tower_id = tw.id WHERE tw.project_id = ?)`,
    ids.projectId,
  );
  await run(
    `DELETE FROM work_packages WHERE sheet_type_id IN
       (SELECT st.id FROM sheet_types st JOIN towers tw ON st.tower_id = tw.id WHERE tw.project_id = ?)`,
    ids.projectId,
  );
  await run(
    `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
    ids.projectId,
  );
  await run(`DELETE FROM towers WHERE project_id = ?`, ids.projectId);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

test(
  "sheetVersion: tick dimension qua recomputeTask → version bump",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { sheetVersion } = await import("@/lib/version");
    const { recomputeTask } = await import("@/lib/recompute");

    const s = await seedSheet("tick");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'T,01', 'Task tick')`,
      s.pkgId,
    );
    await run(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, 'CH 01', 0)`,
      taskId,
    );

    const before = await sheetVersion(s.slug);
    // Tick ô → installed = 1 → recomputeTask cập nhật tiến độ task (UPDATE tasks → trigger bump).
    await run(`UPDATE progress_dimensions SET installed = 1 WHERE task_id = ?`, taskId);
    await recomputeTask(taskId, "tester");
    const after = await sheetVersion(s.slug);

    assert.notEqual(after, before, "tick dimension phải làm version đổi");
    await cleanup(s);
  },
);

test("sheetVersion: tạo task rồi xoá task đều bump", { skip: !HAS_TEST_DB }, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { sheetVersion } = await import("@/lib/version");

  const s = await seedSheet("crud");
  const v0 = await sheetVersion(s.slug);

  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, 'C,01', 'Task crud')`,
    s.pkgId,
  );
  const v1 = await sheetVersion(s.slug);
  assert.notEqual(v1, v0, "tạo task phải bump");

  await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  const v2 = await sheetVersion(s.slug);
  assert.notEqual(v2, v1, "xoá task phải bump");

  await cleanup(s);
});

test(
  "sheetVersion: move task sang package thuộc sheet khác → CẢ 2 sheet bump",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { sheetVersion } = await import("@/lib/version");

    const a = await seedSheet("mvtsk-a");
    // Sheet B nằm cùng project A để cleanup 1 lần gom hết.
    const bStId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'SVB', 'Sheet B', 'sv-mvtsk-b')`,
      a.towerId,
    );
    const bPkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'PB', 'Nhóm B')`,
      bStId,
    );
    const bSlug = "sv-mvtsk-b";

    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'M,01', 'Task move')`,
      a.pkgId,
    );

    const aBefore = await sheetVersion(a.slug);
    const bBefore = await sheetVersion(bSlug);

    // Move task từ package sheet A sang package sheet B (đổi package_id → sheet cũ + mới bump).
    await run(`UPDATE tasks SET package_id = ? WHERE id = ?`, bPkgId, taskId);

    const aAfter = await sheetVersion(a.slug);
    const bAfter = await sheetVersion(bSlug);
    assert.notEqual(aAfter, aBefore, "sheet nguồn (A) phải bump khi task rời đi");
    assert.notEqual(bAfter, bBefore, "sheet đích (B) phải bump khi task chuyển đến");

    await cleanup(a);
  },
);

test(
  "sheetVersion: move work_package sang sheet khác → cả 2 sheet bump",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { sheetVersion } = await import("@/lib/version");

    const a = await seedSheet("mvwp-a");
    const bStId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'SVWB', 'Sheet WB', 'sv-mvwp-b')`,
      a.towerId,
    );
    const bSlug = "sv-mvwp-b";

    const aBefore = await sheetVersion(a.slug);
    const bBefore = await sheetVersion(bSlug);

    // Chuyển nhóm từ sheet A sang sheet B (route workpackages/:id/move đổi sheet_type_id).
    await run(`UPDATE work_packages SET sheet_type_id = ? WHERE id = ?`, bStId, a.pkgId);

    const aAfter = await sheetVersion(a.slug);
    const bAfter = await sheetVersion(bSlug);
    assert.notEqual(aAfter, aBefore, "sheet nguồn (A) phải bump khi nhóm rời đi");
    assert.notEqual(bAfter, bBefore, "sheet đích (B) phải bump khi nhóm chuyển đến");

    await cleanup(a);
  },
);

test(
  "sheetVersion: sửa task không đổi tiến độ (vd note) vẫn bump — false-positive rẻ, chấp nhận được",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { sheetVersion } = await import("@/lib/version");

    const s = await seedSheet("note");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'N,01', 'Task note')`,
      s.pkgId,
    );

    const before = await sheetVersion(s.slug);
    // Chỉ đổi ghi chú, không đụng tiến độ — trigger vẫn bump. Đây là false-positive CHẤP NHẬN
    // ĐƯỢC theo đặc tả: chỉ khiến client refresh thừa 1 lần, không sai dữ liệu; đổi lại là
    // trigger đơn giản (không phải soi từng cột) và không bao giờ bỏ sót thay đổi thật.
    await run(`UPDATE tasks SET note = 'ghi chú mới' WHERE id = ?`, taskId);
    const after = await sheetVersion(s.slug);

    assert.notEqual(after, before, "sửa task (dù không đổi tiến độ) vẫn bump — chấp nhận được");
    await cleanup(s);
  },
);
