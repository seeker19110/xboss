import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Bổ sung M103 — GET /api/engineering/cad/block-proposals/:id/candidate: tải tệp .dwg ứng viên
// của một đề xuất (người duyệt trước đây chỉ có preview SVG best-effort).
//
// (1) Route-source: route handler gọi `getCurrentUser()` (cookies() ngoài request scope thật của
//     Next sẽ ném — đã xác minh bằng thử nghiệm thủ công gọi handler trực tiếp), nên không gọi
//     handler ngoài request thật được — kiểm nguồn giống `tests/cad-block-proposals.test.ts`
//     (ca "route approve/reject"): force-dynamic, KHÔNG nhận token thiết bị, đủ mã trạng thái.
// (2) Integration (TEST_DATABASE_URL, tự skip): kiểm hàm lõi `layTepUngVien` — trả đúng nội dung
//     tệp + sha256 khớp cho người duyệt lẫn chính người đề xuất; forbidden cho người khác;
//     not-found cho id lạ; missing-file khi tệp đã mất trên kho lưu trữ.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

function nguon(...phan: string[]): string {
  return readFileSync(
    join(
      process.cwd(),
      "app",
      "api",
      "engineering",
      "cad",
      "block-proposals",
      "[id]",
      "candidate",
      ...phan,
    ),
    "utf8",
  );
}

// ===== (1) Route-source =====

test("route candidate: force-dynamic, chỉ phiên web (không token thiết bị), đủ mã trạng thái", () => {
  const src = nguon("route.ts");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.ok(!src.includes("getCadTokenUser"), "route candidate không được nhận token thiết bị");
  assert.match(src, /CAN\.approve\(user\.role\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 404/);
  assert.match(src, /status: 429/);
  assert.match(src, /hitRateLimit\(`cad-block-proposal-candidate:/);
  // `candidate_storage_key` phải đọc từ dòng DB theo id, không ghép chuỗi từ request/query.
  assert.match(src, /layTepUngVien/);
  assert.ok(!src.includes("req.nextUrl.searchParams"), "không nhận đường dẫn tệp từ query/input");
});

// ===== (2) Integration (Postgres) — lib layTepUngVien =====

let pmId = 0;
let proposerId = 0;
let otherId = 0;
let proposalId = 0;
const KEY = `zz-test-candidate-${Date.now()}`;
const NOI_DUNG = Buffer.from("noi dung dwg gia lap cho test candidate");
const SHA256 = createHash("sha256").update(NOI_DUNG).digest("hex");

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const dau = Date.now();
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM duyệt candidate', 'bp-cand-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  proposerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư đề xuất candidate', 'bp-cand-eng-${dau}@test.local', 'x', 'engineer', 1)`,
  );
  otherId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư khác candidate', 'bp-cand-other-${dau}@test.local', 'x', 'engineer', 1)`,
  );

  const { storagePut } = await import("@/lib/nen/storage");
  const { ORG_THU_VIEN_BLOCK } = await import("@/lib/ky-thuat/cad/block");
  await storagePut(ORG_THU_VIEN_BLOCK, KEY, NOI_DUNG);

  const { insertId: insertId2 } = await import("@/lib/db");
  proposalId = await insertId2(
    `INSERT INTO cad_block_proposals
       (block_name, kind, base_lib_version, candidate_manifest, candidate_storage_key,
        candidate_dwg_sha256, status, proposed_by)
     VALUES ('XB-TEST-CAND', 'fitting', 'b0-mau', '{}'::jsonb, ?, ?, 'pending', ?)`,
    KEY,
    SHA256,
    proposerId,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !pmId) return;
  const { run } = await import("@/lib/db");
  const { storageDelete } = await import("@/lib/nen/storage");
  await storageDelete(1, KEY);
  await run(`DELETE FROM cad_block_proposals WHERE id = ?`, proposalId);
  await run(`DELETE FROM users WHERE id IN (?, ?, ?)`, pmId, proposerId, otherId);
});

test("layTepUngVien: người duyệt tải được, đúng nội dung + sha256 khớp", S, async () => {
  const { layTepUngVien } = await import("@/lib/ky-thuat/cad/block");
  const kq = await layTepUngVien({ id: proposalId, userId: pmId, coQuyenDuyet: true });
  assert.equal(kq.status, "ok", JSON.stringify(kq));
  if (kq.status !== "ok") return;
  assert.equal(kq.buf.toString(), NOI_DUNG.toString());
  assert.equal(kq.sha256, SHA256);
  assert.equal(createHash("sha256").update(kq.buf).digest("hex"), SHA256);
  assert.equal(kq.blockName, "XB-TEST-CAND");
});

test("layTepUngVien: chính người đề xuất (không có quyền duyệt) vẫn tải được", S, async () => {
  const { layTepUngVien } = await import("@/lib/ky-thuat/cad/block");
  const kq = await layTepUngVien({ id: proposalId, userId: proposerId, coQuyenDuyet: false });
  assert.equal(kq.status, "ok", JSON.stringify(kq));
});

test("layTepUngVien: người khác không có quyền duyệt → forbidden", S, async () => {
  const { layTepUngVien } = await import("@/lib/ky-thuat/cad/block");
  const kq = await layTepUngVien({ id: proposalId, userId: otherId, coQuyenDuyet: false });
  assert.equal(kq.status, "forbidden");
});

test("layTepUngVien: id không tồn tại → not-found", S, async () => {
  const { layTepUngVien } = await import("@/lib/ky-thuat/cad/block");
  const kq = await layTepUngVien({ id: 999999999, userId: pmId, coQuyenDuyet: true });
  assert.equal(kq.status, "not-found");
});

test("layTepUngVien: tệp đã mất trên kho lưu trữ → missing-file", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { layTepUngVien } = await import("@/lib/ky-thuat/cad/block");
  const idMoCoi = await insertId(
    `INSERT INTO cad_block_proposals
       (block_name, kind, base_lib_version, candidate_manifest, candidate_storage_key,
        candidate_dwg_sha256, status, proposed_by)
     VALUES ('XB-TEST-CAND-MISSING', 'fitting', 'b0-mau', '{}'::jsonb, 'khong-ton-tai-tren-dia', ?, 'pending', ?)`,
    SHA256,
    proposerId,
  );
  try {
    const kq = await layTepUngVien({ id: idMoCoi, userId: pmId, coQuyenDuyet: true });
    assert.equal(kq.status, "missing-file");
  } finally {
    await run(`DELETE FROM cad_block_proposals WHERE id = ?`, idMoCoi);
  }
});
