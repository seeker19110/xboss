import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateDrawingInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateDrawingInput } = await import("@/lib/drawings");

  const base = {
    code: "ACMV-SD-T05-001",
    name: "Sơ đồ điều hòa tầng 5",
    kind: "shop" as const,
    systemGroup: "ACMV",
    floorLabel: "T05",
    workPackageId: null,
  };

  assert.equal(validateDrawingInput(base), null);
  assert.match(validateDrawingInput({ ...base, code: "" })!, /số bản vẽ/i);
  assert.match(validateDrawingInput({ ...base, name: "" })!, /tên bản vẽ/i);
  assert.match(validateDrawingInput({ ...base, kind: "xxx" as never })!, /loại bản vẽ/i);
});

test("parseDrawingBody: chuẩn hoá field, mặc định kind='shop', chuỗi rỗng → null", async () => {
  const { parseDrawingBody } = await import("@/lib/drawings");

  const parsed = parseDrawingBody({ code: " ACMV-001 ", name: "Bản vẽ", systemGroup: "  " });
  assert.equal(parsed.code, "ACMV-001");
  assert.equal(parsed.kind, "shop");
  assert.equal(parsed.systemGroup, null);
  assert.equal(parsed.workPackageId, null);

  const withKind = parseDrawingBody({ code: "M-01", name: "Biện pháp", kind: "method" });
  assert.equal(withKind.kind, "method");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "listDrawings: lọc theo kind/status đúng, kèm rev mới nhất + rev đã duyệt mới nhất",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listDrawings } = await import("@/lib/drawings");

    const drawingId = await insertId(
      `INSERT INTO drawings (code, name, kind) VALUES ('DWG-TEST-001', 'Bản vẽ test', 'shop')`,
    );
    const revAId = await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
       VALUES (?, 'A', 'f-a.pdf', 'application/pdf', 'approved')`,
      drawingId,
    );
    const revBId = await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
       VALUES (?, 'B', 'f-b.pdf', 'application/pdf', 'submitted')`,
      drawingId,
    );

    const all = await listDrawings();
    const row = all.find((d) => d.id === drawingId);
    assert.ok(row);
    assert.equal(row!.latestRevisionId, revBId); // rev mới nhất = B (id lớn hơn)
    assert.equal(row!.latestStatus, "submitted");
    assert.equal(row!.approvedRevisionId, revAId); // rev đã duyệt mới nhất vẫn là A

    const byKind = await listDrawings({ kind: "method" });
    assert.ok(!byKind.some((d) => d.id === drawingId));

    const byStatus = await listDrawings({ status: "submitted" });
    assert.ok(byStatus.some((d) => d.id === drawingId));

    await run(`DELETE FROM drawings WHERE id = ?`, drawingId);
  },
);

test(
  "setRevisionStatus: rev mới approved tự supersede rev approved cũ (chỉ 1 rev hiệu lực/drawing)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { setRevisionStatus } = await import("@/lib/drawings");

    const drawingId = await insertId(
      `INSERT INTO drawings (code, name, kind) VALUES ('DWG-TEST-SUPERSEDE', 'Bản vẽ test', 'shop')`,
    );
    const revA = await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
       VALUES (?, 'A', 'f-a.pdf', 'application/pdf', 'submitted')`,
      drawingId,
    );
    const revB = await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
       VALUES (?, 'B', 'f-b.pdf', 'application/pdf', 'submitted')`,
      drawingId,
    );

    const r1 = await setRevisionStatus(revA, "approved", null);
    assert.ok("drawingId" in r1);

    let statusA = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      revA,
    );
    assert.equal(statusA?.status, "approved");

    // Rev B duyệt kèm ý kiến → A (đang approved) phải chuyển superseded.
    const r2 = await setRevisionStatus(revB, "approved_with_comments", "Ghi chú TVGS");
    assert.ok("drawingId" in r2);

    statusA = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      revA,
    );
    const statusB = await queryOne<{ status: string; decisionNote: string | null }>(
      `SELECT status, decision_note AS "decisionNote" FROM drawing_revisions WHERE id = ?`,
      revB,
    );
    assert.equal(statusA?.status, "superseded");
    assert.equal(statusB?.status, "approved_with_comments");
    assert.equal(statusB?.decisionNote, "Ghi chú TVGS");

    // Reject không kích hoạt supersede (không phải trạng thái "hiệu lực").
    const revC = await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
       VALUES (?, 'C', 'f-c.pdf', 'application/pdf', 'submitted')`,
      drawingId,
    );
    await setRevisionStatus(revC, "rejected", "Không đạt");
    const statusBAfter = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      revB,
    );
    assert.equal(statusBAfter?.status, "approved_with_comments"); // vẫn hiệu lực, không bị đụng

    await run(`DELETE FROM drawings WHERE id = ?`, drawingId);
  },
);

test(
  "UNIQUE (drawing_id, rev) chống trùng rev trong cùng 1 bản vẽ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { isUniqueViolation } = await import("@/lib/seqcode");

    const drawingId = await insertId(
      `INSERT INTO drawings (code, name, kind) VALUES ('DWG-TEST-DUP', 'Bản vẽ test', 'shop')`,
    );
    await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type)
       VALUES (?, 'A', 'f-a.pdf', 'application/pdf')`,
      drawingId,
    );

    await assert.rejects(
      insertId(
        `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type)
         VALUES (?, 'A', 'f-a2.pdf', 'application/pdf')`,
        drawingId,
      ),
      (e: unknown) => isUniqueViolation(e),
    );

    await run(`DELETE FROM drawings WHERE id = ?`, drawingId);
  },
);

test("UNIQUE code bản vẽ chống trùng số bản vẽ toàn hệ thống", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId } = await import("@/lib/db");
  const { isUniqueViolation } = await import("@/lib/seqcode");

  const id = await insertId(
    `INSERT INTO drawings (code, name, kind) VALUES ('DWG-TEST-CODE', 'Bản vẽ test', 'shop')`,
  );

  await assert.rejects(
    insertId(
      `INSERT INTO drawings (code, name, kind) VALUES ('DWG-TEST-CODE', 'Trùng mã', 'shop')`,
    ),
    (e: unknown) => isUniqueViolation(e),
  );

  await run(`DELETE FROM drawings WHERE id = ?`, id);
});
