import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Nối danh tính hồ sơ thầu phụ M82 về nguồn duy nhất `suppliers` (audit 2026-08-25 §3.3,
// migration 0137). Bất biến còn lại nằm ở DB: mỗi nhà cung cấp chỉ 1 hồ sơ/dự án.
// (Phần test tầng lib đã bỏ cùng `lib/hien-truong/subcon-metrics.ts` — module chết, không
// route/UI nào gọi, xem PROGRESS.md đợt dọn code chết 2026-09-22.)

test(
  "index 0137 chặn 2 hồ sơ cùng (dự án, nhà cung cấp) ngay ở DB",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const projectId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('Dự án test subcon 2', 'TEST-SUBCON-2')`,
    );
    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC test 0137 B')`);

    await run(
      `INSERT INTO engineering_subcon_profiles (project_id, supplier_id, company_name, primary_discipline)
       VALUES (?, ?, 'NCC test 0137 B', 'ELECTRICAL')`,
      projectId,
      supplierId,
    );
    // Chèn thẳng bằng SQL (bỏ qua tầng lib) vẫn phải bị chặn — bất biến nằm ở DB.
    await assert.rejects(
      run(
        `INSERT INTO engineering_subcon_profiles (project_id, supplier_id, company_name, primary_discipline)
         VALUES (?, ?, 'Tên khác hẳn', 'HVAC')`,
        projectId,
        supplierId,
      ),
    );

    await run(`DELETE FROM engineering_subcon_profiles WHERE project_id = ?`, projectId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);
