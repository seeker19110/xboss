import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Nối danh tính hồ sơ thầu phụ M82 về nguồn duy nhất `suppliers` (audit 2026-08-25 §3.3,
// migration 0137). Ba bất biến: tên công ty chép từ suppliers (không nhận từ client),
// mỗi nhà cung cấp chỉ 1 hồ sơ/dự án, và chuyên ngành phải nằm trong danh mục.

test(
  "taoHoSoThauPhu: chép tên từ suppliers, chặn trùng nhà cung cấp trong cùng dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { taoHoSoThauPhu } = await import("@/lib/hien-truong/subcon-metrics");

    const projectId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('Dự án test subcon', 'TEST-SUBCON')`,
    );
    const supplierId = await insertId(
      `INSERT INTO suppliers (name) VALUES ('Công ty TNHH Cơ Điện Test 0137')`,
    );

    // Tên công ty do server chép từ suppliers — client không truyền tên vào được.
    const ket = await taoHoSoThauPhu(projectId, {
      supplierId,
      primaryDiscipline: "HVAC",
      taxCode: "0101234567",
    });
    assert.equal(ket.ok, true);

    const row = await queryOne<{ companyName: string; supplierId: number }>(
      `SELECT company_name AS "companyName", supplier_id AS "supplierId"
         FROM engineering_subcon_profiles WHERE project_id = ?`,
      projectId,
    );
    assert.equal(row?.companyName, "Công ty TNHH Cơ Điện Test 0137");
    assert.equal(row?.supplierId, supplierId);

    // Lần hai cùng nhà cung cấp trong cùng dự án → 409, không tạo bản ghi thứ hai.
    const lai = await taoHoSoThauPhu(projectId, { supplierId, primaryDiscipline: "HVAC" });
    assert.equal(lai.ok, false);
    assert.equal(lai.ok === false && lai.status, 409);

    // Chuyên ngành ngoài danh mục → 422.
    const sai = await taoHoSoThauPhu(projectId, { supplierId, primaryDiscipline: "KHONG_CO" });
    assert.equal(sai.ok === false && sai.status, 422);

    // Nhà cung cấp không tồn tại → 404.
    const thieu = await taoHoSoThauPhu(projectId, {
      supplierId: 2_000_000_000,
      primaryDiscipline: "HVAC",
    });
    assert.equal(thieu.ok === false && thieu.status, 404);

    await run(`DELETE FROM engineering_subcon_profiles WHERE project_id = ?`, projectId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);

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
