import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) — hồi quy cho lỗi thật
// phát hiện ở đợt audit 2026-07-12: work_packages.code trùng trong cùng sheet chỉ được
// kiểm ở tầng ứng dụng (SELECT rồi mới INSERT, không transaction/lock) nên 2 request
// đồng thời (2 người dùng cùng bấm "Thêm hạng mục"/"Sao chép" với cùng mã) có thể tạo
// trùng — migration 0045 thêm unique index (sheet_type_id, lower(code)) làm lưới an toàn
// cuối ở tầng DB, giống mô hình boq_codes.
test(
  "work_packages: unique index (sheet_type_id, lower(code)) chặn trùng mã trong cùng sheet",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test wp unique')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTWP', 'Sheet test wp')`,
      towerId,
    );

    await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm gốc')`,
      stId,
    );

    await assert.rejects(
      run(
        `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm trùng mã')`,
        stId,
      ),
      (err: unknown) => (err as { code?: string }).code === "23505",
    );

    // Không phân biệt hoa/thường (index dùng lower(code)).
    await assert.rejects(
      run(
        `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'a1', 'Nhóm trùng mã viết thường')`,
        stId,
      ),
      (err: unknown) => (err as { code?: string }).code === "23505",
    );

    // Cùng mã nhưng khác sheet thì không xung đột.
    const stId2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTWP2', 'Sheet test wp 2')`,
      towerId,
    );
    await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm cùng mã khác sheet')`,
      stId2,
    );
  },
);
