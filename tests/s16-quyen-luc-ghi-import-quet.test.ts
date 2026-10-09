import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import type { PoolClient } from "pg";
import { goi, uniq } from "./helpers/chuoi-nghiep-vu";

// S16 / D01 — tái kiểm quyền lúc ghi cho 2 route trước đây HOÃN
// (docs/nang-cap/AUDIT-S16-QUYEN-LUC-GHI.md §2.1 import/excel, §2.2 drawings/scan-local):
// - import Excel: cả lần import trong MỘT transaction (ghiNeuConQuyen) — bị thu hồi ⇒ 403, không
//   ghi gì; lỗi giữa chừng ⇒ ROLLBACK toàn bộ (không còn dòng dở dang).
// - quét bản vẽ: tái kiểm quyền TỪNG tệp — mất quyền giữa chừng ⇒ dừng, giữ tệp đã ghi,
//   phản hồi kèm `stoppedByPermission` + `remaining`; mất quyền trước tệp đầu ⇒ 403.
// Thu hồi "giữa chừng" bằng kết nối riêng giữ khoá độc quyền `role_permissions:1` (y như
// setPermissionOverride) rồi siết quyền ở phạm vi dự án của ca. Lỗi giữa chừng của import tạo bằng
// trigger DB tạm (không mock module).

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };
type Nguoi = { id: number; passwordHash: string; orgId: number; role: string };

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S16IQ ${uniq(ten)}`);
}

async function taoNguoi(role: string, ten: string): Promise<Nguoi> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-test-s16iq', ?, 1)`,
    `S16IQ ${ten}`,
    `s16iq-${uniq(ten)}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-test-s16iq", orgId: 1, role };
}

const SQL_DENY = `INSERT INTO role_permissions (role, perm_key, allowed, project_id, updated_by, org_id, updated_at)
  VALUES ($1, $2, false, $3, NULL, 1, now())
  ON CONFLICT (org_id, role, perm_key, COALESCE(project_id, 0))
  DO UPDATE SET allowed = false, updated_at = now()`;

async function pidCua(c: PoolClient): Promise<number> {
  return (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
}

/** Chờ (tối đa ~2s) tới khi có tiến trình bị `pid` chặn; trả false nếu `xong()` trước đó. */
async function choBiChan(pid: number, xong: () => boolean): Promise<boolean> {
  const { getPool } = await import("@/lib/db");
  for (let i = 0; i < 80 && !xong(); i++) {
    const r = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
      [pid],
    );
    if (r.rows[0].n > 0) return true;
    await new Promise((ok) => setTimeout(ok, 25));
  }
  return false;
}

/** Giữ khoá độc quyền quyền-org, chạy r1, chờ r1 kẹt, siết các perm ở dự án rồi COMMIT. */
async function thuHoiTruocGhi(
  projectId: number,
  role: string,
  perms: string[],
  r1: () => Promise<KetQua>,
): Promise<{ kq: KetQua; ket: boolean }> {
  const { getPool } = await import("@/lib/db");
  const c = await getPool().connect();
  let daNha = false;
  const nha = async (lenh: "COMMIT" | "ROLLBACK") => {
    if (daNha) return;
    daNha = true;
    await c.query(lenh).catch(() => {});
    c.release();
  };
  try {
    await c.query("BEGIN");
    const pid = await pidCua(c);
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, ["role_permissions:1"]);
    let xong = false;
    const dangBay = r1().finally(() => {
      xong = true;
    });
    const ket = await choBiChan(pid, () => xong);
    for (const p of perms) await c.query(SQL_DENY, [role, p, projectId]);
    await nha("COMMIT");
    return { kq: await dangBay, ket };
  } finally {
    await nha("ROLLBACK");
  }
}

// ============================ POST /api/import/excel ============================

function workbook(K: string): XLSX.WorkBook {
  const header = [
    "CODE",
    "STT",
    "CHI TIẾT",
    "GHI CHÚ",
    "NGÀY BĐ",
    "SỐ NGÀY",
    "NGÀY KT",
    "% Tiến độ",
  ];
  const aoa: unknown[][] = [
    [],
    [],
    header,
    [],
    [],
    [K, "1", "Nhóm S16 import", "", "2026-01-01", 10, "2026-01-10", 0],
    [`${K},01`, "01", "Task 1", "", "2026-01-01", 5, "2026-01-05", 0.5],
    [`${K},02`, "02", "Task 2", "", "2026-01-01", 5, "2026-01-05", 0],
    [`${K},03`, "03", "Task 3", "", "2026-01-01", 5, "2026-01-05", 1],
  ];
  return {
    SheetNames: ["TRACKING OGTĐ"],
    Sheets: { "TRACKING OGTĐ": XLSX.utils.aoa_to_sheet(aoa) },
  };
}

function importReq(K: string): NextRequest {
  const buf = XLSX.write(workbook(K), { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(buf)], `s16-${K}.xlsx`));
  return new NextRequest("http://localhost/api/import/excel", { method: "POST", body: fd });
}

async function goiImport(K: string): Promise<KetQua> {
  const { POST } = await import("@/app/api/import/excel/route");
  return goi(POST(importReq(K)));
}

/** Số dòng import để lại trong dự án (tháp/sheet/nhóm/task/sổ import). */
async function demImport(projectId: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{ tw: number; st: number; wp: number; t: number; b: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM towers WHERE project_id = ?) AS tw,
       (SELECT COUNT(*)::int FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id
          WHERE tw.project_id = ?) AS st,
       (SELECT COUNT(*)::int FROM work_packages wp JOIN sheet_types st ON st.id = wp.sheet_type_id
          JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?) AS wp,
       (SELECT COUNT(*)::int FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
          JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
          WHERE tw.project_id = ?) AS t,
       (SELECT COUNT(*)::int FROM import_batches WHERE project_id = ?) AS b`,
    projectId,
    projectId,
    projectId,
    projectId,
    projectId,
  );
}

