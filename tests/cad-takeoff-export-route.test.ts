import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cho app/api/engineering/cad/takeoff-export/route.ts (chưa có test nào trước PR này) +
// hàm dựng dòng dữ liệu layDongTakeoffChoExport trong lib/ky-thuat/cad/bang-dieu-khien.ts (~205-238).
// (1) Route-source: force-dynamic, 401 chưa đăng nhập, phân quyền CAN.viewEngineeringGraph.
// (2) Integration (TEST_DATABASE_URL, tự skip): layDongTakeoffChoExport dựng đúng từng dòng từ
//     standardize_report.takeoff.lines của mọi revision plugin trong dự án, bỏ qua revision không
//     kèm takeoff, không lẫn dự án khác (M22 scope).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

function nguon(): string {
  return readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "takeoff-export", "route.ts"),
    "utf8",
  );
}

// ===== (1) Route-source =====

test("route takeoff-export: force-dynamic, 401 khi chưa đăng nhập, 403 theo quyền", () => {
  const src = nguon();
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph\(user\.role\)/);
  assert.match(src, /status: 403/);

  // Auth phải chạy TRƯỚC khi đọc/ghi bất cứ dữ liệu nào (401/403 là ranh giới sớm nhất).
  const iAuth401 = src.indexOf("status: 401");
  const iAuth403 = src.indexOf("status: 403");
  const iQuery = src.indexOf("layDongTakeoffChoExport(");
  assert.ok(iAuth401 >= 0 && iAuth403 >= 0 && iQuery >= 0);
  assert.ok(iAuth401 < iQuery && iAuth403 < iQuery, "kiểm quyền phải chạy trước khi truy vấn dữ liệu");
});

test("route takeoff-export: không đụng bảng BOQ, chỉ đọc lại dữ liệu đã lưu trong standardize_report", () => {
  const src = nguon();
  assert.match(src, /layDongTakeoffChoExport/);
  assert.ok(
    !/INSERT INTO|UPDATE\s+tasks|UPDATE\s+work_packages/i.test(src),
    "route export không được ghi gì vào DB",
  );
});

test("route takeoff-export: header Excel có đủ cột KL đo lẫn cột quy đổi (hệ số/mô tả/KL quy đổi)", () => {
  const src = nguon();
  for (const cot of ["Khối lượng (đo)", "Hệ số quy đổi", "Mô tả quy đổi", "KL quy đổi"]) {
    assert.ok(src.includes(cot), `thiếu cột header "${cot}"`);
  }
  // Cột quy đổi để trống khi null — không tự ý gán 0 (tránh đọc nhầm "không quy đổi" thành 0).
  assert.match(src, /d\.heSoQuyDoi \?\? ""/);
  assert.match(src, /d\.klQuyDoi \?\? ""/);
});

// ===== (2) Integration =====

