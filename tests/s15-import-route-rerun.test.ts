import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S15 — A5-AC01 (vế "import chạy lại không nhân dòng"): gọi ROUTE THẬT
// POST /api/import/excel hai lần với cùng file tracking gốc, vào MỘT dự án riêng; số
// work_packages / tasks / progress_dimensions / task_history của dự án đó không đổi sau lần 2.
// (tests/import-real.test.ts kiểm hàm importWorkbook ở tầng lib; ở đây kiểm cả đường HTTP + phạm vi dự án.)

const XLSX_FILE = "attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";
const SKIP = !HAS_TEST_DB || !existsSync(XLSX_FILE);

test.after(() => dangXuat());

async function goiImport(buf: Buffer) {
  const { POST } = await import("@/app/api/import/excel/route");
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(buf)], "tracking-s15.xlsx"));
  const res = await POST(
    new NextRequest("http://localhost/api/import/excel", { method: "POST", body: fd }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function dem(projectId: number) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ wp: number; t: number; d: number; h: number; st: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id
          WHERE tw.project_id = ?) AS st,
       (SELECT COUNT(*)::int FROM work_packages wp JOIN sheet_types st ON st.id = wp.sheet_type_id
          JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?) AS wp,
       (SELECT COUNT(*)::int FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
          JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
          WHERE tw.project_id = ?) AS t,
       (SELECT COUNT(*)::int FROM progress_dimensions d JOIN tasks t ON t.id = d.task_id
          JOIN work_packages wp ON wp.id = t.package_id JOIN sheet_types st ON st.id = wp.sheet_type_id
          JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?) AS d,
       (SELECT COUNT(*)::int FROM task_history h JOIN tasks t ON t.id = h.task_id
          JOIN work_packages wp ON wp.id = t.package_id JOIN sheet_types st ON st.id = wp.sheet_type_id
          JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?) AS h`,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
  ))!;
}

async function donDuAn(projectId: number) {
  const { run } = await import("@/lib/db");
  const trongDuAn = `FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
        JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
       WHERE tw.project_id = ?`;
  for (const bang of ["notifications", "task_history", "progress_dimensions"])
    await run(`DELETE FROM ${bang} WHERE task_id IN (SELECT t.id ${trongDuAn})`, projectId);
  await run(`DELETE FROM tasks WHERE id IN (SELECT t.id ${trongDuAn})`, projectId);
  await run(
    `DELETE FROM work_packages WHERE sheet_type_id IN
       (SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
    projectId,
  );
  await run(
    `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM towers WHERE project_id = ?`, projectId);
}

test(
  "A5-AC01: POST /api/import/excel chạy lại cùng file → không nhân work_packages/tasks/ô/lịch sử",
  { skip: SKIP },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const projectId = await insertId(
      `INSERT INTO projects (name, org_id) VALUES (?, 1)`,
      `S15 import ${Date.now().toString(36)}`,
    );
    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Admin S15', ?, 'h', 'admin', 1)`,
      `s15-imp-${Date.now().toString(36)}@test.local`,
    );
    try {
      const u = await queryOne<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE id = ?`,
        adminId,
      );
      await dangNhapDuAn({ id: adminId, passwordHash: u!.password_hash }, projectId);
      const buf = readFileSync(XLSX_FILE);

      const lan1 = await goiImport(buf);
      assert.equal(lan1.status, 200, JSON.stringify(lan1.body).slice(0, 300));
      assert.deepEqual(lan1.body.errors, []);
      const sau1 = await dem(projectId);
      assert.ok(
        sau1.wp > 100 && sau1.t > 2000,
        `lần 1 phải nạp dữ liệu thật: ${JSON.stringify(sau1)}`,
      );

      const lan2 = await goiImport(buf);
      assert.equal(lan2.status, 200, JSON.stringify(lan2.body).slice(0, 300));
      assert.equal(lan2.body.packages, 0, "lần 2 không tạo thêm nhóm");
      assert.equal(lan2.body.tasks, 0, "lần 2 không tạo thêm task");
      assert.deepEqual(await dem(projectId), sau1, "đếm bảng không đổi sau import lần 2");

      // Lần 3 với cùng file: vẫn ổn định.
      assert.equal((await goiImport(buf)).status, 200);
      assert.deepEqual(await dem(projectId), sau1);
    } finally {
      await donDuAn(projectId);
      await run(`DELETE FROM import_batches WHERE project_id = ?`, projectId);
      await run(`DELETE FROM user_projects WHERE user_id = ?`, adminId);
      await run(`DELETE FROM users WHERE id = ?`, adminId);
      await run(`DELETE FROM projects WHERE id = ?`, projectId).catch(() => undefined);
    }
  },
);
