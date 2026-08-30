import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M104 — thêm block vào thư viện THẲNG từ web (thư viện đa tệp, không qua hàng chờ duyệt).
// (1) Unit thuần: manifest đa tệp (fileKey/fileSha256/previewSvg) — nhận đúng, chặn khoá tự đặt,
//     tương thích ngược manifest cũ (AC7); ứng viên M103 không được bỏ fileKey của block web.
// (2) Route-source: POST /block-lib/blocks force-dynamic, phiên web (KHÔNG token thiết bị),
//     CAN.manageDrawings → 403 với subcon/viewer (AC5), rate limit, 413/422/409; GET có nhánh
//     `?file=` và 401 khi chưa đăng nhập (AC4).
// (3) Integration (TEST_DATABASE_URL, tự skip): thêm block → version mới ngay, entry có
//     fileKey/fileSha256/previewSvg, tệp nền giữ nguyên hash (AC1); trùng tên → 409 không tệp mồ
//     côi (AC2); DXF thiếu block / metadata thiếu → 422 (AC3); GET ?file= qua handler thật với
//     token cad (AC4); hai lượt thêm song song → hai version nối tiếp, không mất block (AC6).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");
const MANIFEST_MAU = JSON.parse(
  readFileSync(join(DOI_CHUNG, "block-lib-manifest-mau.json"), "utf8"),
) as Record<string, unknown>;
const DXF_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dxf"), "utf8");
const DWG_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dwg.txt"));

const TEN_BLOCK_MOI = "XB-TEE-DUCT-WEB";
const KHOA_MAU = "blocklib-blkxbteeduct-1756000000000-a1b2c3d4.dwg";
const SHA_MAU = "a".repeat(64);

/** DXF của một block lẻ = DXF nền + định nghĩa block mới (đúng thứ AutoCAD xuất ra). */
function dxfThemBlock(goc: string, ten: string): string {
  const khoi = [
    "0",
    "BLOCK",
    "2",
    ten,
    "70",
    "0",
    "10",
    "0.0",
    "20",
    "0.0",
    "30",
    "0.0",
    "0",
    "LINE",
    "8",
    "M-DUCT-SUPP",
    "10",
    "0.0",
    "20",
    "0.0",
    "30",
    "0.0",
    "11",
    "100.0",
    "21",
    "0.0",
    "31",
    "0.0",
    "0",
    "CIRCLE",
    "8",
    "M-DUCT-SUPP",
    "10",
    "50.0",
    "20",
    "0.0",
    "30",
    "0.0",
    "40",
    "10.0",
    "0",
    "ENDBLK",
  ].join("\n");
  const iBlocks = goc.indexOf("\nBLOCKS\n");
  const iEnd = goc.indexOf("\n0\nENDSEC", iBlocks);
  return `${goc.slice(0, iEnd)}\n${khoi}${goc.slice(iEnd)}`;
}

const DXF_BLOCK_MOI = dxfThemBlock(DXF_MAU, TEN_BLOCK_MOI);

function metaHopLe(over?: Record<string, unknown>): Record<string, unknown> {
  return {
    blockName: TEN_BLOCK_MOI,
    kind: "fitting",
    systemId: "HVAC",
    takeoffItemId: "duct-fitting",
    note: "Tê gió thêm từ web",
    ...over,
  };
}

/** Manifest mẫu + 1 entry block nằm ở tệp riêng (mô hình đa tệp M104 §1). */
function manifestDaTep(over?: Record<string, unknown>): Record<string, unknown> {
  const m = JSON.parse(JSON.stringify(MANIFEST_MAU)) as Record<string, unknown>;
  (m.blocks as Record<string, unknown>[]).push({
    id: "xb-tee-duct-web",
    blockName: TEN_BLOCK_MOI,
    kind: "fitting",
    system: "HVAC",
    takeoffItemId: "duct-fitting",
    fileKey: KHOA_MAU,
    fileSha256: SHA_MAU,
    previewSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
    ...over,
  });
  return m;
}

