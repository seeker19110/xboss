import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M99 PR5 — nhận bản vẽ từ plugin AutoCAD. Unit (kiểm định thuần) + integration (cần
// Postgres qua TEST_DATABASE_URL, không có thì tự skip). Kiểm: AC5 (kiểm định fail →
// KHÔNG tạo revision), rule pack cũ bị chặn (AC8 phía server), tạo revision đúng
// source_tool/plugin + báo cáo, idempotent theo sha256, xung đột rev.
import { test, before } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

// DXF tối thiểu nhưng HỢP LỆ với validateDxf/parseDxf: bảng layer + 1 LINE + EOF.
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

before(async () => {
  if (!HAS_TEST_DB) return;
  const { query, insertId, queryOne } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('PluginUpload','plugin-upload-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer' RETURNING id`,
  );
  U = rows[0].id;
  const daCo = await queryOne<{ id: number }>(`SELECT id FROM drawings WHERE code = 'PU-TEST-001'`);
  DRAWING =
    daCo?.id ??
    (await insertId(
      `INSERT INTO drawings (code, name, kind, created_by) VALUES ('PU-TEST-001','Bản vẽ test PR5','shop',?)`,
      U,
    ));
  // Dọn revision của lần chạy trước — test idempotency phải bắt đầu sạch.
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM drawing_revisions WHERE drawing_id = ?`, DRAWING);
});

test("kiểm định thuần: rule pack cũ bị chặn (AC8), DXF hỏng cấu trúc bị chặn (FR10)", async () => {
  const { kiemDinhPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
  const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
  const vHienHanh = getCurrentRulePack().version;

  const cu = kiemDinhPluginUpload(DXF_HOP_LE, "0.0.1-cu");
  assert.equal(cu.ok, false);
  assert.ok(cu.errors.some((e) => e.includes("không phải bản đang phát hành")));

  const hong = kiemDinhPluginUpload("0\nSECTION\nrác không phải DXF", vHienHanh);
  assert.equal(hong.ok, false);

  const dat = kiemDinhPluginUpload(DXF_HOP_LE, vHienHanh);
  assert.equal(dat.ok, true, JSON.stringify(dat.errors));
  assert.ok((dat.stats?.entities ?? 0) >= 1);
});

test(
  "upload đạt → tạo revision source_tool=plugin kèm báo cáo; cùng tệp lần 2 → idempotent",
  S,
  async () => {
    const { xuLyPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const { queryOne } = await import("@/lib/db");
    const v = getCurrentRulePack().version;
    const dwg = Buffer.from("gia-lap-noi-dung-dwg-1");

    const kq = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "A",
      rulePackVersion: v,
      dwg,
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: { cheDo: "chuan-hoa" },
    });
    assert.equal(kq.status, "created");
    if (kq.status !== "created") return;

    const row = await queryOne<{
      source_tool: string;
      rule_pack_version: string;
      status: string;
      standardize_report: { cheDo?: string; serverValidation?: { ok: boolean } };
    }>(
      `SELECT source_tool, rule_pack_version, status, standardize_report
       FROM drawing_revisions WHERE id = ?`,
      kq.revisionId,
    );
    assert.equal(row?.source_tool, "plugin");
    assert.equal(row?.rule_pack_version, v);
    assert.equal(row?.status, "submitted"); // FR: revision plugin vào trạng thái submitted
    assert.equal(row?.standardize_report?.cheDo, "chuan-hoa");
    assert.equal(row?.standardize_report?.serverValidation?.ok, true);

    // Cùng tệp gửi lại → trả đúng revision cũ, không tạo bản đôi (M99 §12 idempotent).
    const lai = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "A",
      rulePackVersion: v,
      dwg,
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: null,
    });
    assert.equal(lai.status, "idempotent");
    if (lai.status === "idempotent") assert.equal(lai.revisionId, kq.revisionId);

    // Cùng rev nhưng NỘI DUNG khác → xung đột, bắt tăng rev (không lặng lẽ đè).
    const khac = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "A",
      rulePackVersion: v,
      dwg: Buffer.from("noi-dung-khac"),
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: null,
    });
    assert.equal(khac.status, "rev-conflict");
  },
);

