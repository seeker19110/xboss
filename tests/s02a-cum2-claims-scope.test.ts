import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S02a cụm 2 (A1-AC02/AC03): claim + tài liệu claim/hợp đồng.
// Gọi route thật. Mỗi route 3 ca: user không có dự án khả kiến → 404; id thuộc dự án khác
// cùng org → 404 (DELETE: dòng còn nguyên); đúng dự án → như cũ.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let seq = 0;

type U = { id: number; passwordHash: string };
const ctx = {} as {
  pA: number;
  pB: number;
  userA: U; // pm, gán dự án A
  userNone: U; // pm, không gán dự án nào
  claimB: number;
  claimA: number;
  claimDocB: number;
  claimDocA: number;
  contractB: number;
  contractA: number;
};

async function taoUser(role: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02a', ?, 1)`,
    `S02a cụm 2 ${RUN}`,
    `s02a-cum2-${RUN}-${++seq}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-s02a" };
}

async function taoClaim(projectId: number, tag: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, amount_requested, status)
     VALUES (?, ?, 'cost', 'Claim scope', '2026-07-01', 'Nguyên nhân', 1000000, 'notice')`,
    projectId,
    `CLM-S02A-${RUN}-${tag}`,
  );
}

async function taoClaimDoc(claimId: number) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO claim_documents (claim_id, title, file_name, original_name, mime_type, size_bytes)
     VALUES (?, 'Hồ sơ', ?, 'a.pdf', 'application/pdf', 1)`,
    claimId,
    `s02a-${RUN}-${++seq}.pdf`,
  );
}

async function taoHopDong(projectId: number, tag: string) {
  const { insertId } = await import("@/lib/db");
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, value, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ scope', 0, 'active', ?)`,
    `HD-S02A-${RUN}-${tag}`,
    projectId,
  );
  return contractId;
}

async function taoContractDoc(contractId: number, uploadedBy: number) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contract_documents (contract_id, file_name, mime_type, uploaded_by)
     VALUES (?, ?, 'application/pdf', ?)`,
    contractId,
    `s02a-hd-${RUN}-${++seq}.pdf`,
    uploadedBy,
  );
}

const req = (url: string, method = "GET") => new NextRequest(`http://localhost${url}`, { method });
const p = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02a A ${RUN}`);
  ctx.pB = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02a B ${RUN}`);
  ctx.userA = await taoUser("pm");
  ctx.userNone = await taoUser("pm");
  // Gán userA vào A ⇒ user_projects khác rỗng ⇒ userNone (không gán) không thấy dự án nào.
  await dangNhapDuAn(ctx.userA, ctx.pA);
  ctx.claimA = await taoClaim(ctx.pA, "A");
  ctx.claimB = await taoClaim(ctx.pB, "B");
  ctx.claimDocA = await taoClaimDoc(ctx.claimA);
  ctx.claimDocB = await taoClaimDoc(ctx.claimB);
  ctx.contractA = await taoHopDong(ctx.pA, "A");
  ctx.contractB = await taoHopDong(ctx.pB, "B");
});

const asNone = () => dangNhapDuAn(ctx.userNone, null);
const asA = () => dangNhapDuAn(ctx.userA, ctx.pA);

test("GET /api/claims: không dự án khả kiến → 404; chỉ trả claim dự án đang chọn", S, async () => {
  const { GET } = await import("@/app/api/claims/route");
  await asNone();
  assert.equal((await GET(req("/api/claims"))).status, 404);

  await asA();
  const res = await GET(req("/api/claims"));
  assert.equal(res.status, 200);
  const ids = ((await res.json()).items as { id: number }[]).map((c) => c.id);
  assert.ok(ids.includes(ctx.claimA), "đúng dự án → thấy claim A");
  assert.ok(!ids.includes(ctx.claimB), "không lộ claim dự án B");
});

test("GET /api/claims/:id: không dự án → 404; dự án khác → 404; đúng dự án → 200", S, async () => {
  const { GET } = await import("@/app/api/claims/[id]/route");
  await asNone();
  assert.equal((await GET(req("/x"), p(ctx.claimB))).status, 404);
  await asA();
  assert.equal((await GET(req("/x"), p(ctx.claimB))).status, 404);
  const ok = await GET(req("/x"), p(ctx.claimA));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).claim.id, ctx.claimA);
});

