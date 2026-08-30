import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Thu hồi revision bản vẽ — chính người tải lên rev tự rút lại bản gửi SAI của mình khi còn
// "submitted"/"commented" (Admin/PM chưa quyết định). Admin/PM vẫn dùng PATCH
// /api/drawings/revisions/:id (setRevisionStatus) để "Từ chối" bản của người khác kèm lý do.
//
// (1) Route-source: force-dynamic, getCurrentUser, kiểm quyền CAN., đủ mã lỗi 400/401/403/404/409.
//     KHÔNG gọi handler trực tiếp trong test (ngoài request scope thật `cookies()` sẽ throw,
//     cùng lý do các test route khác trong repo) — kiểm hành vi qua `withdrawRevision` (lib mà
//     route uỷ quyền toàn bộ logic) + kiểm mã trạng thái/điều kiện ở mức nguồn route.
// (2) Integration (TEST_DATABASE_URL, tự skip): not-found / forbidden (403) / withdrawn (200,
//     đổi trạng thái, không ảnh hưởng rev khác của cùng drawing) / conflict (409, đã duyệt).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

// ===== (1) Route-source =====

function nguon(): string {
  return readFileSync(
    join(process.cwd(), "app", "api", "drawings", "revisions", "[id]", "withdraw", "route.ts"),
    "utf8",
  );
}

test(
  "route withdraw: force-dynamic, getCurrentUser, CAN., đủ 400/401/403/404/409, uỷ quyền withdrawRevision",
  () => {
    const src = nguon();
    assert.match(src, /export const dynamic = "force-dynamic"/);
    assert.match(src, /getCurrentUser\(\)/);
    assert.match(src, /CAN\./, "route ghi dữ liệu phải kiểm quyền qua CAN.");
    assert.match(src, /status: 400/);
    assert.match(src, /status: 401/);
    assert.match(src, /status: 403/);
    assert.match(src, /status: 404/);
    assert.match(src, /status: 409/);
    assert.match(src, /withdrawRevision/, "route phải uỷ quyền logic cho lib withdrawRevision");
  },
);

// ===== (2) Integration — hành vi thật của lib mà route uỷ quyền =====

let drawingId = 0;
let ownerId = 0;
let khacId = 0;

async function xoaSach() {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM drawing_revisions WHERE drawing_id = ?`, drawingId);
}

async function taoRevision(status: string, uploadedBy: number, rev: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status, uploaded_by)
     VALUES (?, ?, 'f.pdf', 'application/pdf', ?, ?)`,
    drawingId,
    rev,
    status,
    uploadedBy,
  );
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const dau = Date.now();
  ownerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư tải lên', 'drw-owner-${dau}@test.local', 'x', 'engineer', 1)`,
  );
  khacId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư khác', 'drw-khac-${dau}@test.local', 'x', 'engineer', 1)`,
  );
  drawingId = await insertId(
    `INSERT INTO drawings (code, name, kind) VALUES ('DWG-WD-TEST-${dau}', 'Bản vẽ test thu hồi', 'shop')`,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !drawingId) return;
  const { run } = await import("@/lib/db");
  await xoaSach();
  await run(`DELETE FROM drawings WHERE id = ?`, drawingId);
  await run(`DELETE FROM users WHERE id IN (?, ?)`, ownerId, khacId);
});

test("withdrawRevision: id không tồn tại → not-found (route trả 404)", S, async () => {
  const { withdrawRevision } = await import("@/lib/ky-thuat/drawings");
  const kq = await withdrawRevision(999999999, ownerId);
  assert.equal(kq.status, "not-found");
});

test(
  "withdrawRevision: người khác thu hồi → forbidden (route trả 403), không đổi trạng thái",
  S,
  async () => {
    await xoaSach();
    const id = await taoRevision("submitted", ownerId, "A");
    const { withdrawRevision } = await import("@/lib/ky-thuat/drawings");
    const kq = await withdrawRevision(id, khacId);
    assert.equal(kq.status, "forbidden");

    const { queryOne } = await import("@/lib/db");
    const rev = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      id,
    );
    assert.equal(rev?.status, "submitted", "trạng thái không được đổi khi người khác thu hồi");
  },
);

test(
  "withdrawRevision: chính chủ + submitted → withdrawn (route trả 200), trạng thái đổi",
  S,
  async () => {
    await xoaSach();
    const id = await taoRevision("submitted", ownerId, "A");
    const { withdrawRevision } = await import("@/lib/ky-thuat/drawings");
    const kq = await withdrawRevision(id, ownerId);
    assert.equal(kq.status, "withdrawn");
    assert.ok("drawingId" in kq && kq.drawingId === drawingId);

    const { queryOne } = await import("@/lib/db");
    const rev = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      id,
    );
    assert.equal(rev?.status, "withdrawn");

    // Thu hồi lại lần nữa → không còn submitted/commented → conflict (route trả 409).
    const lai = await withdrawRevision(id, ownerId);
    assert.equal(lai.status, "conflict");
  },
);

test(
  "withdrawRevision: chính chủ + commented → withdrawn được (chưa quyết định)",
  S,
  async () => {
    await xoaSach();
    const id = await taoRevision("commented", ownerId, "A");
    const { withdrawRevision } = await import("@/lib/ky-thuat/drawings");
    const kq = await withdrawRevision(id, ownerId);
    assert.equal(kq.status, "withdrawn");
  },
);

test(
  "withdrawRevision: rev đã duyệt/từ chối → conflict (route trả 409), không thu hồi được, rev khác của cùng drawing không bị ảnh hưởng",
  S,
  async () => {
    await xoaSach();
    const idDaDuyet = await taoRevision("approved", ownerId, "A");
    const idKhacDangCho = await taoRevision("submitted", ownerId, "B");

    const { withdrawRevision } = await import("@/lib/ky-thuat/drawings");
    const kq = await withdrawRevision(idDaDuyet, ownerId);
    assert.equal(kq.status, "conflict");

    const { queryOne } = await import("@/lib/db");
    const revDaDuyet = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      idDaDuyet,
    );
    assert.equal(revDaDuyet?.status, "approved", "rev đã duyệt không bị đổi trạng thái");

    const revKhac = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      idKhacDangCho,
    );
    assert.equal(revKhac?.status, "submitted", "rev khác cùng drawing không bị ảnh hưởng");
  },
);
