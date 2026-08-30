import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test đầu-cuối vòng đời bản vẽ ↔ KL bóc gửi kèm (M99 PR5 + M101 PR5):
//   upload plugin đạt → tạo drawing_revision 'submitted' (lib/ky-thuat/cad/dashboard.ts)
//   → DUYỆT revision (lib/ky-thuat/drawings.ts setRevisionStatus) → revision khác của cùng
//     drawing đang 'approved' tự chuyển 'superseded' (không đổi standardize_report/takeoff)
//   → khối lượng bóc (standardize_report.takeoff) đọc ra ĐÚNG theo từng revision — cả qua
//     đọc trực tiếp DB lẫn qua layDongTakeoffChoExport (nguồn Excel gộp trên bảng điều khiển).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

// DXF tối thiểu nhưng hợp lệ với validateDxf/parseDxf (bám tệp mẫu trong cad-plugin-upload.test.ts).
const DXF_HOP_LE = [
  "0",
  "SECTION",
  "2",
  "HEADER",
  "0",
  "ENDSEC",
  "0",
  "SECTION",
  "2",
  "BLOCKS",
  "0",
  "ENDSEC",
  "0",
  "SECTION",
  "2",
  "TABLES",
  "0",
  "TABLE",
  "2",
  "LAYER",
  "0",
  "LAYER",
  "2",
  "01_ONG_GIO_CAP",
  "62",
  "140",
  "6",
  "CONTINUOUS",
  "0",
  "ENDTAB",
  "0",
  "ENDSEC",
  "0",
  "SECTION",
  "2",
  "ENTITIES",
  "0",
  "LINE",
  "8",
  "01_ONG_GIO_CAP",
  "10",
  "0.0",
  "20",
  "0.0",
  "30",
  "0.0",
  "11",
  "1000.0",
  "21",
  "0.0",
  "31",
  "0.0",
  "0",
  "ENDSEC",
  "0",
  "EOF",
  "",
].join("\n");