// ===== (1) Unit thuần — manifest đa tệp =====

test("manifest đa tệp: nhận fileKey/fileSha256/previewSvg; entry cũ không có → undefined (AC7)", async () => {
  const { docManifest } = await import("@/lib/ky-thuat/cad/block");

  // Tương thích ngược: manifest đã phát hành (không trường nào của M104) đọc y như trước.
  const cu = docManifest(JSON.parse(JSON.stringify(MANIFEST_MAU)));
  assert.deepEqual(cu.errors, []);
  assert.equal(cu.manifest?.blocks.length, 5);
  assert.equal(cu.manifest?.blocks[0].fileKey, undefined);
  assert.equal(cu.manifest?.blocks[0].fileSha256, undefined);
  assert.equal(cu.manifest?.blocks[0].previewSvg, undefined);

  const moi = docManifest(manifestDaTep());
  assert.deepEqual(moi.errors, []);
  const entry = moi.manifest?.blocks.find((b) => b.blockName === TEN_BLOCK_MOI);
  assert.equal(entry?.fileKey, KHOA_MAU);
  assert.equal(entry?.fileSha256, SHA_MAU);
  assert.ok(entry?.previewSvg?.startsWith("<svg"));
});

test("manifest đa tệp chặn: fileKey tự đặt, thiếu fileSha256, hash mồ côi, previewSvg lạ", async () => {
  const { docManifest, laKhoaTepBlockHopLe } = await import("@/lib/ky-thuat/cad/block");

  // Khoá tệp phải đúng khuôn tên do máy chủ sinh — chặn cả path traversal lẫn khoá trỏ tệp khác.
  assert.equal(laKhoaTepBlockHopLe(KHOA_MAU), true);
  for (const xau of ["../secret.dwg", "anh-cong-truong.jpg", "blocklib-x.txt", ""]) {
    assert.equal(laKhoaTepBlockHopLe(xau), false, xau);
  }
  assert.ok(
    docManifest(manifestDaTep({ fileKey: "../../etc/passwd" })).errors.some((e) =>
      e.includes("fileKey"),
    ),
  );
  assert.ok(
    docManifest(manifestDaTep({ fileSha256: "abc" })).errors.some((e) => e.includes("fileSha256")),
  );
  assert.ok(
    docManifest(manifestDaTep({ fileKey: undefined })).errors.some((e) => e.includes("fileKey")),
    "khai fileSha256 mà không có fileKey → lỗi",
  );
  assert.ok(
    docManifest(manifestDaTep({ previewSvg: "<script>alert(1)</script>" })).errors.some((e) =>
      e.includes("previewSvg"),
    ),
  );
});

test("kiemDinhManifest: block có fileKey không bị đòi nằm trong DXF nền; không fileKey vẫn bị đòi (AC7)", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block");

  // Block ở tệp riêng: DXF sidecar mô tả tệp NỀN nên không chứa nó — vẫn hợp lệ.
  const daTep = kiemDinhManifest(manifestDaTep(), DWG_MAU, DXF_MAU);
  assert.equal(daTep.ok, true, JSON.stringify(daTep.errors));
  assert.deepEqual(daTep.warnings, []);

  // Cùng entry nhưng bỏ fileKey/fileSha256 → coi như nằm trong tệp nền, và tệp nền không có nó.
  const trongNen = kiemDinhManifest(
    manifestDaTep({ fileKey: undefined, fileSha256: undefined }),
    DWG_MAU,
    DXF_MAU,
  );
  assert.equal(trongNen.ok, false);
  assert.ok(trongNen.errors.some((e) => e.includes(TEN_BLOCK_MOI)));

  // Bộ mẫu gốc (không có trường M104 nào) không đổi kết quả — hồi quy AC7.
  const goc = kiemDinhManifest(JSON.parse(JSON.stringify(MANIFEST_MAU)), DWG_MAU, DXF_MAU);
  assert.equal(goc.ok, true);
  assert.deepEqual(goc.warnings, []);
});

