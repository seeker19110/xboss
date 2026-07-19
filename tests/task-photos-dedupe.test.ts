import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M-V2: cột task_photos.sha256 (migration 0073) dùng để dedupe khi hàng đợi offline
// (offlineQueue enqueuePhoto) gửi lại cùng ảnh sau khi có mạng trở lại. Route POST
// /api/tasks/:id/photos: cùng task_id + cùng sha256 trong 24h gần nhất → không ghi
// file/dòng mới, trả lại ảnh đã có. Test dưới đây mô phỏng đúng thao tác ở tầng DB
// (cùng pattern tests/document-hash.test.ts — route Next.js cần context request thật
// nên không gọi trực tiếp handler ở đây).
const S = Date.now().toString(36);

test(
  "task_photos: dedupe theo (task_id, sha256) trong 24h — POST trùng không nhân đôi dòng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, query, run } = await import("@/lib/db");
    const { sha256Hex } = await import("@/lib/photos");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test photo dedupe')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet test')`,
      towerId,
      `PD${S}`,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, 'Nhóm test')`,
      stId,
      `PD${S}`,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, 'Task test dedupe ảnh')`,
      pkgId,
      `PD${S},01`,
    );
    const taskId2 = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, 'Task test dedupe ảnh 2')`,
      pkgId,
      `PD${S},02`,
    );

    const buf = Buffer.from(`fake-photo-content-${S}`);
    const hash = sha256Hex(buf);

    // Mô phỏng lần POST đầu tiên: chưa có ảnh trùng → insert mới.
    async function findExisting(tid: number, h: string) {
      return queryOne<{ id: number; caption: string | null; sizeBytes: number }>(
        `SELECT id, caption, size_bytes AS "sizeBytes"
           FROM task_photos
          WHERE task_id = ? AND sha256 = ? AND created_at > now() - interval '24 hours'
          ORDER BY id DESC LIMIT 1`,
        tid,
        h,
      );
    }

    const before1 = await findExisting(taskId, hash);
    assert.equal(before1, undefined);

    const photoId1 = await insertId(
      `INSERT INTO task_photos (task_id, file_name, original_name, mime_type, size_bytes, caption, sha256)
       VALUES (?, ?, ?, 'image/jpeg', ?, NULL, ?)`,
      taskId,
      `t${taskId}-${S}-1.jpg`,
      `anh-${S}-1.jpg`,
      buf.length,
      hash,
    );

    // Lần POST thứ 2 cùng buffer, cùng task → phải tìm thấy dòng đã có, KHÔNG insert thêm.
    const existing2 = await findExisting(taskId, hash);
    assert.equal(existing2?.id, photoId1);

    const countRows = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM task_photos WHERE task_id = ? AND sha256 = ?`,
      taskId,
      hash,
    );
    assert.equal(Number(countRows[0].count), 1);

    // Buffer khác trên cùng task → KHÔNG dedupe, cần insert dòng mới.
    const buf2 = Buffer.from(`fake-photo-content-khac-${S}`);
    const hash2 = sha256Hex(buf2);
    assert.notEqual(hash, hash2);
    const beforeDiff = await findExisting(taskId, hash2);
    assert.equal(beforeDiff, undefined);
    const photoId2 = await insertId(
      `INSERT INTO task_photos (task_id, file_name, original_name, mime_type, size_bytes, caption, sha256)
       VALUES (?, ?, ?, 'image/jpeg', ?, NULL, ?)`,
      taskId,
      `t${taskId}-${S}-2.jpg`,
      `anh-${S}-2.jpg`,
      buf2.length,
      hash2,
    );
    assert.notEqual(photoId2, photoId1);

    // Cùng buffer gốc nhưng khác task → KHÔNG dedupe chéo task, cần insert dòng mới.
    const beforeOtherTask = await findExisting(taskId2, hash);
    assert.equal(beforeOtherTask, undefined);
    const photoId3 = await insertId(
      `INSERT INTO task_photos (task_id, file_name, original_name, mime_type, size_bytes, caption, sha256)
       VALUES (?, ?, ?, 'image/jpeg', ?, NULL, ?)`,
      taskId2,
      `t${taskId2}-${S}-1.jpg`,
      `anh-${S}-1.jpg`,
      buf.length,
      hash,
    );
    assert.notEqual(photoId3, photoId1);

    const totalRows = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM task_photos WHERE task_id IN (?, ?)`,
      taskId,
      taskId2,
    );
    assert.equal(Number(totalRows[0].count), 3);

    // Dọn dẹp — tránh rác tồn dư giữa các lần chạy test trên cùng DB (không có
    // ON DELETE CASCADE trên các bảng WBS nên xoá thủ công theo thứ tự con → cha).
    await run(`DELETE FROM task_photos WHERE task_id IN (?, ?)`, taskId, taskId2);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, taskId, taskId2);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