async function donImport(projectId: number) {
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
  await run(`DELETE FROM import_batches WHERE project_id = ?`, projectId);
}

const KHONG_GHI = { tw: 0, st: 0, wp: 0, t: 0, b: 0 };

test("import Excel: thu hồi quyền giữa chừng ⇒ 403, không ghi dòng nào", S, async () => {
  const projectId = await taoDuAn("imp-deny");
  const u = await taoNguoi("pm", "imp-deny");
  try {
    await dangNhapDuAn(u, projectId);
    const K = `Q${uniq("D").replace(/\W/g, "")}`;
    const { kq, ket } = await thuHoiTruocGhi(projectId, "pm", ["import"], () => goiImport(K));
    assert.equal(kq.status, 403, `import ghi bằng snapshot stale: ${JSON.stringify(kq.body)}`);
    assert.equal(kq.body?.error, "Bạn không có quyền import (chỉ Admin/PM)");
    assert.ok(ket, "import phải chờ khoá tái kiểm quyền lúc ghi");
    assert.deepEqual(await demImport(projectId), KHONG_GHI);
  } finally {
    await donImport(projectId);
  }
});

test("import Excel: đối chứng — còn quyền ⇒ 200, ghi đủ nhóm + task", S, async () => {
  const projectId = await taoDuAn("imp-ok");
  const u = await taoNguoi("pm", "imp-ok");
  try {
    await dangNhapDuAn(u, projectId);
    const kq = await goiImport(`Q${uniq("O").replace(/\W/g, "")}`);
    assert.equal(kq.status, 200, JSON.stringify(kq.body));
    assert.equal(kq.body?.packages, 1);
    assert.equal(kq.body?.tasks, 3);
    const d = await demImport(projectId);
    assert.equal(d?.wp, 1);
    assert.equal(d?.t, 3);
    assert.equal(d?.b, 1);
  } finally {
    await donImport(projectId);
  }
});

