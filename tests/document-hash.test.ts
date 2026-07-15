import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// M43 PR3: sha256Hex (lib/photos.ts) + cột sha256 trên 4 bảng tài liệu
// (task_documents/claim_documents/contract_documents/vo_documents). Route POST upload
// đều theo cùng pattern: sha256Hex(fileBuf) rồi ghi vào cột sha256 lúc INSERT — test dưới
// đây mô phỏng đúng thao tác đó ở tầng DB (cùng cách các test *-scope.test.ts hiện có
// mirror SQL của route thay vì gọi trực tiếp route handler Next.js, vốn cần context
// cookies()/next-headers không có sẵn khi chạy ngoài request thật).
const S = Date.now().toString(36);

test("sha256Hex: khớp đúng crypto.createHash('sha256') tính tay trên buffer", async () => {
  const { sha256Hex } = await import("@/lib/photos");
  const buf = Buffer.from("Nội dung biên bản nghiệm thu test M43 PR3");
  const expected = createHash("sha256").update(buf).digest("hex");
  assert.equal(sha256Hex(buf), expected);
  assert.equal(sha256Hex(buf).length, 64); // hex của 32 byte
});

test("sha256Hex: buffer khác nội dung cho hash khác nhau", async () => {
  const { sha256Hex } = await import("@/lib/photos");
  const a = sha256Hex(Buffer.from("nội dung A"));
  const b = sha256Hex(Buffer.from("nội dung B"));
  assert.notEqual(a, b);
});

test(
  "task_documents: sha256 ghi đúng như route POST /api/tasks/:id/documents tính (sha256Hex(fileBuf))",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { sha256Hex } = await import("@/lib/photos");

    const buf = Buffer.from(`fake-pdf-content-task-${S}`);
    const sha256 = sha256Hex(buf);

    // task_id nullable (dùng cho biên bản gắn floor_approval_id, M22) — không cần dựng
    // đủ chuỗi tower/sheet/work_package/task chỉ để test cột sha256.
    const docId = await insertId(
      `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, size_bytes, uploaded_by, sha256)
       VALUES (NULL, ?, ?, 'application/pdf', ?, NULL, ?)`,
      `sha-test-${S}.pdf`,
      `sha-test-${S}.pdf`,
      buf.length,
      sha256,
    );

    const row = await queryOne<{ sha256: string | null }>(
      `SELECT sha256 FROM task_documents WHERE id = ?`,
      docId,
    );
    assert.equal(row?.sha256, sha256);
    assert.equal(row?.sha256, createHash("sha256").update(buf).digest("hex"));

    await run(`DELETE FROM task_documents WHERE id = ?`, docId);
  },
);

test(
  "claim_documents/contract_documents/vo_documents: cột sha256 tồn tại và lưu đúng giá trị",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { sha256Hex } = await import("@/lib/photos");

    const buf = Buffer.from(`fake-file-content-${S}`);
    const sha256 = sha256Hex(buf);

    // claim_documents cần 1 claim cha hợp lệ.
    const claimId = await insertId(
      `INSERT INTO claims (code, kind, title, notice_date, cause, status)
       VALUES (?, 'cost', 'Claim test sha256', '2026-01-01', 'Test M43 PR3', 'notice')`,
      `CLM-SHA-${S}`,
    );
    const claimDocId = await insertId(
      `INSERT INTO claim_documents (claim_id, file_name, original_name, mime_type, size_bytes, sha256)
       VALUES (?, ?, ?, 'application/pdf', ?, ?)`,
      claimId,
      `clm-${S}.pdf`,
      `clm-${S}.pdf`,
      buf.length,
      sha256,
    );
    const claimRow = await queryOne<{ sha256: string | null }>(
      `SELECT sha256 FROM claim_documents WHERE id = ?`,
      claimDocId,
    );
    assert.equal(claimRow?.sha256, sha256);

    // contract_documents cần 1 hợp đồng cha hợp lệ.
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ test sha256', 0)`,
      `HD-SHA-${S}`,
    );
    const contractDocId = await insertId(
      `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, size_bytes, sha256)
       VALUES (?, ?, ?, 'application/pdf', ?, ?)`,
      contractId,
      `ct-${S}.pdf`,
      `ct-${S}.pdf`,
      buf.length,
      sha256,
    );
    const contractRow = await queryOne<{ sha256: string | null }>(
      `SELECT sha256 FROM contract_documents WHERE id = ?`,
      contractDocId,
    );
    assert.equal(contractRow?.sha256, sha256);

    // vo_documents cần 1 variation order cha hợp lệ.
    const voId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status)
       VALUES (?, 'VO test sha256', 'other', 'draft')`,
      `VO-SHA-${S}`,
    );
    const voDocId = await insertId(
      `INSERT INTO vo_documents (vo_id, file_name, original_name, mime_type, size_bytes, sha256)
       VALUES (?, ?, ?, 'application/pdf', ?, ?)`,
      voId,
      `vo-${S}.pdf`,
      `vo-${S}.pdf`,
      buf.length,
      sha256,
    );
    const voRow = await queryOne<{ sha256: string | null }>(
      `SELECT sha256 FROM vo_documents WHERE id = ?`,
      voDocId,
    );
    assert.equal(voRow?.sha256, sha256);

    // Dọn dẹp — tránh rác tồn dư giữa các lần chạy test trên cùng DB.
    await run(`DELETE FROM claims WHERE id = ?`, claimId); // cascade claim_documents
    await run(`DELETE FROM contracts WHERE id = ?`, contractId); // cascade contract_documents
    await run(`DELETE FROM variation_orders WHERE id = ?`, voId); // cascade vo_documents
  },
);
