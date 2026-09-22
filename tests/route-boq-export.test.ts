import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

// Test route thật cho GET /api/boq/export (M124 việc 2): xuất Excel danh sách BOQ, cột
// tiền chỉ hiện với PAYMENT_VIEW_ROLES (lib/bao-mat/auth.ts).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

type Ctx = { userId: number; pwHash: string; projectId: number };

/** Dựng 1 dự án + tháp + sheet + nhóm + task + dòng BOQ có map (để cột thực hiện > 0) + user. */
async function dungDuLieu(role: string, ten: string): Promise<Ctx> {
  const { insertId, run, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `BX export ${ten}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp BX')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet BX')`,
    towerId,
    `BXE${ten}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'B1', 'Nhóm BX')`,
    sheetTypeId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'B1,01', 'Task BX', 0.5)`,
    packageId,
  );
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Ống thép BX', 'm', 100, 50000, ?)`,
    `BOQEXP-${ten}-${RUN}`,
    projectId,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqId,
    taskId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-bx-export', ?, 1)`,
    `BX ${ten}`,
    `bx-${ten}-${RUN}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return { userId, pwHash: u!.password_hash, projectId };
}

test("GET /api/boq/export: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/export/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test(
  "GET /api/boq/export: Admin tải được, có header + 1 dòng dữ liệu, cột Đơn giá có số",
  S,
  async () => {
    const ctx = await dungDuLieu("admin", `admin${RUN}`);
    await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { GET } = await import("@/app/api/boq/export/route");
    const res = await GET();
    assert.equal(res.status, 200);
    assert.match(
      res.headers.get("content-type") ?? "",
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
    );
    assert.match(res.headers.get("content-disposition") ?? "", /\.xlsx"/);

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("BOQ");
    assert.ok(ws, "phải có sheet BOQ");
    assert.equal(ws!.getRow(1).getCell(1).value, "Mã BOQ");
    assert.ok(ws!.rowCount >= 2, "phải có ít nhất 1 dòng dữ liệu sau header");
    const dataRow = ws!.getRow(2);
    assert.match(String(dataRow.getCell(1).value), /^BOQEXP-/);
    assert.equal(dataRow.getCell(6).value, 50000, "Admin phải thấy đơn giá");
    assert.ok(Number(dataRow.getCell(7).value) > 0, "Admin phải thấy thành tiền");
  },
);

test("GET /api/boq/export: viewer tải được nhưng cột Đơn giá/Thành tiền rỗng", S, async () => {
  const ctx = await dungDuLieu("viewer", `viewer${RUN}`);
  await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { GET } = await import("@/app/api/boq/export/route");
  const res = await GET();
  assert.equal(res.status, 200);

  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("BOQ")!;
  const dataRow = ws.getRow(2);
  assert.match(String(dataRow.getCell(1).value), /^BOQEXP-/);
  assert.ok(
    dataRow.getCell(6).value === null || dataRow.getCell(6).value === "",
    "viewer không được thấy đơn giá",
  );
  assert.ok(
    dataRow.getCell(7).value === null || dataRow.getCell(7).value === "",
    "viewer không được thấy thành tiền",
  );
  // KL thực hiện / % thực hiện / số task map vẫn hiện đủ cho mọi vai trò.
  assert.ok(Number(dataRow.getCell(8).value) > 0, "viewer vẫn thấy KL thực hiện");
  assert.equal(dataRow.getCell(10).value, 1, "viewer vẫn thấy số task map");
});
