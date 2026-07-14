import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Hồi quy cho lỗ hổng M22: /api/claim-documents/:id và /api/payment-certs/:id/excel
// thiếu lọc theo dự án đang chọn — user thuộc dự án B đọc/xoá được tài liệu của dự án A.
// File này test trực tiếp logic scoping (không dựng HTTP server), đúng cách các route đã sửa dùng.

test(
  "claim-documents: getClaim(doc.claim_id, projectId) — chặn xem/xoá tài liệu claim thuộc dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { getClaim } = await import("@/lib/claims");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Dự án claim-doc A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Dự án claim-doc B')`);

    const claimA = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, amount_requested, status)
       VALUES (?, 'CLM-TEST-DOCSCOPE', 'cost', 'Claim tài liệu A', '2026-07-01', 'Nguyên nhân', 1000000, 'notice')`,
      projA,
    );
    const docId = await insertId(
      `INSERT INTO claim_documents (claim_id, title, file_name, original_name, mime_type, size_bytes)
       VALUES (?, 'Hồ sơ test', 'test-doc.pdf', 'test-doc.pdf', 'application/pdf', 1024)`,
      claimA,
    );

    // User thuộc dự án B (đang chọn projB) không thấy claim/tài liệu của projA.
    const claimForB = await getClaim(claimA, projB);
    assert.equal(claimForB, undefined);

    // User thuộc dự án A (đang chọn projA) thấy đúng claim/tài liệu.
    const claimForA = await getClaim(claimA, projA);
    assert.ok(claimForA);
    assert.equal(claimForA!.id, claimA);

    await run(`DELETE FROM claim_documents WHERE id = ?`, docId);
    await run(`DELETE FROM claims WHERE id = ?`, claimA);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
  },
);

test(
  "payment-certs excel: query scoping (JOIN contracts ON project_id) — chặn xuất Excel đợt thanh toán thuộc dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Dự án IPC-scope A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Dự án IPC-scope B')`);

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test IPC scope')`);
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, party_supplier_id, value, advance_pct, retention_pct, status, project_id)
       VALUES ('HD-TEST-IPCSCOPE', 'giao_thau', 'HĐ test IPC scope', ?, 100000, 10, 5, 'active', ?)`,
      supplierId,
      projA,
    );
    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
       VALUES ('IPC-TEST-SCOPE', ?, 1, 'draft')`,
      contractId,
    );

    // Logic scoping y hệt certInProject() trong app/api/payment-certs/[id]/excel/route.ts.
    async function certInProject(id: number, projectId: number | null) {
      if (projectId == null) return undefined;
      return queryOne<{ status: string; contractId: number }>(
        `SELECT c.status, c.contract_id AS "contractId"
           FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
          WHERE c.id = ? AND ct.project_id = ?`,
        id,
        projectId,
      );
    }

    // User đang chọn dự án B không thấy đợt thanh toán của hợp đồng thuộc dự án A.
    const scopedForB = await certInProject(certId, projB);
    assert.equal(scopedForB, undefined);

    // User đang chọn dự án A thấy đúng đợt thanh toán.
    const scopedForA = await certInProject(certId, projA);
    assert.ok(scopedForA);
    assert.equal(scopedForA!.contractId, contractId);

    await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
  },
);
