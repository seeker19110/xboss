import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M57 PR1 — Tìm kiếm toàn văn (FTS) có index. Test tích hợp cần Postgres riêng
// (TEST_DATABASE_URL), tự skip nếu không có. Kiểm: unaccent 2 chiều, project scope +
// soft-delete, phân quyền nguồn contracts, và index GIN thực sự được dùng (EXPLAIN).

const skip = !HAS_TEST_DB;

// Seed 1 dự án + tháp/sheet tối thiểu → trả projectId + sheetTypeId để gắn dữ liệu.
async function seedProject(name: string): Promise<{ projectId: number; sheetTypeId: number }> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, name);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'T')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'S', 'Sheet', ?)`,
    towerId,
    `slug-${name}-${Math.random().toString(36).slice(2, 8)}`,
  );
  return { projectId, sheetTypeId };
}

let corrSeq = 0;
async function seedCorrespondence(projectId: number, subject: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO correspondences (code, direction, counterparty, subject, sent_date, project_id)
     VALUES (?, 'in', 'Đối tác', ?, CURRENT_DATE, ?)`,
    `CV-${Date.now()}-${++corrSeq}`,
    subject,
    projectId,
  );
}

test("FTS unaccent 2 chiều: 'nghiem thu' khớp 'nghiệm thu' và ngược lại", { skip }, async () => {
  const { searchSources } = await import("@/lib/search");
  const { projectId } = await seedProject("fts-unaccent");

  const accentedId = await seedCorrespondence(projectId, "Biên bản nghiệm thu tầng 5");
  const plainId = await seedCorrespondence(projectId, "Bien ban nghiem thu tang 6");

  // Gõ KHÔNG dấu → khớp bản ghi CÓ dấu.
  const r1 = await searchSources("admin", projectId, "nghiem thu", "nghiem thu%");
  assert.ok(
    r1.some((h) => h.kind === "correspondence" && h.id === accentedId),
    "gõ không dấu phải khớp bản ghi có dấu",
  );

  // Gõ CÓ dấu → khớp bản ghi KHÔNG dấu.
  const r2 = await searchSources("admin", projectId, "nghiệm thu", "nghiệm thu%");
  assert.ok(
    r2.some((h) => h.kind === "correspondence" && h.id === plainId),
    "gõ có dấu phải khớp bản ghi không dấu",
  );
});

test("project scope: 2 dự án không lẫn + bỏ bản ghi soft-delete", { skip }, async () => {
  const { insertId } = await import("@/lib/db");
  const { searchSources } = await import("@/lib/search");

  const a = await seedProject("scope-A");
  const b = await seedProject("scope-B");

  const idA = await seedCorrespondence(a.projectId, "Tài liệu zulu dự án A");
  const idB = await seedCorrespondence(b.projectId, "Tài liệu zulu dự án B");

  const inA = await searchSources("admin", a.projectId, "zulu", "zulu%");
  assert.ok(inA.some((h) => h.id === idA && h.kind === "correspondence"));
  assert.ok(!inA.some((h) => h.id === idB), "kết quả dự án A không được chứa bản ghi dự án B");

  // Soft-delete (contracts có deleted_at) — bản ghi đã xoá mềm không hiện.
  const liveContract = await insertId(
    `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'Hợp đồng yankee sống', ?)`,
    `HD-${Date.now()}-live`,
    a.projectId,
  );
  const deadContract = await insertId(
    `INSERT INTO contracts (code, kind, title, project_id, deleted_at)
       VALUES (?, 'nhan_thau', 'Hợp đồng yankee đã xoá', ?, NOW())`,
    `HD-${Date.now()}-dead`,
    a.projectId,
  );

  const contracts = await searchSources("admin", a.projectId, "yankee", "yankee%");
  assert.ok(contracts.some((h) => h.kind === "contract" && h.id === liveContract));
  assert.ok(
    !contracts.some((h) => h.kind === "contract" && h.id === deadContract),
    "bản ghi soft-delete không được trả về",
  );
});

test("phân quyền: engineer KHÔNG thấy nhóm contracts, admin thấy", { skip }, async () => {
  const { insertId } = await import("@/lib/db");
  const { searchSources } = await import("@/lib/search");
  const { projectId } = await seedProject("perm-contract");

  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'Hợp đồng xray đặc biệt', ?)`,
    `HD-${Date.now()}-perm`,
    projectId,
  );

  const asEngineer = await searchSources("engineer", projectId, "xray", "xray%");
  assert.ok(
    !asEngineer.some((h) => h.kind === "contract"),
    "engineer không được thấy nguồn contracts",
  );

  const asAdmin = await searchSources("admin", projectId, "xray", "xray%");
  assert.ok(
    asAdmin.some((h) => h.kind === "contract" && h.id === contractId),
    "admin phải thấy nguồn contracts",
  );
});

test("EXPLAIN xác nhận dùng index GIN idx_correspondences_fts", { skip }, async () => {
  const { query, withTransaction } = await import("@/lib/db");
  const { ftsExpr } = await import("@/lib/search");
  const { projectId } = await seedProject("explain-gin");

  // Seed đủ nhiều dòng để bảng không quá nhỏ.
  for (let i = 0; i < 60; i++) {
    await seedCorrespondence(projectId, `Công văn kiểm tra hạng mục số ${i} alpha bravo`);
  }
  await query(`ANALYZE correspondences`);

  // Biểu thức PHẢI trùng index (ftsExpr cột không alias, khớp migration 0064).
  const fts = ftsExpr(["code", "subject", "note"]);
  const plan = await withTransaction(async () => {
    // enable_seqscan=off → nếu biểu thức KHỚP index, planner chọn Bitmap Index Scan;
    // lệch biểu thức thì buộc phải seq scan/recheck khác → không thấy tên index.
    await query(`SET LOCAL enable_seqscan = off`);
    const rows = await query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT id FROM correspondences
          WHERE ${fts} @@ plainto_tsquery('simple', xboss_unaccent(?))`,
      "alpha",
    );
    return rows.map((r) => r["QUERY PLAN"]).join("\n");
  });

  assert.match(plan, /Bitmap Index Scan/, `plan không dùng bitmap index:\n${plan}`);
  assert.match(plan, /idx_correspondences_fts/, `plan không dùng đúng index GIN:\n${plan}`);
});