test(
  "upload kèm sidecar KL bóc (M101 PR5) → lưu vào standardize_report.takeoff, KHÔNG đụng bảng BOQ; " +
    "upload cũ không kèm KL vẫn chạy y nguyên",
  S,
  async () => {
    const { xuLyPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const { queryOne } = await import("@/lib/db");
    const v = getCurrentRulePack().version;

    // Đếm dòng bảng BOQ (work_packages/tasks có boq_code) trước — không có đường ghi mới nào vào đó.
    const boqTruoc = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tasks WHERE boq_code IS NOT NULL`,
    );

    const kq = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "C",
      rulePackVersion: v,
      dwg: Buffer.from("gia-lap-noi-dung-dwg-kem-takeoff"),
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: { cheDo: "chuan-hoa" },
      takeoff: { rulePackVersion: v, lines: [{ itemId: "duct-supp", khoiLuong: 12.5 }] },
    });
    assert.equal(kq.status, "created");
    if (kq.status !== "created") return;

    const row = await queryOne<{
      standardize_report: { cheDo?: string; takeoff?: { lines?: unknown[] } };
    }>(`SELECT standardize_report FROM drawing_revisions WHERE id = ?`, kq.revisionId);
    assert.equal(row?.standardize_report?.cheDo, "chuan-hoa");
    assert.equal(row?.standardize_report?.takeoff?.lines?.length, 1);

    const boqSau = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tasks WHERE boq_code IS NOT NULL`,
    );
    assert.equal(boqSau?.n, boqTruoc?.n); // không có dòng nào ghi thêm vào bảng BOQ

    // Upload cũ (không kèm takeoff) — chạy y nguyên, không có khối "takeoff" nào trong report.
    const cu = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "D",
      rulePackVersion: v,
      dwg: Buffer.from("gia-lap-noi-dung-dwg-khong-takeoff"),
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: null,
    });
    assert.equal(cu.status, "created");
    if (cu.status !== "created") return;
    const rowCu = await queryOne<{ standardize_report: { takeoff?: unknown } }>(
      `SELECT standardize_report FROM drawing_revisions WHERE id = ?`,
      cu.revisionId,
    );
    assert.equal(rowCu?.standardize_report?.takeoff, undefined);
  },
);

test("kiểm định fail → KHÔNG tạo revision (AC5)", S, async () => {
  const { xuLyPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
  const { queryOne } = await import("@/lib/db");
  const truoc = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM drawing_revisions WHERE drawing_id = ?`,
    DRAWING,
  );
  const kq = await xuLyPluginUpload({
    drawingId: DRAWING,
    orgId: 1,
    userId: U,
    rev: "B",
    rulePackVersion: "0.0.1-cu",
    dwg: Buffer.from("x"),
    dwgName: "T05.dwg",
    dxfText: DXF_HOP_LE,
    report: null,
  });
  assert.equal(kq.status, "invalid");
  const sau = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM drawing_revisions WHERE drawing_id = ?`,
    DRAWING,
  );
  assert.equal(sau?.n, truoc?.n); // không thêm dòng nào
});

test(
  "upload kèm sidecar phối hợp (M116 PR3) → lưu vào standardize_report.phoiHop; " +
    "upload cũ không kèm vẫn chạy y nguyên",
  S,
  async () => {
    const { xuLyPluginUpload } = await import("@/lib/ky-thuat/cad/dashboard");
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const { queryOne } = await import("@/lib/db");
    const v = getCurrentRulePack().version;

    const kq = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "E",
      rulePackVersion: v,
      dwg: Buffer.from("gia-lap-noi-dung-dwg-kem-phoihop"),
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: { cheDo: "chuan-hoa" },
      phoiHop: { tongSo: 2, soCung: 1, soMem: 0, soCanhBao: 1, theoLop: [] },
    });
    assert.equal(kq.status, "created");
    if (kq.status !== "created") return;

    const row = await queryOne<{
      standardize_report: { cheDo?: string; phoiHop?: { tongSo?: number } };
    }>(`SELECT standardize_report FROM drawing_revisions WHERE id = ?`, kq.revisionId);
    assert.equal(row?.standardize_report?.cheDo, "chuan-hoa");
    assert.equal(row?.standardize_report?.phoiHop?.tongSo, 2);

    // Upload cũ (không kèm phoiHop) — chạy y nguyên, không có khối "phoiHop" nào trong report.
    const cu = await xuLyPluginUpload({
      drawingId: DRAWING,
      orgId: 1,
      userId: U,
      rev: "F",
      rulePackVersion: v,
      dwg: Buffer.from("gia-lap-noi-dung-dwg-khong-phoihop"),
      dwgName: "T05.dwg",
      dxfText: DXF_HOP_LE,
      report: null,
    });
    assert.equal(cu.status, "created");
    if (cu.status !== "created") return;
    const rowCu = await queryOne<{ standardize_report: { phoiHop?: unknown } }>(
      `SELECT standardize_report FROM drawing_revisions WHERE id = ?`,
      cu.revisionId,
    );
    assert.equal(rowCu?.standardize_report?.phoiHop, undefined);
  },
);
