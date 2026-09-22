import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test lịch sử thay đổi dòng BOQ (M124 việc 3, bảng `boq_item_history`).
//
// Ghi chú AC "import commit cập nhật 1 dòng đổi unit_price ⇒ 1 dòng lịch sử": `commitBoqImport`
// (lib/khoi-luong/boq-import.ts) hiện KHÔNG có nhánh cập nhật dòng đã tồn tại — mã trùng luôn
// bị coi là lỗi và bỏ qua (không ghi đè). Test dưới đây thay bằng ca khớp hành vi thật: import
// commit THÊM DÒNG MỚI ghi đúng 1 dòng lịch sử field='import'.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

type Ctx = { userId: number; pwHash: string; projectId: number };

async function dungDuLieu(role: string, ten: string): Promise<Ctx> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `BH ${ten}`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-bh', ?, 1)`,
    `BH ${ten}`,
    `bh-${ten}-${RUN}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return { userId, pwHash: u!.password_hash, projectId };
}

const req = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("PATCH /api/boq/:id: đổi qtyContract 10→12 ghi đúng 1 dòng lịch sử", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `qty${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Ống thép', 'm', 10, 1000, ?)`,
    `BHIST-QTY-${RUN}`,
    ctx.projectId,
  );
  await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/boq/[id]/route");

  const res = await PATCH(req(`http://localhost/api/boq/${boqId}`, { qtyContract: 12 }), {
    params: Promise.resolve({ id: String(boqId) }),
  });
  assert.equal(res.status, 200);

  const { lichSuBoq } = await import("@/lib/khoi-luong/boq-history");
  const rows = await lichSuBoq(boqId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field, "qty_contract");
  assert.equal(Number(rows[0].oldValue), 10);
  assert.equal(Number(rows[0].newValue), 12);
  assert.equal(rows[0].changedBy, ctx.userId);

  // Gửi lại đúng giá trị hiện tại (12) → không sinh thêm dòng nào (idempotent).
  const res2 = await PATCH(req(`http://localhost/api/boq/${boqId}`, { qtyContract: 12 }), {
    params: Promise.resolve({ id: String(boqId) }),
  });
  assert.equal(res2.status, 200);
  const rows2 = await lichSuBoq(boqId);
  assert.equal(rows2.length, 1, "PATCH giá trị cũ không được sinh thêm dòng lịch sử");
});

test(
  "PATCH /api/boq/:id: 2 PATCH đồng thời — old_value trong lịch sử KHÔNG được lỗi thời " +
    "(khoá FOR UPDATE trong transaction, không dùng bản đọc trước transaction)",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `race${RUN}`);
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Ống thép race', 'm', 10, 1000, ?)`,
      `BHIST-RACE-${RUN}`,
      ctx.projectId,
    );
    await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/boq/[id]/route");

    // Bắn 2 PATCH gần như đồng thời (không await tuần tự) — mô phỏng 2 người sửa cùng lúc.
    const p1 = PATCH(req(`http://localhost/api/boq/${boqId}`, { qtyContract: 20 }), {
      params: Promise.resolve({ id: String(boqId) }),
    });
    const p2 = PATCH(req(`http://localhost/api/boq/${boqId}`, { qtyContract: 30 }), {
      params: Promise.resolve({ id: String(boqId) }),
    });
    const [res1, res2] = await Promise.all([p1, p2]);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const { lichSuBoq } = await import("@/lib/khoi-luong/boq-history");
    const rows = await lichSuBoq(boqId); // mới nhất trước (ORDER BY changed_at DESC)
    assert.equal(rows.length, 2, "phải có đúng 2 dòng lịch sử — 1 cho mỗi PATCH");

    // Dù thứ tự commit là 20 trước/30 sau hay ngược lại, dòng lịch sử MỚI hơn phải có
    // old_value KHỚP ĐÚNG new_value của dòng lịch sử CŨ hơn (chuỗi nhân quả không đứt gãy).
    // Với lỗi cũ (đọc old_value trước khi mở transaction), 2 dòng đều ghi old_value='10'
    // — chuỗi bị đứt (dòng mới hơn không khớp dòng cũ hơn).
    assert.equal(
      Number(rows[0].oldValue),
      Number(rows[1].newValue),
      "old_value của lần PATCH commit sau phải khớp new_value của lần PATCH commit trước",
    );

    const item = await queryOne<{ qty_contract: number }>(
      `SELECT qty_contract FROM boq_items WHERE id = ?`,
      boqId,
    );
    assert.equal(Number(item!.qty_contract), Number(rows[0].newValue));
  },
);