test("đề xuất M103 không được bỏ fileKey của block thêm từ web", async () => {
  const { soSanhManifestUngVien } = await import("@/lib/ky-thuat/cad/block");
  const { docManifest } = await import("@/lib/ky-thuat/cad/block");

  const hienHanh = docManifest(manifestDaTep()).manifest!;
  const ungVien = docManifest(manifestDaTep()).manifest!;
  ungVien.blocks.push({ id: "them-tu-cad", blockName: "XB-CAD-MOI", kind: "fitting" });
  assert.deepEqual(soSanhManifestUngVien(hienHanh, ungVien, "XB-CAD-MOI"), []);

  const nuotFileKey = docManifest(manifestDaTep()).manifest!;
  nuotFileKey.blocks.push({ id: "them-tu-cad", blockName: "XB-CAD-MOI", kind: "fitting" });
  delete nuotFileKey.blocks.find((b) => b.blockName === TEN_BLOCK_MOI)!.fileKey;
  assert.ok(
    soSanhManifestUngVien(hienHanh, nuotFileKey, "XB-CAD-MOI").some((e) => e.includes("fileKey")),
  );
});

test("metadata thêm từ web: nhận camelCase (M104 §2) lẫn snake_case (M103 §3)", async () => {
  const { docMetaBlockCoBan } = await import("@/lib/ky-thuat/cad/block");

  assert.deepEqual(docMetaBlockCoBan(metaHopLe()).errors, []);
  assert.equal(docMetaBlockCoBan(metaHopLe()).meta?.systemId, "HVAC");
  assert.deepEqual(
    docMetaBlockCoBan({
      block_name: TEN_BLOCK_MOI,
      kind: "fitting",
      system_id: "HVAC",
      takeoff_item_id: "duct-fitting",
    }).errors,
    [],
  );
  // Luật bắt buộc theo kind giữ nguyên của M103.
  assert.ok(
    docMetaBlockCoBan(metaHopLe({ systemId: "" })).errors.some((e) => e.includes("system_id")),
  );
  assert.ok(
    docMetaBlockCoBan(metaHopLe({ takeoffItemId: "" })).errors.some((e) =>
      e.includes("takeoff_item_id"),
    ),
  );
  assert.deepEqual(
    docMetaBlockCoBan({ blockName: "XB-KHUNG-A1", kind: "titleblock", paperSize: "A1" }).errors,
    [],
  );
});

// ===== (2) Route-source =====