let U = 0;
let DRAWING = 0;
let PROJECT_ID = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { query, insertId, run } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('VongDoiBanVe','vong-doi-ban-ve-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer' RETURNING id`,
  );
  U = rows[0].id;
  // Dự án riêng cho ca này — không giả định project id=1 có sẵn trong DB (DB test có thể trống).
  PROJECT_ID = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Dự án test vòng đời bản vẽ', 'VDBV-TEST-DA')`,
  );
  // Dọn bản vẽ + revision của lần chạy trước — ca phải bắt đầu sạch.
  await run(`DELETE FROM drawings WHERE code = 'VDBV-TEST-001'`); // CASCADE xoá kèm revisions
  DRAWING = await insertId(
    `INSERT INTO drawings (code, name, kind, created_by, project_id)
     VALUES ('VDBV-TEST-001','Bản vẽ test vòng đời','shop',?,?)`,
    U,
    PROJECT_ID,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !DRAWING) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM drawings WHERE id = ?`, DRAWING);
  await run(`DELETE FROM projects WHERE id = ?`, PROJECT_ID);
  await run(`DELETE FROM users WHERE id = ?`, U);
});

test(
  "upload → submitted → duyệt → superseded khi có rev mới; takeoff đọc đúng theo từng revision, " +
    "revision cũ không bị đổi nội dung khi rev mới được duyệt",
  S,
  async () => {
    const { xuLyPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
    const { setRevisionStatus, listRevisions } = await import("@/lib/ky-thuat/drawings");
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const { queryOne } = await import("@/lib/db");
    const { docKlBocTuBaoCao, layDongTakeoffChoExport } =
      await import("@/lib/ky-thuat/cad/dashboard");
    const v = getCurrentRulePack().version;

    // ---- Rev A: upload kèm KL bóc, kiểm trạng thái submitted ----
    const upA = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "A",
      rulePackVersion: v,
      dwg: Buffer.from("noi-dung-rev-A"),
      dwgName: "VDBV.dwg",
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
            khoiLuong: 20,
            size: "300x200",
            vung: "Tầng 5",
          },
        ],
      },
    });
    assert.equal(upA.status, "created");
    if (upA.status !== "created") return;

    const rowSubmitted = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      upA.revisionId,
    );
    assert.equal(rowSubmitted?.status, "submitted");

    // Duyệt rev A.
    const duyetA = await setRevisionStatus(upA.revisionId, "approved", "Đạt yêu cầu");
    assert.ok(!("error" in duyetA), JSON.stringify(duyetA));
    if ("error" in duyetA) return;
    assert.equal(duyetA.drawingId, DRAWING);

    const rowA1 = await queryOne<{
      status: string;
      standardize_report: { takeoff?: { lines?: unknown[] } };
    }>(`SELECT status, standardize_report FROM drawing_revisions WHERE id = ?`, upA.revisionId);
    assert.equal(rowA1?.status, "approved");
    const klA = docKlBocTuBaoCao(rowA1!.standardize_report);
    assert.equal(klA?.tongDong, 1);
    assert.deepEqual(klA?.theoHe, [{ nhan: "HVAC (m)", khoiLuong: 20 }]);
    assert.deepEqual(klA?.theoVung, [{ nhan: "Tầng 5 (m)", khoiLuong: 20 }]);

    // ---- Rev B: upload kèm KL bóc khác, duyệt → rev A phải tự chuyển superseded ----
    const upB = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "B",
      rulePackVersion: v,
      dwg: Buffer.from("noi-dung-rev-B"),
      dwgName: "VDBV.dwg",
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
            khoiLuong: 35,
            size: "300x200",
            vung: "Tầng 6",
          },
        ],
      },
    });
    assert.equal(upB.status, "created");
    if (upB.status !== "created") return;

    const duyetB = await setRevisionStatus(upB.revisionId, "approved", null);
    assert.ok(!("error" in duyetB));

    // Rev A: trạng thái chuyển superseded nhưng standardize_report/takeoff GIỮ NGUYÊN nội dung cũ.
    const rowA2 = await queryOne<{
      status: string;
      standardize_report: { takeoff?: { lines?: unknown[] } };
    }>(`SELECT status, standardize_report FROM drawing_revisions WHERE id = ?`, upA.revisionId);
    assert.equal(rowA2?.status, "superseded");
    assert.deepEqual(rowA2?.standardize_report, rowA1?.standardize_report);
    const klA2 = docKlBocTuBaoCao(rowA2!.standardize_report);
    assert.deepEqual(klA2, klA); // không đổi so với lúc vừa duyệt

    // Rev B: đang là bản hiệu lực (approved), KL bóc đúng theo dữ liệu đã upload của chính nó.
    const rowB = await queryOne<{
      status: string;
      standardize_report: { takeoff?: { lines?: unknown[] } };
    }>(`SELECT status, standardize_report FROM drawing_revisions WHERE id = ?`, upB.revisionId);
    assert.equal(rowB?.status, "approved");
    const klB = docKlBocTuBaoCao(rowB!.standardize_report);
    assert.deepEqual(klB?.theoHe, [{ nhan: "HVAC (m)", khoiLuong: 35 }]);
    assert.deepEqual(klB?.theoVung, [{ nhan: "Tầng 6 (m)", khoiLuong: 35 }]);

    // listRevisions phải thấy đúng 2 rev với đúng trạng thái mới nhất.
    const revs = await listRevisions(DRAWING);
    const byId = new Map(revs.map((r) => [r.id, r]));
    assert.equal(byId.get(upA.revisionId)?.status, "superseded");
    assert.equal(byId.get(upB.revisionId)?.status, "approved");

    // Excel gộp (layDongTakeoffChoExport) đọc TỪ MỌI revision plugin của dự án — mỗi dòng
    // gắn đúng rev nguồn của nó, không lẫn lộn giữa các revision.
    const dong = await layDongTakeoffChoExport(PROJECT_ID);
    const cuaDrawing = dong.filter((d) => d.drawingCode === "VDBV-TEST-001");
    assert.equal(cuaDrawing.length, 2);
    const dongA = cuaDrawing.find((d) => d.rev === "A");
    const dongB = cuaDrawing.find((d) => d.rev === "B");
    assert.equal(dongA?.khoiLuong, 20);
    assert.equal(dongA?.vung, "Tầng 5");
    assert.equal(dongB?.khoiLuong, 35);
    assert.equal(dongB?.vung, "Tầng 6");
  },
);