test("DELETE /api/claims/:id: không dự án/dự án khác → 404, claim không bị xoá", S, async () => {
  const { DELETE } = await import("@/app/api/claims/[id]/route");
  const { queryOne } = await import("@/lib/db");
  // Claim riêng: code cũ xoá mềm được nó — không để ảnh hưởng các ca khác.
  const claimB2 = await taoClaim(ctx.pB, "B2");
  await asNone();
  assert.equal((await DELETE(req("/x", "DELETE"), p(claimB2))).status, 404);
  await asA();
  assert.equal((await DELETE(req("/x", "DELETE"), p(claimB2))).status, 404);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM claims WHERE id = ?`,
    claimB2,
  );
  assert.equal(row!.deleted_at, null);
});

test(
  "GET /api/claims/:id/documents: không dự án/dự án khác → 404; đúng dự án → 200",
  S,
  async () => {
    const { GET } = await import("@/app/api/claims/[id]/documents/route");
    await asNone();
    assert.equal((await GET(req("/x"), p(ctx.claimB))).status, 404);
    await asA();
    assert.equal((await GET(req("/x"), p(ctx.claimB))).status, 404);
    const ok = await GET(req("/x"), p(ctx.claimA));
    assert.equal(ok.status, 200);
    const ids = ((await ok.json()).documents as { id: number }[]).map((d) => d.id);
    assert.deepEqual(ids, [ctx.claimDocA]);
  },
);

test(
  "GET /api/claim-documents/:id: không dự án/dự án khác → 404; đúng dự án qua scope",
  S,
  async () => {
    const { GET } = await import("@/app/api/claim-documents/[id]/route");
    await asNone();
    const none = await GET(req("/x"), p(ctx.claimDocB));
    assert.equal(none.status, 404);
    assert.equal((await none.json()).error, "Không tìm thấy tài liệu");
    await asA();
    const other = await GET(req("/x"), p(ctx.claimDocB));
    assert.equal(other.status, 404);
    assert.equal((await other.json()).error, "Không tìm thấy tài liệu");
    // Đúng dự án: qua được kiểm scope, tới bước đọc file (file test không có trên đĩa).
    const ok = await GET(req("/x"), p(ctx.claimDocA));
    assert.equal(ok.status, 404);
    assert.equal((await ok.json()).error, "File không còn trên đĩa");
  },
);

test(
  "DELETE /api/claim-documents/:id: không dự án/dự án khác → 404, dòng còn nguyên",
  S,
  async () => {
    const { DELETE } = await import("@/app/api/claim-documents/[id]/route");
    const { queryOne } = await import("@/lib/db");
    const docB = await taoClaimDoc(ctx.claimB);
    await asNone();
    assert.equal((await DELETE(req("/x", "DELETE"), p(docB))).status, 404);
    await asA();
    assert.equal((await DELETE(req("/x", "DELETE"), p(docB))).status, 404);
    assert.ok(await queryOne(`SELECT id FROM claim_documents WHERE id = ?`, docB));

    const docA = await taoClaimDoc(ctx.claimA);
    const ok = await DELETE(req("/x", "DELETE"), p(docA));
    assert.equal(ok.status, 200);
    assert.equal(await queryOne(`SELECT id FROM claim_documents WHERE id = ?`, docA), undefined);
  },
);

test(
  "GET /api/contract-documents/:id: không dự án/dự án khác → 404; đúng dự án qua scope",
  S,
  async () => {
    const { GET } = await import("@/app/api/contract-documents/[id]/route");
    const docB = await taoContractDoc(ctx.contractB, ctx.userA.id);
    const docA = await taoContractDoc(ctx.contractA, ctx.userA.id);
    await asNone();
    const none = await GET(req("/x"), p(docB));
    assert.equal(none.status, 404);
    assert.equal((await none.json()).error, "Không tìm thấy tài liệu");
    await asA();
    const other = await GET(req("/x"), p(docB));
    assert.equal(other.status, 404);
    assert.equal((await other.json()).error, "Không tìm thấy tài liệu");
    const ok = await GET(req("/x"), p(docA));
    assert.equal(ok.status, 404);
    assert.equal((await ok.json()).error, "File không còn trên đĩa");
  },
);

test(
  "DELETE /api/contract-documents/:id: không dự án/dự án khác → 404, dòng còn nguyên",
  S,
  async () => {
    const { DELETE } = await import("@/app/api/contract-documents/[id]/route");
    const { queryOne } = await import("@/lib/db");
    const docB = await taoContractDoc(ctx.contractB, ctx.userNone.id);
    await asNone();
    assert.equal((await DELETE(req("/x", "DELETE"), p(docB))).status, 404);
    const docB2 = await taoContractDoc(ctx.contractB, ctx.userA.id);
    await asA();
    assert.equal((await DELETE(req("/x", "DELETE"), p(docB2))).status, 404);
    assert.ok(await queryOne(`SELECT id FROM contract_documents WHERE id = ?`, docB));
    assert.ok(await queryOne(`SELECT id FROM contract_documents WHERE id = ?`, docB2));

    const docA = await taoContractDoc(ctx.contractA, ctx.userA.id);
    const ok = await DELETE(req("/x", "DELETE"), p(docA));
    assert.equal(ok.status, 200);
    assert.equal(await queryOne(`SELECT id FROM contract_documents WHERE id = ?`, docA), undefined);
  },
);
