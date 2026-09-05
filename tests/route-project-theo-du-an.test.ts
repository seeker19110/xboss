import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";

// Test THỰC THI route handler thật cho `app/api/project/route.ts` (Đợt 6, Việc H).
// Lỗi được vá: route thao tác trên dòng `projects` có id NHỎ NHẤT toàn DB thay vì dự án đang
// chọn ⇒ Admin/PM của bất kỳ dự án nào ghi đè được logo + tiêu đề heatmap của dự án đầu tiên.
// Sau khi vá: PATCH đi theo `getCurrentProjectId(user)`; GET vẫn PUBLIC và giữ fallback
// "dự án đầu tiên" khi không có phiên / chưa chọn dự án (trang /login cần fallback này).

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO projects (name, code, heatmap_title, org_id) VALUES (?, ?, ?, ?)`,
    `H ${uniq(ten)}`,
    `H${uniq(ten)}`,
    `Heatmap ${uniq(ten)}`,
    orgId,
  );
}

async function taoTem(): Promise<number> {
  // Tổ chức phụ — dùng cho ca "user không thuộc org của dự án đang chọn".
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `H Org ${uniq("org")}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-h-project', ?, ?)`,
    `H ${ten}`,
    `h-${uniq(ten)}@test.local`,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId };
}

async function docDuAn(id: number): Promise<{ heatmap_title: string | null; logo: string | null }> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ heatmap_title: string | null; logo: string | null }>(
    `SELECT heatmap_title, logo FROM projects WHERE id = ?`,
    id,
  );
  return r!;
}

// ── PATCH ────────────────────────────────────────────────────────────────────────────────

test("PATCH /api/project: PM dự án A đổi heatmapTitle → chỉ dòng A đổi, dòng B nguyên vẹn", S, async () => {
  // B tạo TRƯỚC A nên id(B) < id(A): trên code chưa vá, UPDATE rơi vào dự án id nhỏ nhất
  // toàn DB (không bao giờ là A) ⇒ ca này ĐỎ.
  const duAnB = await taoDuAn("B");
  const duAnA = await taoDuAn("A");
  const truocB = await docDuAn(duAnB);
  const pm = await taoUser("pm", "pmA");
  await dangNhapDuAn(pm, duAnA);

  const { PATCH } = await import("@/app/api/project/route");
  const tieuDe = `Tiêu đề mới ${uniq("t")}`;
  const res = await PATCH(
    new Request("http://localhost/api/project", {
      method: "PATCH",
      body: JSON.stringify({ heatmapTitle: tieuDe }),
    }),
  );
  assert.equal(res.status, 200);

  const sauA = await docDuAn(duAnA);
  const sauB = await docDuAn(duAnB);
  assert.equal(sauA.heatmap_title, tieuDe);
  assert.equal(sauB.heatmap_title, truocB.heatmap_title);
});

test("PATCH /api/project: PM dự án A đổi logo → chỉ dòng A đổi", S, async () => {
  const duAnB = await taoDuAn("B2");
  const duAnA = await taoDuAn("A2");
  const pm = await taoUser("pm", "pmA2");
  await dangNhapDuAn(pm, duAnA);

  const { PATCH } = await import("@/app/api/project/route");
  const logo = "data:image/png;base64,iVBORw0KGgo=";
  const res = await PATCH(
    new Request("http://localhost/api/project", {
      method: "PATCH",
      body: JSON.stringify({ logo }),
    }),
  );
  assert.equal(res.status, 200);
  assert.equal((await docDuAn(duAnA)).logo, logo);
  assert.equal((await docDuAn(duAnB)).logo, null);
});

test("PATCH /api/project: logo sai định dạng → 400, không dòng nào đổi", S, async () => {
  const duAnA = await taoDuAn("A3");
  const pm = await taoUser("pm", "pmA3");
  await dangNhapDuAn(pm, duAnA);

  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/api/project", {
      method: "PATCH",
      body: JSON.stringify({ logo: "http://vi-du/anh.png" }),
    }),
  );
  assert.equal(res.status, 400);
  assert.equal((await docDuAn(duAnA)).logo, null);
});

test("PATCH /api/project: user chưa chọn được dự án nào → 422, không dòng nào đổi", S, async () => {
  // PM thuộc tổ chức khác nhưng cookie trỏ dự án org 1 → getCurrentProjectId trả null.
  const duAnA = await taoDuAn("A4");
  const truoc = await docDuAn(duAnA);
  const orgKhac = await taoTem();
  const pm = await taoUser("pm", "pmOrgKhac", orgKhac);
  await dangNhapDuAn(pm, duAnA);

  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/api/project", {
      method: "PATCH",
      body: JSON.stringify({ heatmapTitle: "không được ghi" }),
    }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "Chưa có dự án nào để cập nhật");
  assert.deepEqual(await docDuAn(duAnA), truoc);
});

test("PATCH /api/project: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/api/project", {
      method: "PATCH",
      body: JSON.stringify({ heatmapTitle: "x" }),
    }),
  );
  assert.equal(res.status, 401);
});

test("PATCH /api/project: sai vai trò (engineer) → 403", S, async () => {
  const duAnA = await taoDuAn("A5");
  const ks = await taoUser("engineer", "ks");
  await dangNhapDuAn(ks, duAnA);

  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/api/project", {
      method: "PATCH",
      body: JSON.stringify({ heatmapTitle: "x" }),
    }),
  );
  assert.equal(res.status, 403);
});

// ── GET ──────────────────────────────────────────────────────────────────────────────────

test("GET /api/project: KHÔNG phiên → vẫn 200, trả dự án đầu tiên (fallback cho /login)", S, async () => {
  await taoDuAn("Get1");
  dangXuat();
  const { queryOne } = await import("@/lib/db");
  const dau = await queryOne<{ name: string }>(`SELECT name FROM projects ORDER BY id LIMIT 1`);

  const { GET } = await import("@/app/api/project/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.name, dau!.name);
});

test("GET /api/project: có phiên đang chọn dự án B → trả tên/mã của B, không phải A", S, async () => {
  const duAnA = await taoDuAn("GetA");
  const duAnB = await taoDuAn("GetB");
  const pm = await taoUser("pm", "pmGet");
  await dangNhapDuAn(pm, duAnA); // gán cả A và B cho user, rồi chọn B
  await dangNhapDuAn(pm, duAnB);

  const { queryOne } = await import("@/lib/db");
  const b = await queryOne<{ name: string; code: string | null; heatmap_title: string | null }>(
    `SELECT name, code, heatmap_title FROM projects WHERE id = ?`,
    duAnB,
  );

  const { GET } = await import("@/app/api/project/route");
  const body = await (await GET()).json();
  assert.equal(body.name, b!.name);
  assert.equal(body.code, b!.code);
  assert.equal(body.project.heatmapTitle, b!.heatmap_title);
});

test("GET /api/project: có phiên nhưng chưa chọn được dự án → fallback dự án đầu tiên", S, async () => {
  const orgKhac = await taoTem();
  const pm = await taoUser("pm", "pmGetOrg", orgKhac);
  dangNhap(pm); // không cookie dự án
  const { queryOne } = await import("@/lib/db");
  const dau = await queryOne<{ name: string }>(`SELECT name FROM projects ORDER BY id LIMIT 1`);

  const { GET } = await import("@/app/api/project/route");
  const body = await (await GET()).json();
  assert.equal(body.name, dau!.name);
});