test("route POST /block-lib/blocks: phiên web, CAN.manageDrawings, 401/403/413/422/409 (AC5)", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "block-lib", "blocks", "route.ts"),
    "utf8",
  );
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /CAN\.manageDrawings/);
  assert.match(src, /status: 401/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 413/);
  assert.match(src, /status: 422/);
  assert.match(src, /status: 409/);
  assert.match(src, /hitRateLimit\(`cad-block-lib:/);
  // Thêm thẳng KHÔNG qua duyệt nên chỉ chấp nhận phiên web — token thiết bị đi đường M103.
  assert.ok(!src.includes("getCadTokenUser"), "POST không được nhận token thiết bị");

  // Kiểm kích thước THẬT sau khi parse form, TRƯỚC khi buffer nội dung vào RAM.
  const iForm = src.indexOf("await req.formData()");
  const iSize = src.indexOf("dwg.size > GIOI_HAN_TEP_CAD");
  const iBuf = src.indexOf("dwg.arrayBuffer()");
  assert.ok(iForm >= 0 && iSize >= 0 && iBuf >= 0);
  assert.ok(iForm < iSize && iSize < iBuf);
});

test("quyền thêm block từ web: admin/pm/engineer có, subcon/viewer/bch không (AC5)", async () => {
  const { CAN } = await import("@/lib/bao-mat/auth");
  for (const r of ["admin", "pm", "engineer"] as const) {
    assert.equal(CAN.manageDrawings(r), true, r);
  }
  for (const r of ["subcon", "viewer", "bch", "cdt"] as const) {
    assert.equal(CAN.manageDrawings(r), false, r);
  }
});

test("route GET block-lib: nhánh ?file= trả tệp lẻ, 401 khi chưa đăng nhập (AC4)", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "block-lib", "route.ts"),
    "utf8",
  );
  assert.match(src, /searchParams\.get\("file"\)/);
  assert.match(src, /timBlockLeTheoKhoa/);
  assert.match(src, /docTepBlockLe/);
  assert.match(src, /status: 404/);
  assert.match(src, /status: 401/);
  assert.match(src, /getCadTokenUser/);
});

test("GET block-proposals trả cờ duocThemTrucTiep cho panel web (M104 §3)", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "block-proposals", "route.ts"),
    "utf8",
  );
  assert.match(src, /duocThemTrucTiep: CAN\.manageDrawings\(user\.role\)/);
});

// ===== (3) Integration (Postgres) =====

let pmId = 0;
let engineerId = 0;
const daLuu: string[] = [];

async function donDep() {
  const { query, run } = await import("@/lib/db");
  for (const r of await query<{ k: string }>(
    `SELECT candidate_storage_key AS k FROM cad_block_proposals
     UNION ALL SELECT storage_key AS k FROM cad_block_libs`,
  )) {
    daLuu.push(r.k);
  }
  // Khoá tệp lẻ nằm trong manifest chứ không có cột riêng — gom nốt để hook after() dọn sạch.
  for (const r of await query<{ k: string }>(
    `SELECT jsonb_array_elements(manifest -> 'blocks') ->> 'fileKey' AS k FROM cad_block_libs`,
  )) {
    if (r.k) daLuu.push(r.k);
  }
  await run(`DELETE FROM cad_block_proposals`);
  await run(`DELETE FROM cad_block_libs`);
}

/** Phát hành thư viện nền b0-mau (tệp nền của mọi ca dưới đây). */
async function phatHanhNen(): Promise<{ version: string; sha: string; storageKey: string }> {
  const { phatHanhBlockLib, layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");
  const kq = await phatHanhBlockLib({
    userId: pmId,
    manifestTho: JSON.parse(JSON.stringify(MANIFEST_MAU)),
    dwg: DWG_MAU,
    dxfText: DXF_MAU,
  });
  assert.ok(kq.status === "created" || kq.status === "idempotent", JSON.stringify(kq));
  const row = await layBlockLibHienHanh();
  assert.ok(row);
  daLuu.push(row.storageKey);
  return { version: row.version, sha: row.dwgSha256, storageKey: row.storageKey };
}

/** Số tệp thư viện block đang nằm trong kho lưu trữ cục bộ (để bắt tệp mồ côi). */
async function demTepKho(): Promise<number> {
  const { UPLOAD_DIR } = await import("@/lib/nen/photos");
  try {
    return readdirSync(UPLOAD_DIR).filter((f) => f.startsWith("blocklib-")).length;
  } catch {
    return 0;
  }
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const dau = Date.now();
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM thư viện', 'bw-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  engineerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư thêm block', 'bw-eng-${dau}@test.local', 'x', 'engineer', 1)`,
  );
  await donDep();
});

after(async () => {
  if (!HAS_TEST_DB || !pmId) return;
  const { run } = await import("@/lib/db");
  const { storageDelete } = await import("@/lib/nen/storage");
  await donDep();
  for (const key of new Set(daLuu)) {
    await storageDelete(1, key);
    await storageDelete(1, `${key}.sidecar.dxf`);
  }
  await run(`DELETE FROM api_keys WHERE created_by IN (?, ?)`, pmId, engineerId);
  await run(`DELETE FROM users WHERE id IN (?, ?)`, pmId, engineerId);
});

