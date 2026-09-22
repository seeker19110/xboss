import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { boDauThuong, diemGiongTen } from "@/lib/nen/van-ban";

// M124 việc 1 — gợi ý task theo TẦNG để thêm nhanh vào map dòng BOQ.
const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

test("boDauThuong: bỏ dấu, hạ chữ, đ→d, gộp khoảng trắng", () => {
  assert.equal(boDauThuong("  Ống   Gió Tầng 5  "), "ong gio tang 5");
  assert.equal(boDauThuong("Đường ống"), "duong ong");
});

test("diemGiongTen: tên cùng việc phải giống hơn tên khác hệ (AC4)", () => {
  const giong = diemGiongTen("Ống gió tầng 5", "Lắp ống gió T5");
  const khac = diemGiongTen("Ống gió tầng 5", "Cáp điện");
  assert.ok(giong > khac, `${giong} phải > ${khac}`);
  assert.equal(khac, 0);
  assert.equal(diemGiongTen("Ống gió", "Ống gió"), 1);
  assert.equal(diemGiongTen("", "Ống gió"), 0);
});

type Ctx = {
  projectId: number;
  boqIdA: number;
  boqIdKhongHe: number;
  taskA: number;
  taskB: number;
  taskDaMap: number;
  admin: { id: number; pwHash: string };
  engineer: { id: number; pwHash: string };
};

/** Dựng 1 dự án: tầng 5F có 2 nhóm hệ A + 1 nhóm hệ B; 1 tầng khác để kiểm sort tầng. */
async function dungDuLieu(): Promise<Ctx> {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `MT ${RUN}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp MT')`,
    projectId,
  );
  const sysA = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ ống gió MT')`,
    `MTA${RUN}`,
  );
  const sysB = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ điện MT')`,
    `MTB${RUN}`,
  );
  const stA = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet hệ A', ?)`,
    towerId,
    `MTSA${RUN}`,
    sysA,
  );
  const stB = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet hệ B', ?)`,
    towerId,
    `MTSB${RUN}`,
    sysB,
  );
  const pkgA1 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A1', 'Nhóm A1', '5F')`,
    stA,
  );
  const pkgA2 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A2', 'Nhóm A2', '5F')`,
    stA,
  );
  const pkgB1 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'B1', 'Nhóm B1', '5F')`,
    stB,
  );
  // Tầng khác để `floors` có nhiều phần tử: RF phải đứng trước 5F và B1F (sortFloorsDesc).
  await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A3', 'Nhóm mái', 'RF')`,
    stA,
  );
  await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A4', 'Nhóm hầm', 'B1F')`,
    stA,
  );

  const taskA = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'A1,01', 'Lắp ống gió T5', 0.5)`,
    pkgA1,
  );
  const taskDaMap = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, 'A2,01', 'Ống gió tầng 5 nhánh 2')`,
    pkgA2,
  );
  const taskB = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, 'B1,01', 'Cáp điện')`,
    pkgB1,
  );

  const boqIdA = await insertId(
    `INSERT INTO boq_items (project_id, code, name, unit, system_id) VALUES (?, ?, 'Ống gió tầng 5', 'm', ?)`,
    projectId,
    `MTBOQ-A-${RUN}`,
    sysA,
  );
  const boqIdKhongHe = await insertId(
    `INSERT INTO boq_items (project_id, code, name, unit) VALUES (?, ?, 'Ống gió tầng 5', 'm')`,
    projectId,
    `MTBOQ-N-${RUN}`,
  );
  // taskDaMap đã nằm trong map của một dòng BOQ KHÁC ⇒ phải báo daMapDongKhac (AC3).
  const boqKhac = await insertId(
    `INSERT INTO boq_items (project_id, code, name, unit) VALUES (?, ?, 'Dòng khác', 'm')`,
    projectId,
    `MTBOQ-K-${RUN}`,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqKhac,
    taskDaMap,
  );

  async function taoUser(role: string): Promise<{ id: number; pwHash: string }> {
    const id = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-mt', ?, 1)`,
      `MT ${role}`,
      `mt-${role}-${RUN}@test.local`,
      role,
    );
    const u = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      id,
    );
    return { id, pwHash: u!.password_hash };
  }

  return {
    projectId,
    boqIdA,
    boqIdKhongHe,
    taskA,
    taskB,
    taskDaMap,
    admin: await taoUser("admin"),
    engineer: await taoUser("engineer"),
  };
}