test(
  "PATCH /api/boq/:id: giá trị số dạng chuỗi khác nhưng cùng số (10 vs 10.000) không sinh dòng lịch sử",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `same${RUN}`);
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Ống thép 2', 'm', 10, 1000, ?)`,
      `BHIST-SAME-${RUN}`,
      ctx.projectId,
    );
    await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/boq/[id]/route");
    // qty_contract lưu NUMERIC(15,3) = '10.000' trong DB; gửi lại 10 phải coi là KHÔNG đổi.
    const res = await PATCH(req(`http://localhost/api/boq/${boqId}`, { qtyContract: 10 }), {
      params: Promise.resolve({ id: String(boqId) }),
    });
    assert.equal(res.status, 200);
    const { lichSuBoq } = await import("@/lib/khoi-luong/boq-history");
    const rows = await lichSuBoq(boqId);
    assert.equal(rows.length, 0);
  },
);

test("import commit thêm dòng mới → ghi 1 dòng lịch sử field='import'", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `imp${RUN}`);
  const systemId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ import')`,
    `SIMP${RUN}`,
  );
  const { commitBoqImport } = await import("@/lib/khoi-luong/boq-import");
  const result = await commitBoqImport(
    [
      {
        rowIndex: 0,
        code: `BHIST-IMP-${RUN}`,
        name: "Dòng import",
        unit: "m",
        qtyContract: 5,
        unitPrice: 20000,
        note: null,
      },
    ],
    systemId,
    "simp",
    ctx.projectId,
    1,
    ctx.userId,
  );
  assert.equal(result.inserted, 1);
  assert.equal(result.skipped, 0);

  const item = await queryOne<{ id: number }>(
    `SELECT id FROM boq_items WHERE code = ?`,
    `BHIST-IMP-${RUN}`,
  );
  assert.ok(item);
  const { lichSuBoq } = await import("@/lib/khoi-luong/boq-history");
  const rows = await lichSuBoq(item!.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field, "import");
  assert.equal(rows[0].oldValue, null);
  assert.equal(rows[0].newValue, `BHIST-IMP-${RUN}`);
  assert.equal(rows[0].changedBy, ctx.userId);
});

test("DELETE /api/boq/:id: xoá dòng BOQ cascade xoá luôn lịch sử", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `del${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Xoá', 'm', 10, 1000, ?)`,
    `BHIST-DEL-${RUN}`,
    ctx.projectId,
  );
  const { ghiLichSuBoq, lichSuBoq } = await import("@/lib/khoi-luong/boq-history");
  await ghiLichSuBoq(boqId, [{ field: "note", oldValue: null, newValue: "abc" }], ctx.userId);
  assert.equal((await lichSuBoq(boqId)).length, 1);

  await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  const res = await DELETE(req(`http://localhost/api/boq/${boqId}`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(boqId) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const soDong = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM boq_item_history WHERE boq_item_id = ?`,
    boqId,
  );
  assert.equal(soDong!.n, 0, "xoá dòng BOQ phải cascade xoá lịch sử");
});

test("GET /api/boq/:id/history: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/[id]/history/route");
  const res = await GET(req("http://localhost/api/boq/1/history", undefined, "GET"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/boq/:id/history: dòng BOQ của dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `histisoA${RUN}`);
  const b = await dungDuLieu("pm", `histisoB${RUN}`);
  const boqIdB = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Của B', 'm', 10, 1000, ?)`,
    `BHIST-ISOB-${RUN}`,
    b.projectId,
  );
  await dangNhapDuAn({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { GET } = await import("@/app/api/boq/[id]/history/route");
  const res = await GET(req(`http://localhost/api/boq/${boqIdB}/history`, undefined, "GET"), {
    params: Promise.resolve({ id: String(boqIdB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/boq/:id/history: viewer (không có quyền sửa) vẫn xem được lịch sử", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const pm = await dungDuLieu("pm", `histview-pm${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Xem', 'm', 10, 1000, ?)`,
    `BHIST-VIEW-${RUN}`,
    pm.projectId,
  );
  const { ghiLichSuBoq } = await import("@/lib/khoi-luong/boq-history");
  await ghiLichSuBoq(boqId, [{ field: "note", oldValue: null, newValue: "x" }], pm.userId);

  // Viewer thuộc cùng dự án pm (không tự tạo dự án riêng như dungDuLieu, chỉ cần user).
  const viewerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-bh', 'viewer', 1)`,
    `BH viewer ${RUN}`,
    `bh-viewer-${RUN}@test.local`,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    viewerId,
  );
  // Gán viewer vào đúng dự án của pm — không dựa vào fallback "user_projects rỗng ⇒ thấy hết"
  // của visibleProjectIds, vì bảng đó có thể đã có dòng từ test khác chạy chung tiến trình.
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`,
    viewerId,
    pm.projectId,
  );
  await dangNhapDuAn({ id: viewerId, passwordHash: u!.password_hash }, pm.projectId);
  const { GET } = await import("@/app/api/boq/[id]/history/route");
  const res = await GET(req(`http://localhost/api/boq/${boqId}/history`, undefined, "GET"), {
    params: Promise.resolve({ id: String(boqId) }),
  });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.rows.length, 1);
  assert.equal(j.rows[0].field, "note");
  assert.equal(j.rows[0].changedByName, `BH histview-pm${RUN}`);
});