test(
  "thêm block từ web → version mới NGAY, entry có fileKey/sha/preview, tệp nền không đổi (AC1)",
  S,
  async () => {
    await donDep();
    const nen = await phatHanhNen();
    const { themBlockTuWeb, timBlockLeTheoKhoa, docTepBlockLe } =
      await import("@/lib/ky-thuat/cad/block");
    const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");
    const { queryOne } = await import("@/lib/db");

    const kq = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe(),
      dwg: DWG_MAU,
      dxfText: DXF_BLOCK_MOI,
    });
    assert.equal(kq.status, "created", JSON.stringify(kq));
    if (kq.status !== "created") return;
    assert.equal(kq.version, "b1-mau");
    assert.equal(kq.coPreview, true, "phải dựng được ảnh xem trước từ .dxf");

    const moi = await layBlockLibHienHanh();
    assert.ok(moi);
    assert.equal(moi.version, "b1-mau");
    assert.equal(moi.manifest.version, "b1-mau");
    assert.equal(moi.manifest.blocks.length, 6);
    // Tệp nền giữ nguyên (AC1): cùng storage_key + cùng hash với version trước.
    assert.equal(moi.storageKey, nen.storageKey);
    assert.equal(moi.dwgSha256, nen.sha);
    assert.equal(moi.manifest.dwgSha256, nen.sha);
    assert.equal(moi.nguoiPhatHanh, "Kỹ sư thêm block");

    const entry = moi.manifest.blocks.find((b) => b.blockName === TEN_BLOCK_MOI);
    assert.ok(entry, "entry mới phải có trong manifest");
    assert.ok(entry.fileKey?.startsWith("blocklib-"));
    assert.equal(entry.fileSha256, createHash("sha256").update(DWG_MAU).digest("hex"));
    assert.ok(entry.previewSvg?.startsWith("<svg"));
    assert.equal(entry.system, "HVAC");
    assert.equal(entry.takeoffItemId, "duct-fitting");
    if (entry.fileKey) daLuu.push(entry.fileKey);

    // Tệp lẻ tra được theo khoá và đọc lại nguyên vẹn.
    const le = await timBlockLeTheoKhoa(entry.fileKey!);
    assert.equal(le?.version, "b1-mau");
    assert.equal(le?.entry.blockName, TEN_BLOCK_MOI);
    const tep = await docTepBlockLe(entry.fileKey!);
    assert.ok(tep && tep.equals(DWG_MAU));
    assert.equal(await timBlockLeTheoKhoa("blocklib-khong-co-that-1-aaaa.dwg"), null);
    assert.equal(await timBlockLeTheoKhoa("../lung-tung.dwg"), null);

    // Manifest cũ vẫn đọc/kiểm được: đúng 1 version mới, không đụng dòng cũ (AC7).
    const dem = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    assert.equal(dem?.n, 2);
  },
);

test(
  "trùng tên (thư viện hoặc đề xuất pending) → 409, không sinh version, không tệp mồ côi (AC2)",
  S,
  async () => {
    await donDep();
    await phatHanhNen();
    const { themBlockTuWeb } = await import("@/lib/ky-thuat/cad/block");
    const { queryOne } = await import("@/lib/db");

    const truocTep = await demTepKho();

    // (a) trùng với block đã có trong thư viện hiện hành.
    const trungThuVien = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe({ blockName: "fcu", kind: "equipment" }),
      dwg: DWG_MAU,
      dxfText: DXF_BLOCK_MOI,
    });
    assert.equal(trungThuVien.status, "conflict");
    if (trungThuVien.status === "conflict") {
      assert.equal(trungThuVien.loai, "trung-ten");
      assert.match(trungThuVien.message, /đã có block tên/);
    }

    // (b) trùng với một đề xuất M103 đang chờ duyệt.
    const { run } = await import("@/lib/db");
    await run(
      `INSERT INTO cad_block_proposals
       (block_name, kind, system_id, takeoff_item_id, base_lib_version, candidate_manifest,
        candidate_storage_key, candidate_dwg_sha256, status, proposed_by)
     VALUES (?, 'fitting', 'HVAC', 'duct-fitting', 'b0-mau', '{}'::jsonb, 'x', ?, 'pending', ?)`,
      TEN_BLOCK_MOI,
      "b".repeat(64),
      engineerId,
    );
    const trungCho = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe(),
      dwg: DWG_MAU,
      dxfText: DXF_BLOCK_MOI,
    });
    assert.equal(trungCho.status, "conflict");
    if (trungCho.status === "conflict") {
      assert.equal(trungCho.loai, "trung-ten");
      assert.match(trungCho.message, /đang chờ duyệt/);
    }

    // Không version mới, không tệp nào rơi lại trong kho lưu trữ.
    const dem = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    assert.equal(dem?.n, 1);
    assert.equal(await demTepKho(), truocTep, "không được để tệp mồ côi khi từ chối");
  },
);

