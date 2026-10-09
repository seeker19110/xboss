import { HAS_TEST_DB } from "./setup";
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { MONEY_FORMAT_HEADER } from "@/lib/nen/money";

// Nút "Excel" trang /payments gọi /api/export/excel?type=payments — phải xuất đúng bảng giá trị
// theo tầng × hệ (khớp GET /api/payments), không phải workbook tracking.
const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let seq = 0;

const req = (path: string) => new NextRequest(`http://localhost${path}`);

async function taoDuAn(ten: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO projects (name, code, org_id) VALUES (?, ?, 1)`,
    `XTT ${RUN} ${ten}`,
    `XTT-${ten}`,
  );
}

async function taoUser(role: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-xtt', ?, 1)`,
    `XTT ${RUN}`,
    `xtt-${RUN}-${++seq}@test.local`,
    role,
  );
  const row = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: row!.password_hash };
}

async function taoTangHe(projectId: number, nhan: string, giaTri: string, tang: string[]) {
  const { insertId, run } = await import("@/lib/db");
  const tower = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${RUN} ${nhan}`,
  );
  const sheet = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, responsible) VALUES (?, ?, ?, ?, ?)`,
    tower,
    `XTT-${RUN}-${nhan}`,
    `Sheet ${nhan}`,
    `xtt-${RUN}-${nhan}`,
    `NPT ${nhan}`,
  );
  for (const [i, t] of tang.entries()) {
    const wp = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, ?, ?)`,
      sheet,
      `WP-${RUN}-${nhan}-${i}`,
      `Nhóm ${nhan}`,
      t,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status)
       VALUES (?, ?, 'Việc 1', 0.333, 'dang_thi_cong'), (?, ?, 'Việc 2', 1, 'tre')`,
      wp,
      `T-${RUN}-${nhan}-${i}-1`,
      wp,
      `T-${RUN}-${nhan}-${i}-2`,
    );
    await run(
      `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?)`,
      sheet,
      t,
      giaTri,
    );
  }
}

const ctx = (async () => {
  if (!HAS_TEST_DB) return null;
  const a = await taoDuAn(`A${RUN.slice(-4)}`);
  const b = await taoDuAn(`B${RUN.slice(-4)}`);
  await taoTangHe(a, "a", "1234567.89", ["T1", "T2"]);
  await taoTangHe(b, "b", "999.00", ["T9"]);
  return { a, b };
})();