const DXF_HOP_LE = [
  "0", "SECTION", "2", "HEADER", "0", "ENDSEC",
  "0", "SECTION", "2", "BLOCKS", "0", "ENDSEC",
  "0", "SECTION", "2", "TABLES",
  "0", "TABLE", "2", "LAYER",
  "0", "LAYER", "2", "01_ONG_GIO_CAP", "62", "140", "6", "CONTINUOUS",
  "0", "ENDTAB", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "01_ONG_GIO_CAP",
  "10", "0.0", "20", "0.0", "30", "0.0",
  "11", "1000.0", "21", "0.0", "31", "0.0",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

let U = 0;
let DRAWING_P1 = 0;
let DRAWING_P2 = 0;
let PROJECT_1 = 0;
let PROJECT_2 = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { query, insertId, run } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('TakeoffExportTest','takeoff-export-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer' RETURNING id`,
  );
  U = rows[0].id;

  // 2 dự án RIÊNG cho ca này — không giả định id=1/2 có sẵn trong DB test (DB test có thể trống).
  PROJECT_1 = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Dự án test export 1', 'TXE-TEST-DA1')`,
  );
  PROJECT_2 = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Dự án test export 2', 'TXE-TEST-DA2')`,
  );

  await run(`DELETE FROM drawings WHERE code IN ('TXE-P1-001','TXE-P2-001')`);
  DRAWING_P1 = await insertId(
    `INSERT INTO drawings (code, name, kind, created_by, project_id)
     VALUES ('TXE-P1-001','Bản vẽ dự án 1','shop',?,?)`,
    U,
    PROJECT_1,
  );
  DRAWING_P2 = await insertId(
    `INSERT INTO drawings (code, name, kind, created_by, project_id)
     VALUES ('TXE-P2-001','Bản vẽ dự án 2','shop',?,?)`,
    U,
    PROJECT_2,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !U) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM drawings WHERE id IN (?, ?)`, DRAWING_P1, DRAWING_P2);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, PROJECT_1, PROJECT_2);
  await run(`DELETE FROM users WHERE id = ?`, U);
});

test(
  "layDongTakeoffChoExport dựng đúng từng dòng (he/ten/size/vung/donVi/khoiLuong/boqCode) từ " +
    "standardize_report.takeoff.lines, bỏ qua revision không kèm takeoff, chỉ trong đúng dự án",
  S,
  async () => {
    const { xuLyPluginUpload } = await import("@/lib/ky-thuat/cad/plugin-upload");
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const { layDongTakeoffChoExport } = await import("@/lib/ky-thuat/cad/bang-dieu-khien");
    const v = getCurrentRulePack().version;

    // Rev A của dự án 1 — CÓ takeoff.
    const upA = await xuLyPluginUpload({
      drawingId: DRAWING_P1,
      orgId: 1,
      userId: U,
      rev: "A",
      rulePackVersion: v,
      dwg: Buffer.from("txe-p1-rev-A"),
      dwgName: "TXE.dwg",
      dxfText: DXF_HOP_LE,
      report: { cheDo: "chuan-hoa" },
      takeoff: {
        rulePackVersion: v,
        lines: [
          {
            itemId: "duct-supp",
            boqCode: "M.01.01",
            group: "HVAC",
            ten: "Ống gió cấp",
            donVi: "m",
            khoiLuong: 12,
            size: "300x200",
            vung: "Tầng 3",
            // Không có hệ số quy đổi (rule pack không khai) — kiểm tra cột quy đổi để TRỐNG.
          },
          {
            itemId: "duct-cachnhiet",
            boqCode: "M.01.02",
            group: "HVAC",
            ten: "Cách nhiệt ống gió",
            donVi: "m2",
            khoiLuong: 20,
            size: "300x200",
            vung: "Tầng 3",
            // Có hệ số quy đổi — item dẫn xuất (cách nhiệt), khớp ví dụ trong sidecar mẫu.
            heSoQuyDoi: 1.6,
            moTaQuyDoi: "Diện tích cách nhiệt = chu vi x chiều dài x hệ số",
            klQuyDoi: 32,
          },
        ],
      },
    });
    assert.equal(upA.status, "created");

    // Rev B của dự án 1 — KHÔNG kèm takeoff (upload cũ, không sidecar) → phải bị BỎ QUA khỏi export.
    const upB = await xuLyPluginUpload({
      drawingId: DRAWING_P1,
      orgId: 1,
      userId: U,
      rev: "B",
      rulePackVersion: v,
      dwg: Buffer.from("txe-p1-rev-B"),
      dwgName: "TXE.dwg",
      dxfText: DXF_HOP_LE,
      report: null,
    });
    assert.equal(upB.status, "created");

    // Rev A của dự án 2 — dùng để kiểm export dự án 1 không bị lẫn dữ liệu dự án khác (M22 scope).
    await xuLyPluginUpload({
      drawingId: DRAWING_P2,
      orgId: 1,
      userId: U,
      rev: "A",
      rulePackVersion: v,
      dwg: Buffer.from("txe-p2-rev-A"),
      dwgName: "TXE2.dwg",
      dxfText: DXF_HOP_LE,
      report: null,
      takeoff: {
        rulePackVersion: v,
        lines: [
          {
            itemId: "duct-supp",
            boqCode: "M.02.01",
            group: "HVAC",
            ten: "Ống gió hồi",
            donVi: "m",
            khoiLuong: 999,
            size: "200x150",
            vung: "Tầng 1",
          },
        ],
      },
    });

    const dong1 = await layDongTakeoffChoExport(PROJECT_1);
    const cuaP1 = dong1.filter((d) => d.drawingCode === "TXE-P1-001");
    assert.equal(cuaP1.length, 2, "rev B không kèm takeoff phải bị bỏ qua, rev A có 2 dòng");
    assert.deepEqual(cuaP1[0], {
      drawingCode: "TXE-P1-001",
      drawingName: "Bản vẽ dự án 1",
      rev: "A",
      he: "HVAC",
      ten: "Ống gió cấp",
      size: "300x200",
      vung: "Tầng 3",
      donVi: "m",
      khoiLuong: 12,
      boqCode: "M.01.01",
      // Dòng không kèm dữ liệu quy đổi trong sidecar → phải để TRỐNG (null), không suy đoán/mặc định 1.
      heSoQuyDoi: null,
      moTaQuyDoi: "",
      klQuyDoi: null,
    });
    assert.deepEqual(cuaP1[1], {
      drawingCode: "TXE-P1-001",
      drawingName: "Bản vẽ dự án 1",
      rev: "A",
      he: "HVAC",
      ten: "Cách nhiệt ống gió",
      size: "300x200",
      vung: "Tầng 3",
      donVi: "m2",
      khoiLuong: 20,
      boqCode: "M.01.02",
      // Dòng có hệ số quy đổi (item dẫn xuất) → phải xuất đúng cả 3 trường quy đổi từ sidecar.
      heSoQuyDoi: 1.6,
      moTaQuyDoi: "Diện tích cách nhiệt = chu vi x chiều dài x hệ số",
      klQuyDoi: 32,
    });

    assert.ok(
      !dong1.some((d) => d.drawingCode === "TXE-P2-001"),
      "export dự án 1 không được lẫn dòng của dự án 2",
    );
    const dong2 = await layDongTakeoffChoExport(PROJECT_2);
    assert.ok(dong2.some((d) => d.drawingCode === "TXE-P2-001" && d.khoiLuong === 999));
  },
);