test("import Excel: lỗi giữa chừng (sau khi đã ghi vài dòng) ⇒ ROLLBACK toàn bộ", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("imp-atom");
  const u = await taoNguoi("pm", "imp-atom");
  const K = `Q${uniq("A").replace(/\W/g, "")}`;
  const fn = `s16iq_no_${K.toLowerCase()}`;
  // Trigger tạm: chèn task thứ 2 của file thì nổ — tháp/sheet/nhóm/task 1/sổ import đã ghi trước đó.
  await run(
    `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN RAISE EXCEPTION 's16 import nổ giữa chừng'; END $$`,
  );
  await run(
    `CREATE TRIGGER ${fn} BEFORE INSERT ON tasks FOR EACH ROW
     WHEN (NEW.code = '${K},02') EXECUTE FUNCTION ${fn}()`,
  );
  try {
    await dangNhapDuAn(u, projectId);
    const kq = await goiImport(K);
    assert.equal(kq.status, 500, JSON.stringify(kq.body));
    assert.deepEqual(await demImport(projectId), KHONG_GHI, "không được còn dòng import dở dang");
  } finally {
    await run(`DROP TRIGGER IF EXISTS ${fn} ON tasks`);
    await run(`DROP FUNCTION IF EXISTS ${fn}()`);
    await donImport(projectId);
  }
});

// ============================ POST /api/drawings/scan-local ============================

const PDF = Buffer.from("%PDF-1.4\n%%EOF");

/** Tạo thư mục con riêng trong DRAWINGS_DIR thật với 3 tệp; trả mã theo ĐÚNG thứ tự quét. */
async function taoTepQuet(): Promise<{ dir: string; codes: string[] }> {
  const { DRAWINGS_DIR, getAllDrawingFilesRecursively, parseDrawingInfo } =
    await import("@/lib/ky-thuat/drawings-scan");
  const sub = `__test_s16iq_${uniq("s").replace(/\W/g, "")}`;
  const dir = join(DRAWINGS_DIR, sub);
  mkdirSync(dir, { recursive: true });
  for (const c of ["A", "B", "C"]) writeFileSync(join(dir, `S16IQ_${sub}_${c}.pdf`), PDF);
  const codes = getAllDrawingFilesRecursively(DRAWINGS_DIR)
    .filter((f) => f.relativePath.startsWith(`${sub}/`))
    .map((f) => parseDrawingInfo(f.fileName).code);
  assert.equal(codes.length, 3);
  return { dir, codes };
}

async function goiQuet(): Promise<KetQua> {
  const { POST } = await import("@/app/api/drawings/scan-local/route");
  return goi(POST(new NextRequest("http://localhost/api/drawings/scan-local", { method: "POST" })));
}

/** Mã nào trong `codes` đã có revision trong DB. */
async function maDaQuet(codes: string[]): Promise<string[]> {
  const { query } = await import("@/lib/db");
  const rows = await query<{ code: string }>(
    `SELECT d.code FROM drawings d JOIN drawing_revisions r ON r.drawing_id = d.id
      WHERE d.code = ANY(?::text[])`,
    codes,
  );
  return rows.map((r) => r.code).sort();
}

async function donQuet(dir: string, codes: string[]) {
  const { run } = await import("@/lib/db");
  rmSync(dir, { recursive: true, force: true });
  await run(
    `DELETE FROM drawing_revisions WHERE drawing_id IN (SELECT id FROM drawings WHERE code = ANY(?::text[]))`,
    codes,
  );
  await run(`DELETE FROM drawings WHERE code = ANY(?::text[])`, codes);
}

const QUYEN_QUET = ["manageDrawings", "manageEngineeringGraph"];

test("quét bản vẽ: thu hồi quyền trước tệp đầu ⇒ 403, không ghi tệp nào", S, async () => {
  const projectId = await taoDuAn("scan-deny");
  const u = await taoNguoi("engineer", "scan-deny");
  const { dir, codes } = await taoTepQuet();
  try {
    await dangNhapDuAn(u, projectId);
    const { kq, ket } = await thuHoiTruocGhi(projectId, "engineer", QUYEN_QUET, goiQuet);
    assert.equal(kq.status, 403, `quét ghi bằng snapshot stale: ${JSON.stringify(kq.body)}`);
    assert.equal(kq.body?.error, "Bạn không có quyền đồng bộ bản vẽ");
    assert.ok(ket, "quét phải chờ khoá tái kiểm quyền lúc ghi");
    assert.deepEqual(await maDaQuet(codes), []);
  } finally {
    await donQuet(dir, codes);
  }
});

