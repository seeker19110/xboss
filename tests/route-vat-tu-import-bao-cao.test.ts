import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

// AUD-TEST-001: /api/materials/import (414 dòng, ghi vật tư) và /api/materials/reports chưa có
// test nào. Phủ ranh giới quyền + phạm vi dự án qua route handler thật, kèm hồi quy cho lỗi
// sheet mặc định lấy chéo dự án (import gắn vật tư vào sheet của dự án/org khác).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

type Ctx = { userId: number; pwHash: string; projectId: number; sheetTypeId: number };

async function dungDuAn(role: string, systemId: number | null): Promise<Ctx> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("VT import "));
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'T')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet VT', ?)`,
    towerId,
    uniq("VTI"),
    systemId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-vt-import', ?, 1)`,
    uniq("VT "),
    `${uniq("vt")}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return { userId, pwHash: u!.password_hash, projectId, sheetTypeId };
}

async function fileVatTu(boq: string): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data-BOQ");
  ws.addRow(["Mã BOQ", "STT", "Mô tả", "Quy cách", "ĐVT", "KL BOQ", "Định mức", "", "Ghi chú"]);
  ws.addRow([boq, 1, "Ống thép D50", "", "m", 100, 110, "", ""]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new File([buf], "vat-tu.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function formReq(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest("http://localhost/api/materials/import", { method: "POST", body: fd });
}

test("POST /api/materials/import: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/materials/import/route");
  const res = await POST(formReq({}));
  assert.equal(res.status, 401);
});

test("POST /api/materials/import: viewer → 403; thiếu file / thiếu hệ → 400", S, async () => {
  const viewer = await dungDuAn("viewer", null);
  await dangNhapDuAn({ id: viewer.userId, passwordHash: viewer.pwHash }, viewer.projectId);
  const { POST } = await import("@/app/api/materials/import/route");
  assert.equal((await POST(formReq({}))).status, 403);

  const eng = await dungDuAn("engineer", null);
  await dangNhapDuAn({ id: eng.userId, passwordHash: eng.pwHash }, eng.projectId);
  assert.equal((await POST(formReq({ systemId: String(eng.sheetTypeId) }))).status, 400);
  assert.equal((await POST(formReq({ file: await fileVatTu(uniq("B")) }))).status, 400);
});

test(
  "POST /api/materials/import: sheetId của dự án khác → 400, không ghi vật tư (AUD-SEC-006b)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const a = await dungDuAn("engineer", null);
    const b = await dungDuAn("engineer", null);
    await dangNhapDuAn({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
    const { POST } = await import("@/app/api/materials/import/route");
    const boq = uniq("IMPX");
    const res = await POST(
      formReq({ file: await fileVatTu(boq), systemId: String(b.sheetTypeId) }),
    );
    assert.equal(res.status, 400);
    const n = await queryOne<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM materials WHERE sheet_type_id = ?`,
      b.sheetTypeId,
    );
    assert.equal(n?.c, 0);
  },
);

test(
  "POST /api/materials/import: theo hệ — vật tư không gắn sheet của dự án khác (AUD-SEC-006b)",
  S,
  async () => {
    const { query, queryOne, insertId } = await import("@/lib/db");
    const systemId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ test import')`,
      uniq("SYS"),
    );
    // Dự án B có sheet của hệ được tạo TRƯỚC (id nhỏ hơn) — bẫy ORDER BY id LIMIT 1 toàn hệ.
    const b = await dungDuAn("engineer", systemId);
    const a = await dungDuAn("engineer", systemId);
    await dangNhapDuAn({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
    const { POST } = await import("@/app/api/materials/import/route");
    const boq = uniq("IMPS");
    const res = await POST(formReq({ file: await fileVatTu(boq), systemId: String(systemId) }));
    assert.ok(res.status < 300, `import phải thành công, nhận ${res.status}`);
    const rows = await query<{ sheet_type_id: number | null; project_id: number }>(
      `SELECT sheet_type_id, project_id FROM materials WHERE boq_code = ?`,
      boq,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].project_id, a.projectId);
    assert.notEqual(rows[0].sheet_type_id, b.sheetTypeId, "không được gắn sheet của dự án B");
    assert.equal(rows[0].sheet_type_id, a.sheetTypeId);
    void queryOne;
  },
);

test(
  "GET /api/materials/reports: 401; đúng dự án → 200 và không lẫn vật tư dự án khác",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    dangXuat();
    const { GET } = await import("@/app/api/materials/reports/route");
    assert.equal((await GET()).status, 401);

    const a = await dungDuAn("pm", null);
    const b = await dungDuAn("pm", null);
    const tenB = uniq("Vật tư bí mật B ");
    await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, qty_planned, qty_used, sort_order, project_id)
     VALUES (?, ?, 'kg', 1, 5, 1, ?)`,
      b.sheetTypeId,
      tenB,
      b.projectId,
    );
    await dangNhapDuAn({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
    const res = await GET();
    assert.equal(res.status, 200);
    assert.ok(!JSON.stringify(await res.json()).includes(tenB), "báo cáo lộ vật tư dự án khác");
  },
);