test(
  "DXF thiếu định nghĩa block / metadata thiếu theo kind / tệp .dwg sai → 422 (AC3)",
  S,
  async () => {
    await donDep();
    await phatHanhNen();
    const { themBlockTuWeb } = await import("@/lib/ky-thuat/cad/block");
    const { queryOne } = await import("@/lib/db");
    const truocTep = await demTepKho();

    // DXF nền (không có định nghĩa block đang thêm).
    const thieuBlock = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe(),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
    });
    assert.equal(thieuBlock.status, "invalid");
    if (thieuBlock.status === "invalid") {
      assert.ok(thieuBlock.errors.some((e) => e.includes(TEN_BLOCK_MOI)));
    }

    // Metadata thiếu theo kind (fitting phải có hạng mục bóc tách).
    const thieuMeta = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe({ takeoffItemId: "" }),
      dwg: DWG_MAU,
      dxfText: DXF_BLOCK_MOI,
    });
    assert.equal(thieuMeta.status, "invalid");
    if (thieuMeta.status === "invalid") {
      assert.ok(thieuMeta.errors.some((e) => e.includes("takeoff_item_id")));
    }

    // Thiết bị phải có thẻ TAG trong chính định nghĩa block (M100 FR6) — DXF mẫu không có ATTDEF.
    const thieuTag = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe({ kind: "equipment" }),
      dwg: DWG_MAU,
      dxfText: DXF_BLOCK_MOI,
    });
    assert.equal(thieuTag.status, "invalid");
    if (thieuTag.status === "invalid") assert.ok(thieuTag.errors.some((e) => e.includes("TAG")));

    // Kéo nhầm bản DXF vào ô .dwg.
    const saiDinhDang = await themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe(),
      dwg: Buffer.from(DXF_BLOCK_MOI, "utf8"),
      dxfText: DXF_BLOCK_MOI,
    });
    assert.equal(saiDinhDang.status, "invalid");

    const dem = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    assert.equal(dem?.n, 1);
    assert.equal(await demTepKho(), truocTep);
  },
);

test("chưa có thư viện nền → 409 chua-co-thu-vien, không tệp mồ côi", S, async () => {
  await donDep();
  const { themBlockTuWeb } = await import("@/lib/ky-thuat/cad/block");
  const truocTep = await demTepKho();

  const kq = await themBlockTuWeb({
    userId: engineerId,
    metaTho: metaHopLe(),
    dwg: DWG_MAU,
    dxfText: DXF_BLOCK_MOI,
  });
  assert.equal(kq.status, "conflict");
  if (kq.status === "conflict") assert.equal(kq.loai, "chua-co-thu-vien");
  assert.equal(await demTepKho(), truocTep);
});

