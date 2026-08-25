import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Kiểm chứng CHÍNH câu backfill của migration 0137/0138 trên dữ liệu dựng sẵn, trước khi
// chạy staging/production (DoD: migration đụng dữ liệu phải qua staging). Test đọc thẳng
// file .sql rồi chạy lại đúng câu UPDATE đó — không chép tay, nên file .sql đổi là test đổi.
//
// Ba tình huống phải phân biệt được (đây là điều migration hứa trong chú thích của nó):
//   khớp DUY NHẤT một nhà cung cấp → gắn; TRÙNG TÊN nhiều nhà cung cấp → để NULL;
//   không khớp ai → để NULL. Tuyệt đối không đoán.

const goc = join(import.meta.dirname, "..");

/** Lấy các câu UPDATE trong một file migration (bỏ CREATE/ALTER — chúng đã chạy rồi). */
function layCauUpdate(tenTep: string): string[] {
  const sql = readFileSync(join(goc, "migrations", tenTep), "utf8");
  // BỎ CHÚ THÍCH TRƯỚC rồi mới tách theo `;` — chú thích trong migration có chứa dấu `;`
  // (vd "(DoD trong CLAUDE.md; kiểm trước bằng …)"), tách trước thì cắt ngang chú thích.
  const khongChuThich = sql
    .split("\n")
    .filter((d) => !d.trim().startsWith("--"))
    .join("\n");
  return khongChuThich
    .split(";")
    .map((c) => c.trim())
    .filter((c) => /^UPDATE\b/i.test(c));
}

test(
  "0137: backfill supplier_id chỉ gắn khi tên khớp DUY NHẤT, trùng tên/không khớp thì để NULL",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne, query } = await import("@/lib/db");

    // Dọn tàn dư của lần chạy trước (test có thể dừng giữa chừng) — `projects.code` là unique.
    await run(`DELETE FROM projects WHERE code = 'TEST-BF'`);
    await run(`DELETE FROM suppliers WHERE name ILIKE '%BF'`);

    const projectId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('Dự án test backfill', 'TEST-BF')`,
    );
    // (a) khớp duy nhất — kèm khoảng trắng thừa + khác hoa thường để kiểm phần chuẩn hoá.
    const nccDuyNhat = await insertId(
      `INSERT INTO suppliers (name) VALUES ('Công ty Cơ Điện Duy Nhất BF')`,
    );
    // (b) trùng tên — hai nhà cung cấp cùng tên chuẩn hoá.
    await insertId(`INSERT INTO suppliers (name) VALUES ('Công ty Trùng Tên BF')`);
    await insertId(`INSERT INTO suppliers (name) VALUES ('công ty   trùng tên bf')`);

    await run(
      `INSERT INTO engineering_subcon_profiles (project_id, company_name, primary_discipline)
       VALUES (?, '  công ty   CƠ ĐIỆN duy nhất bf ', 'HVAC'),
              (?, 'Công ty Trùng Tên BF', 'ELECTRICAL'),
              (?, 'Nhà thầu không có trong suppliers BF', 'PLUMBING')`,
      projectId,
      projectId,
      projectId,
    );

    const cauUpdate = layCauUpdate("0137_subcon_profile_supplier_link.sql");
    assert.equal(cauUpdate.length, 1, "0137 phải có đúng 1 câu UPDATE backfill");
    await run(cauUpdate[0]);

    const lay = async (ten: string) =>
      queryOne<{ supplierId: number | null }>(
        `SELECT supplier_id AS "supplierId" FROM engineering_subcon_profiles
          WHERE project_id = ? AND company_name = ?`,
        projectId,
        ten,
      );

    assert.equal(
      (await lay("  công ty   CƠ ĐIỆN duy nhất bf "))?.supplierId,
      nccDuyNhat,
      "khớp duy nhất (sau chuẩn hoá hoa thường + khoảng trắng) phải được gắn",
    );
    assert.equal(
      (await lay("Công ty Trùng Tên BF"))?.supplierId,
      null,
      "trùng tên nhiều nhà cung cấp thì KHÔNG đoán, để NULL",
    );
    assert.equal(
      (await lay("Nhà thầu không có trong suppliers BF"))?.supplierId,
      null,
      "không khớp ai thì để NULL",
    );

    // Chạy lại lần hai không đổi gì (idempotent) — quan trọng vì runner có thể áp lại.
    await run(cauUpdate[0]);
    assert.equal((await lay("  công ty   CƠ ĐIỆN duy nhất bf "))?.supplierId, nccDuyNhat);

    const conLai = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_subcon_profiles WHERE project_id = ?`,
      projectId,
    );
    assert.equal(conLai[0].n, 3, "backfill không được thêm/bớt dòng nào");

    await run(`DELETE FROM engineering_subcon_profiles WHERE project_id = ?`, projectId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM suppliers WHERE name ILIKE '%BF'`);
  },
);

test(
  "0138: ba câu backfill gắn supplier_id cho 3 bảng lớp engineering theo cùng quy tắc",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    await run(`DELETE FROM projects WHERE code = 'TEST-BF138'`);
    await run(`DELETE FROM suppliers WHERE name ILIKE '%BF138'`);

    const projectId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('Dự án test backfill 138', 'TEST-BF138')`,
    );
    const nccId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Vận Chuyển BF138')`);

    await run(
      `INSERT INTO engineering_material_shipments
         (project_id, shipment_code, do_number, po_number, supplier_name, status)
       VALUES (?, 'SHP-BF138', 'DO-BF138', 'PO-BF138', 'ncc vận chuyển  BF138', 'dispatched')`,
      projectId,
    );

    const cauUpdate = layCauUpdate("0138_engineering_danh_tinh_doi_tac.sql");
    assert.equal(cauUpdate.length, 3, "0138 phải có đúng 3 câu UPDATE (3 bảng)");
    for (const c of cauUpdate) await run(c);

    const row = await queryOne<{ supplierId: number | null }>(
      `SELECT supplier_id AS "supplierId" FROM engineering_material_shipments
        WHERE shipment_code = 'SHP-BF138'`,
    );
    assert.equal(row?.supplierId, nccId, "tên chuẩn hoá khớp duy nhất → gắn supplier_id");

    await run(`DELETE FROM engineering_material_shipments WHERE shipment_code = 'SHP-BF138'`);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM suppliers WHERE id = ?`, nccId);
  },
);