// Dọn floor_contracts của các dự án test: test khác (vd import-real) xoá toàn bộ sheet_types, dòng
// floor_contracts sót lại làm vỡ khoá ngoại floor_contracts_sheet_type_id_fkey của chúng.
after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM floor_contracts WHERE sheet_type_id IN (
       SELECT st.id FROM sheet_types st JOIN towers t ON t.id = st.tower_id
        JOIN projects p ON p.id = t.project_id WHERE p.name LIKE ?)`,
    `XTT ${RUN} %`,
  );
});

async function docWb(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

type DongApi = {
  sheetType: string;
  floorLabel: string;
  responsible: string | null;
  taskCount: number;
  delayed: number;
  progress: number;
  contractValue: string;
  earned: string;
};

test("type=payments: chưa đăng nhập → 401", S, async () => {
  const { GET } = await import("@/app/api/export/excel/route");
  dangXuat();
  assert.equal((await GET(req("/api/export/excel?type=payments"))).status, 401);
});

test("type=payments: engineer (không viewPayments) → 403", S, async () => {
  const { a } = (await ctx)!;
  const { GET } = await import("@/app/api/export/excel/route");
  await dangNhapDuAn(await taoUser("engineer"), a);
  const res = await GET(req("/api/export/excel?type=payments"));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "Chỉ Admin/PM/BCH được xem thanh toán");
});

test("type=payments: không dự án khả kiến → 404", S, async () => {
  const { GET } = await import("@/app/api/export/excel/route");
  const { run } = await import("@/lib/db");
  const khac = await taoUser("pm");
  const p = await taoDuAn(`G${RUN.slice(-4)}`);
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, khac.id, p);
  dangNhap(await taoUser("pm"));
  const res = await GET(req("/api/export/excel?type=payments"));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Không tìm thấy dự án đang chọn");
});

test("type lạ → 400", S, async () => {
  const { a } = (await ctx)!;
  const { GET } = await import("@/app/api/export/excel/route");
  await dangNhapDuAn(await taoUser("admin"), a);
  const res = await GET(req("/api/export/excel?type=abc"));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Loại export không hợp lệ");
});

test("type=payments: bch → 200, khớp GET /api/payments, không lẫn dự án khác", S, async () => {
  const { a } = (await ctx)!;
  const { GET } = await import("@/app/api/export/excel/route");
  const pay = await import("@/app/api/payments/route");
  await dangNhapDuAn(await taoUser("bch"), a);

  const res = await GET(req("/api/export/excel?type=payments"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.match(
    res.headers.get("content-disposition") ?? "",
    /filename="thanh-toan-XTT-A[\w-]*-\d{4}-\d{2}-\d{2}\.xlsx"/,
  );

  const apiRes = await pay.GET(
    new NextRequest("http://localhost/api/payments", {
      headers: { [MONEY_FORMAT_HEADER]: "decimal-string-v1" },
    }),
  );
  assert.equal(apiRes.status, 200);
  const api = (await apiRes.json()) as {
    rows: DongApi[];
    totalContract: string;
    totalEarned: string;
  };

  const wb = await docWb(res);
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ["Thanh toán"],
  );
  const ws = wb.getWorksheet("Thanh toán")!;
  assert.deepEqual((ws.getRow(1).values as unknown[]).slice(1), [
    "Hệ",
    "Tầng",
    "Người phụ trách",
    "Số công việc",
    "Trễ",
    "Tiến độ (%)",
    "Giá trị HĐ (đ)",
    "Giá trị theo tiến độ (đ)",
  ]);
  assert.equal(ws.views[0]?.state, "frozen");
  assert.equal(api.rows.length, 2);
  assert.equal(ws.rowCount, api.rows.length + 2);
  api.rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    assert.deepEqual((row.values as unknown[]).slice(1), [
      r.sheetType,
      r.floorLabel,
      r.responsible ?? "",
      r.taskCount,
      r.delayed,
      r.progress,
      Number(r.contractValue),
      Number(r.earned),
    ]);
    assert.equal(row.getCell(6).numFmt, "0.0%");
    assert.equal(row.getCell(7).numFmt, "#,##0");
    assert.equal(row.getCell(8).numFmt, "#,##0");
  });
  const all = JSON.stringify(ws.getSheetValues());
  assert.ok(all.includes(`XTT-${RUN}-a`), "có dòng dự án A");
  assert.ok(!all.includes(`XTT-${RUN}-b`), "không lẫn dòng dự án B");
  const tong = ws.getRow(api.rows.length + 2);
  assert.equal(tong.getCell(1).value, "Tổng cộng");
  assert.equal(api.totalContract, "2469135.78");
  assert.equal(tong.getCell(7).value, Number(api.totalContract));
  assert.equal(tong.getCell(8).value, Number(api.totalEarned));
});

test("không type → vẫn workbook tracking (KPI + Công việc trễ + tab sheet)", S, async () => {
  const { a } = (await ctx)!;
  const { GET } = await import("@/app/api/export/excel/route");
  await dangNhapDuAn(await taoUser("admin"), a);
  const res = await GET(req("/api/export/excel"));
  assert.equal(res.status, 200);
  const names = (await docWb(res)).worksheets.map((w) => w.name);
  assert.equal(names[0], "KPI");
  assert.equal(names[1], "Công việc trễ");
  assert.ok(!names.includes("Thanh toán"));
});