test("GET ?file= qua handler thật: token cad tải được tệp lẻ; khoá lạ → 404 (AC4)", S, async () => {
  await donDep();
  await phatHanhNen();
  const { themBlockTuWeb } = await import("@/lib/ky-thuat/cad/block");
  const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");
  const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
  const { GET } = await import("@/app/api/engineering/cad/block-lib/route");

  const kq = await themBlockTuWeb({
    userId: engineerId,
    metaTho: metaHopLe(),
    dwg: DWG_MAU,
    dxfText: DXF_BLOCK_MOI,
  });
  assert.equal(kq.status, "created", JSON.stringify(kq));
  const moi = await layBlockLibHienHanh();
  const fileKey = moi?.manifest.blocks.find((b) => b.blockName === TEN_BLOCK_MOI)?.fileKey;
  assert.ok(fileKey);
  daLuu.push(fileKey);

  const token = await createCadToken(engineerId, 1, "May ky su", null);
  const goi = (url: string, headers: Record<string, string>) =>
    GET(new NextRequest(url, { headers }));

  const res = await goi(
    `http://x/api/engineering/cad/block-lib?file=${encodeURIComponent(fileKey)}`,
    { authorization: `Bearer ${token.key}` },
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/acad");
  assert.equal(res.headers.get("x-block-lib-version"), "b1-mau");
  assert.equal(
    res.headers.get("x-block-file-sha256"),
    createHash("sha256").update(DWG_MAU).digest("hex"),
  );
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(DWG_MAU));

  // Cache còn mới → 304.
  const etag = res.headers.get("etag");
  assert.ok(etag);
  const res304 = await goi(
    `http://x/api/engineering/cad/block-lib?file=${encodeURIComponent(fileKey)}`,
    { authorization: `Bearer ${token.key}`, "if-none-match": etag },
  );
  assert.equal(res304.status, 304);

  // Khoá không thuộc manifest nào (kể cả khoá đúng khuôn) → 404, không đọc tệp tuỳ ý.
  for (const xau of ["blocklib-la-1756000000000-deadbeef.dwg", "../../etc/passwd"]) {
    const res404 = await goi(
      `http://x/api/engineering/cad/block-lib?file=${encodeURIComponent(xau)}`,
      { authorization: `Bearer ${token.key}` },
    );
    assert.equal(res404.status, 404, xau);
  }

  // Tải tệp NỀN vẫn như cũ (không đụng nhánh ?file=).
  const resNen = await goi("http://x/api/engineering/cad/block-lib", {
    authorization: `Bearer ${token.key}`,
  });
  assert.equal(resNen.status, 200);
  assert.ok(Buffer.from(await resNen.arrayBuffer()).equals(DWG_MAU));
});

test("hai lượt thêm SONG SONG: hai version nối tiếp, không mất block nào (AC6)", S, async () => {
  await donDep();
  await phatHanhNen();
  const { themBlockTuWeb } = await import("@/lib/ky-thuat/cad/block");
  const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");

  const tenB = "XB-RED-DUCT-WEB";
  const [a, b] = await Promise.all([
    themBlockTuWeb({
      userId: engineerId,
      metaTho: metaHopLe(),
      dwg: DWG_MAU,
      dxfText: DXF_BLOCK_MOI,
    }),
    themBlockTuWeb({
      userId: pmId,
      metaTho: metaHopLe({ blockName: tenB }),
      dwg: Buffer.concat([DWG_MAU, Buffer.from("b")]),
      dxfText: dxfThemBlock(DXF_MAU, tenB),
    }),
  ]);
  assert.equal(a.status, "created", JSON.stringify(a));
  assert.equal(b.status, "created", JSON.stringify(b));
  if (a.status !== "created" || b.status !== "created") return;
  assert.notEqual(a.version, b.version, "hai lượt phải sinh hai nhãn version khác nhau");
  assert.deepEqual([a.version, b.version].sort(), ["b1-mau", "b2-mau"]);

  const moi = await layBlockLibHienHanh();
  assert.ok(moi);
  assert.equal(moi.manifest.blocks.length, 7, "version cuối phải giữ CẢ hai block mới");
  for (const ten of [TEN_BLOCK_MOI, tenB]) {
    const e = moi.manifest.blocks.find((x) => x.blockName === ten);
    assert.ok(e?.fileKey, `block ${ten} phải còn trong manifest cuối kèm fileKey`);
    if (e?.fileKey) daLuu.push(e.fileKey);
  }
});