test("quét bản vẽ: thu hồi quyền sau tệp đầu ⇒ dừng vòng lặp, giữ tệp đã ghi", S, async () => {
  const { getPool, insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("scan-mid");
  const u = await taoNguoi("engineer", "scan-mid");
  const { dir, codes } = await taoTepQuet();
  const [ma1, ma2, ma3] = codes;
  // Bản vẽ của tệp 2 có sẵn (chưa revision) để C1 chèn trước revision "Rev A" chưa COMMIT ⇒
  // lần ghi revision của tệp 2 kẹt ở unique (drawing_id, rev) SAU khi đã qua tái kiểm quyền.
  const drawing2 = await insertId(
    `INSERT INTO drawings (project_id, code, name) VALUES (?, ?, 'S16IQ tệp 2')`,
    projectId,
    ma2,
  );
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    await dangNhapDuAn(u, projectId);
    await c1.query("BEGIN");
    await c1.query(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type)
       VALUES ($1, 'Rev A', 'giu-cho', 'application/pdf')`,
      [drawing2],
    );
    let xong = false;
    const dangBay = goiQuet().finally(() => {
      xong = true;
    });
    assert.ok(await choBiChan(await pidCua(c1), () => xong), "tệp 2 phải kẹt ở unique revision");
    // C2 xếp hàng khoá độc quyền phía sau transaction của tệp 2 (đang giữ khoá chia sẻ).
    await c2.query("BEGIN");
    const pid2 = await pidCua(c2);
    const khoa = c2.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      "role_permissions:1",
    ]);
    for (let i = 0; i < 80; i++) {
      const r = await getPool().query<{ n: number }>(
        `SELECT cardinality(pg_blocking_pids($1))::int AS n`,
        [pid2],
      );
      if (r.rows[0].n > 0) break;
      await new Promise((ok) => setTimeout(ok, 25));
    }
    await c1.query("ROLLBACK"); // tệp 2 ghi xong + COMMIT ⇒ C2 lấy được khoá trước tệp 3
    await khoa;
    for (const p of QUYEN_QUET) await c2.query(SQL_DENY, ["engineer", p, projectId]);
    await c2.query("COMMIT");
    const kq = await dangBay;

    assert.equal(kq.status, 200, JSON.stringify(kq.body));
    assert.equal(kq.body?.stoppedByPermission, true, JSON.stringify(kq.body));
    assert.equal(kq.body?.newlySyncedRevisions, 2);
    assert.ok(Number(kq.body?.remaining) >= 1, JSON.stringify(kq.body));
    assert.match(String(kq.body?.message), /thu hồi/);
    assert.deepEqual(await maDaQuet(codes), [ma1, ma2].sort(), `tệp ${ma3} không được ghi`);
  } finally {
    await c1.query("ROLLBACK").catch(() => {});
    await c2.query("ROLLBACK").catch(() => {});
    c1.release();
    c2.release();
    await donQuet(dir, codes);
  }
});

test("quét bản vẽ: đối chứng — còn quyền ⇒ 200, ghi đủ, không có cờ dừng", S, async () => {
  const projectId = await taoDuAn("scan-ok");
  const u = await taoNguoi("engineer", "scan-ok");
  const { dir, codes } = await taoTepQuet();
  try {
    await dangNhapDuAn(u, projectId);
    const kq = await goiQuet();
    assert.equal(kq.status, 200, JSON.stringify(kq.body));
    assert.equal(kq.body?.stoppedByPermission, undefined);
    assert.ok(Number(kq.body?.newlySyncedRevisions) >= 3);
    assert.deepEqual(await maDaQuet(codes), [...codes].sort());
  } finally {
    await donQuet(dir, codes);
  }
});