function goi(id: number, floor?: string) {
  const url = `http://localhost/api/boq/${id}/tasks-theo-tang${floor ? `?floor=${encodeURIComponent(floor)}` : ""}`;
  return { req: new NextRequest(url), ctx: { params: Promise.resolve({ id: String(id) }) } };
}

test("GET tasks-theo-tang: lọc theo hệ + tầng, cờ đã map, quyền và phạm vi dự án", S, async () => {
  const { GET } = await import("@/app/api/boq/[id]/tasks-theo-tang/route");
  const { insertId } = await import("@/lib/db");
  const c = await dungDuLieu();

  // AC1 — chưa đăng nhập ⇒ 401
  dangXuat();
  {
    const { req, ctx } = goi(c.boqIdA, "5F");
    assert.equal((await GET(req, ctx)).status, 401);
  }

  // AC1 — engineer không có quyền sửa map ⇒ 403
  await dangNhapDuAn({ id: c.engineer.id, passwordHash: c.engineer.pwHash }, c.projectId);
  {
    const { req, ctx } = goi(c.boqIdA, "5F");
    assert.equal((await GET(req, ctx)).status, 403);
  }

  await dangNhapDuAn({ id: c.admin.id, passwordHash: c.admin.pwHash }, c.projectId);

  // AC5 — floors sắp giảm dần (RF → 5F → B1F); thiếu floor ⇒ tasks rỗng
  {
    const { req, ctx } = goi(c.boqIdA);
    const res = await GET(req, ctx);
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.deepEqual(j.floors, ["RF", "5F", "B1F"]);
    assert.deepEqual(j.tasks, []);
  }

  // AC2 — dòng BOQ hệ A ⇒ chỉ task hệ A; AC3 — cờ daMapDongKhac
  {
    const { req, ctx } = goi(c.boqIdA, "5F");
    const j = await (await GET(req, ctx)).json();
    const ids = j.tasks.map((t: { id: number }) => t.id);
    assert.deepEqual([...ids].sort(), [c.taskA, c.taskDaMap].sort());
    assert.ok(!ids.includes(c.taskB));
    // Xếp theo độ giống tên giảm dần: "Ống gió tầng 5 nhánh 2" giống hơn "Lắp ống gió T5".
    assert.equal(j.tasks[0].id, c.taskDaMap);
    assert.equal(j.tasks[0].daMapDongKhac, true);
    assert.equal(j.tasks[1].daMapDongKhac, false);
    assert.equal(j.tasks[0].pkgCode, "A2");
    assert.equal(j.tasks[0].sheetName, "Sheet hệ A");
  }

  // AC2 — dòng BOQ chưa gán hệ ⇒ mọi hệ (có cả task hệ B)
  {
    const { req, ctx } = goi(c.boqIdKhongHe, "5F");
    const j = await (await GET(req, ctx)).json();
    assert.equal(j.tasks.length, 3);
    assert.ok(j.tasks.some((t: { id: number }) => t.id === c.taskB));
  }

  // AC1 — dòng BOQ của dự án khác ⇒ 404
  {
    const duAnKhac = await insertId(`INSERT INTO projects (name) VALUES (?)`, `MT khac ${RUN}`);
    const boqKhacDuAn = await insertId(
      `INSERT INTO boq_items (project_id, code, name, unit) VALUES (?, ?, 'Ngoài dự án', 'm')`,
      duAnKhac,
      `MTBOQ-X-${RUN}`,
    );
    const { req, ctx } = goi(boqKhacDuAn, "5F");
    assert.equal((await GET(req, ctx)).status, 404);
  }

  dangNhap({ id: c.admin.id, passwordHash: c.admin.pwHash }, null);
  dangXuat();
});
