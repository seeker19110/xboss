import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M103 — đề xuất block vào thư viện từ AutoCAD (hàng chờ + duyệt).
// (1) Unit thuần: ảnh xem trước SVG (không cần DB), kiểm metadata theo kind, so manifest ứng viên
//     với thư viện hiện hành ("hiện hành + đúng 1 block mới").
// (2) Route-source: force-dynamic, auth 401/403, approve/reject KHÔNG nhận token thiết bị.
// (3) Integration (TEST_DATABASE_URL, tự skip): nhận đề xuất → idempotent → trùng tên 409 →
//     stale 409 → duyệt phát hành version mới (AC1/AC2) → hai đề xuất cùng base, cái sau stale
//     và thư viện KHÔNG mất block của cái trước (AC4) → từ chối; và POST/approve qua handler
//     thật với token thiết bị (AC6).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import type { DxfEntityRaw } from "@/lib/ky-thuat/cad/dxf-parser";

const S = { skip: !HAS_TEST_DB };

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");
const MANIFEST_MAU = JSON.parse(
  readFileSync(join(DOI_CHUNG, "block-lib-manifest-mau.json"), "utf8"),
) as Record<string, unknown>;
const DXF_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dxf"), "utf8");
const DWG_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dwg.txt"));

const TEN_BLOCK_MOI = "XB-TEE-DUCT";

/** DXF ứng viên = DXF thư viện hiện hành + một định nghĩa block mới (đúng thứ plugin xuất ra). */
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
    "LINE",
    "8",
    "M-DUCT-SUPP",
    "10",
    "50.0",
    "20",
    "0.0",
    "30",
    "0.0",
    "11",
    "50.0",
    "21",
    "80.0",
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

const DXF_UNG_VIEN = dxfThemBlock(DXF_MAU, TEN_BLOCK_MOI);

/** Manifest ứng viên = manifest hiện hành + đúng 1 entry mới. */
function manifestUngVien(ten = TEN_BLOCK_MOI, sha?: string): Record<string, unknown> {
  const m = JSON.parse(JSON.stringify(MANIFEST_MAU)) as Record<string, unknown>;
  (m.blocks as Record<string, unknown>[]).push({
    id: `tee-duct-${ten.toLowerCase()}`,
    blockName: ten,
    kind: "fitting",
    system: "HVAC",
    scaleBySize: true,
    rotateToPath: true,
    takeoffItemId: "duct-fitting",
  });
  if (sha) m.dwgSha256 = sha;
  return m;
}

function metaHopLe(over?: Record<string, unknown>): Record<string, unknown> {
  return {
    block_name: TEN_BLOCK_MOI,
    kind: "fitting",
    system_id: "HVAC",
    takeoff_item_id: "duct-fitting",
    note: "Tê gió 3 nhánh",
    base_lib_version: "b0-mau",
    candidate_manifest: manifestUngVien(),
    sha256: createHash("sha256").update(DWG_MAU).digest("hex"),
    ...over,
  };
}

// ===== (1) Unit thuần — ảnh xem trước SVG =====

function ent(e: Partial<DxfEntityRaw> & { type: DxfEntityRaw["type"] }): DxfEntityRaw {
  return { id: e.id ?? "x", layer: e.layer ?? "0", coordinates: {}, ...e } as DxfEntityRaw;
}

test("preview SVG: viewBox khớp khung bao, lật trục Y, dùng currentColor (không hex cứng)", async () => {
  const { dungPreviewSvg } = await import("@/lib/ky-thuat/cad/block-preview-svg");
  const svg = dungPreviewSvg(
    [
      ent({ type: "LINE", coordinates: { start: [0, 0, 0], end: [100, 0, 0] } }),
      ent({ type: "LINE", coordinates: { start: [100, 0, 0], end: [100, 50, 0] } }),
    ],
    TEN_BLOCK_MOI,
  );
  assert.ok(svg);
  assert.match(svg, /stroke="currentColor"/);
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(svg), "không được hardcode mã màu hex");
  // Toạ độ CAD y=50 phải thành y=-50 trong SVG (SVG có trục Y hướng xuống).
  assert.match(svg, /100,-50/);
  // viewBox = khung bao + lề 5%: minX=-5, minY=-(50)-5, rộng 110, cao 60.
  assert.match(svg, /viewBox="-5 -55 110 60"/);
  assert.match(svg, /aria-label="Xem trước block XB-TEE-DUCT"/);
});

test("preview SVG: vẽ CIRCLE/ARC/LWPOLYLINE/TEXT, bỏ qua thực thể lạ, rỗng → null", async () => {
  const { dungPreviewSvg } = await import("@/lib/ky-thuat/cad/block-preview-svg");
  const svg = dungPreviewSvg([
    ent({ type: "CIRCLE", coordinates: { center: [0, 0, 0], radius: 10 } }),
    ent({
      type: "ARC",
      coordinates: { center: [0, 0, 0], radius: 20, startAngle: 0, endAngle: 90 },
    }),
    ent({
      type: "LWPOLYLINE",
      coordinates: {
        points: [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
        ],
        closed: true,
      },
    }),
    ent({ type: "TEXT", coordinates: { center: [1, 2, 0] }, textValue: "A<B&C", textHeight: 5 }),
  ]);
  assert.ok(svg);
  assert.match(svg, /<circle /);
  // Cung AutoCAD chạy ngược kim đồng hồ → sau khi lật Y, sweep-flag phải là 0.
  assert.match(svg, /<path d="M 20 0 A 20 20 0 0 0 0 -20"\/>/);
  assert.match(svg, /<polygon /);
  assert.match(svg, /A&lt;B&amp;C/, "nội dung chữ phải được thoát XML");

  // Thực thể không hiểu (HATCH/SPLINE) bị bỏ qua im lặng — không có gì vẽ được → null.
  assert.equal(dungPreviewSvg([ent({ type: "HATCH" }), ent({ type: "SPLINE" })]), null);
  assert.equal(dungPreviewSvg([]), null);
  assert.equal(dungPreviewSvg(undefined), null);
});

test("preview SVG: toạ độ NaN/thiếu không làm hỏng ảnh", async () => {
  const { dungPreviewSvg } = await import("@/lib/ky-thuat/cad/block-preview-svg");
  const svg = dungPreviewSvg([
    ent({ type: "LINE", coordinates: { start: [Number.NaN, 0, 0], end: [1, 1, 0] } }),
    ent({ type: "LINE", coordinates: { start: [0, 0, 0], end: [10, 10, 0] } }),
  ]);
  assert.ok(svg);
  assert.ok(!svg.includes("NaN"));
});

// ===== (1) Unit thuần — metadata theo kind =====

test("metadata: bộ đủ hợp lệ; thiếu hệ / item bóc tách / khổ giấy theo kind → lỗi", async () => {
  const { docMetaDeXuat } = await import("@/lib/ky-thuat/cad/block-proposals");

  const ok = docMetaDeXuat(metaHopLe());
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.meta?.blockName, TEN_BLOCK_MOI);

  // Hệ bắt buộc với mọi kind trừ khung tên.
  assert.ok(
    docMetaDeXuat(metaHopLe({ system_id: "" })).errors.some((e) => e.includes("system_id")),
  );
  // Item bóc tách bắt buộc với kind đếm khối lượng.
  assert.ok(
    docMetaDeXuat(metaHopLe({ takeoff_item_id: "" })).errors.some((e) =>
      e.includes("takeoff_item_id"),
    ),
  );
  // Khung tên: không cần hệ/item nhưng bắt buộc khổ giấy.
  const tb = docMetaDeXuat(
    metaHopLe({ kind: "titleblock", system_id: "", takeoff_item_id: "", paper_size: "A1" }),
  );
  assert.deepEqual(tb.errors, []);
  assert.ok(
    docMetaDeXuat(
      metaHopLe({ kind: "titleblock", system_id: "", takeoff_item_id: "" }),
    ).errors.some((e) => e.includes("paper_size")),
  );
  // Khổ giấy chỉ dành cho khung tên.
  assert.ok(
    docMetaDeXuat(metaHopLe({ paper_size: "A1" })).errors.some((e) => e.includes("paper_size")),
  );
  // kind lạ, sha256 sai, thiếu base version, thiếu manifest.
  assert.ok(docMetaDeXuat(metaHopLe({ kind: "phu-kien" })).errors.some((e) => e.includes("kind")));
  assert.ok(docMetaDeXuat(metaHopLe({ sha256: "abc" })).errors.some((e) => e.includes("sha256")));
  assert.ok(
    docMetaDeXuat(metaHopLe({ base_lib_version: "" })).errors.some((e) =>
      e.includes("base_lib_version"),
    ),
  );
  assert.ok(
    docMetaDeXuat(metaHopLe({ candidate_manifest: "khong-phai-doi-tuong" })).errors.some((e) =>
      e.includes("candidate_manifest"),
    ),
  );
  assert.equal(docMetaDeXuat("chuoi").meta, null);
});

// ===== (1) Unit thuần — so manifest ứng viên =====

test("manifest ứng viên phải = hiện hành + đúng 1 block mới đúng tên", async () => {
  const { soSanhManifestUngVien } = await import("@/lib/ky-thuat/cad/block-proposals");
  const { docManifest } = await import("@/lib/ky-thuat/cad/block-lib");

  const hienHanh = docManifest(MANIFEST_MAU).manifest!;
  const ungVien = docManifest(manifestUngVien()).manifest!;
  assert.deepEqual(soSanhManifestUngVien(hienHanh, ungVien, TEN_BLOCK_MOI), []);

  // Tên trong manifest lệch tên khai trong meta.
  assert.ok(
    soSanhManifestUngVien(hienHanh, ungVien, "TEN-KHAC").some((e) => e.includes("TEN-KHAC")),
  );

  // Bỏ bớt block cũ.
  const boBot = docManifest(manifestUngVien()).manifest!;
  boBot.blocks.splice(0, 1);
  assert.ok(soSanhManifestUngVien(hienHanh, boBot, TEN_BLOCK_MOI).some((e) => e.includes("thiếu")));

  // Sửa block cũ (đổi tên block thật) — đề xuất chỉ được THÊM.
  const suaCu = docManifest(manifestUngVien()).manifest!;
  suaCu.blocks[0].blockName = "XB-DUCT-ELBOW-V2";
  assert.ok(
    soSanhManifestUngVien(hienHanh, suaCu, TEN_BLOCK_MOI).some((e) => e.includes("bị sửa")),
  );

  // Thêm 2 block một lúc.
  const themHai = docManifest(manifestUngVien()).manifest!;
  themHai.blocks.push({ id: "them-nua", blockName: "XB-KHAC", kind: "fitting" });
  assert.ok(
    soSanhManifestUngVien(hienHanh, themHai, TEN_BLOCK_MOI).some((e) => e.includes("2 block")),
  );

  // Không thêm gì.
  assert.ok(
    soSanhManifestUngVien(hienHanh, hienHanh, TEN_BLOCK_MOI).some((e) =>
      e.includes("không thêm block nào"),
    ),
  );
});

test("versionKeTiep: tăng cụm số cuối, giữ phần chữ", async () => {
  const { versionKeTiep } = await import("@/lib/ky-thuat/cad/block-lib");
  assert.equal(versionKeTiep("b1"), "b2");
  assert.equal(versionKeTiep("b9"), "b10");
  assert.equal(versionKeTiep("b0-mau"), "b1-mau");
  assert.equal(versionKeTiep("beta"), "beta-2");
});

// ===== (2) Route-source =====

function nguon(...phan: string[]): string {
  return readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "block-proposals", ...phan),
    "utf8",
  );
}

test("route block-proposals: force-dynamic, 401/403, rate limit, 413/422/409", () => {
  const src = nguon("route.ts");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /getCadTokenUser/);
  assert.match(src, /CAN\.manageDrawings/);
  assert.match(src, /status: 401/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 413/);
  assert.match(src, /status: 422/);
  assert.match(src, /status: 409/);
  assert.match(src, /hitRateLimit\(`cad-block-proposal:/);

  // Kiểm kích thước THẬT sau khi parse form, TRƯỚC khi buffer nội dung vào RAM.
  const post = src.slice(src.indexOf("export async function POST"));
  const iForm = post.indexOf("await req.formData()");
  const iSize = post.indexOf("dwg.size > GIOI_HAN_TEP_CAD");
  const iBuf = post.indexOf("dwg.arrayBuffer()");
  assert.ok(iForm >= 0 && iSize >= 0 && iBuf >= 0);
  assert.ok(iForm < iSize && iSize < iBuf);
});

test("route approve/reject: CHỈ phiên web Admin/PM — không nhận token thiết bị", () => {
  for (const p of [
    ["[id]", "approve", "route.ts"],
    ["[id]", "reject", "route.ts"],
  ]) {
    const src = nguon(...p);
    assert.match(src, /export const dynamic = "force-dynamic"/);
    assert.match(src, /getCurrentUser\(\)/);
    assert.match(src, /CAN\.approve\(user\.role\)/);
    assert.match(src, /status: 401/);
    assert.match(src, /status: 403/);
    assert.ok(!src.includes("getCadTokenUser"), `${p.join("/")} không được nhận token thiết bị`);
  }
  assert.match(nguon("[id]", "reject", "route.ts"), /Phải nhập lý do từ chối/);
});

// ===== (3) Integration (Postgres) =====

let pmId = 0;
let engineerId = 0;
let subconId = 0;
const daLuu: string[] = [];

/**
 * Dọn sạch hàng chờ + thư viện trước mỗi ca để các ca độc lập nhau. Gom khoá lưu trữ TRƯỚC khi
 * xoá dòng, nếu không tệp trong data/uploads/ thành mồ côi (không còn dòng nào trỏ tới để hook
 * after() tìm ra).
 */
async function donDep() {
  const { query, run } = await import("@/lib/db");
  for (const r of await query<{ k: string }>(
    `SELECT candidate_storage_key AS k FROM cad_block_proposals
     UNION ALL SELECT storage_key AS k FROM cad_block_libs`,
  )) {
    daLuu.push(r.k);
  }
  await run(`DELETE FROM cad_block_proposals`);
  await run(`DELETE FROM cad_block_libs`);
}

/** Phát hành thư viện nền b0-mau và trả version hiện hành. */
async function phatHanhNen(): Promise<string> {
  const { phatHanhBlockLib, layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block-lib");
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
  return row.version;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const dau = Date.now();
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM duyệt block', 'bp-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  engineerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư đề xuất', 'bp-eng-${dau}@test.local', 'x', 'engineer', 1)`,
  );
  subconId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Thầu phụ', 'bp-sub-${dau}@test.local', 'x', 'subcon', 1)`,
  );
  await donDep();
});

after(async () => {
  if (!HAS_TEST_DB || !pmId) return;
  const { run } = await import("@/lib/db");
  const { storageDelete } = await import("@/lib/nen/storage");
  await donDep(); // gom nốt khoá lưu trữ của ca cuối rồi mới xoá tệp
  for (const key of new Set(daLuu)) {
    await storageDelete(1, key);
    await storageDelete(1, `${key}.sidecar.dxf`);
  }
  await run(`DELETE FROM api_keys WHERE created_by IN (?, ?, ?)`, pmId, engineerId, subconId);
  await run(`DELETE FROM users WHERE id IN (?, ?, ?)`, pmId, engineerId, subconId);
});

test(
  "nhận đề xuất hợp lệ → pending kèm preview; gửi lại đúng gói → idempotent (AC1)",
  S,
  async () => {
    await donDep();
    const base = await phatHanhNen();
    const { nhanDeXuat, layDanhSachDeXuat } = await import("@/lib/ky-thuat/cad/block-proposals");
    const { queryOne } = await import("@/lib/db");

    const kq = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(kq.status, "created", JSON.stringify(kq));
    if (kq.status !== "created") return;
    assert.equal(kq.coPreview, true, "phải dựng được ảnh xem trước từ sidecar");

    const ds = await layDanhSachDeXuat({ status: "pending" });
    assert.equal(ds.length, 1);
    assert.equal(ds[0].blockName, TEN_BLOCK_MOI);
    assert.equal(ds[0].statusNhan, "Chờ duyệt");
    assert.equal(ds[0].kindNhan, "Phụ kiện");
    assert.equal(ds[0].nguoiDeXuat, "Kỹ sư đề xuất");
    assert.ok(ds[0].previewSvg?.startsWith("<svg"));

    // AC1: KHÔNG có version thư viện mới nào sinh ra.
    const dem = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    assert.equal(dem?.n, 1);

    // Gửi lại đúng gói (plugin retry) → trả dòng cũ, không tạo đôi.
    const lai = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(lai.status, "idempotent");
    if (lai.status === "idempotent") assert.equal(lai.id, kq.id);
    assert.equal((await layDanhSachDeXuat({ status: "pending" })).length, 1);
  },
);

test("trùng tên (pending khác / thư viện hiện hành) → 409, không tạo dòng (AC3)", S, async () => {
  await donDep();
  const base = await phatHanhNen();
  const { nhanDeXuat, layDanhSachDeXuat } = await import("@/lib/ky-thuat/cad/block-proposals");

  await nhanDeXuat({
    userId: engineerId,
    metaTho: metaHopLe({ base_lib_version: base }),
    dwg: DWG_MAU,
    dxfText: DXF_UNG_VIEN,
  });

  // Cùng tên, gói khác (sha khác) → trùng với đề xuất đang chờ.
  const dwgKhac = Buffer.concat([DWG_MAU, Buffer.from("khac")]);
  const shaKhac = createHash("sha256").update(dwgKhac).digest("hex");
  const trungCho = await nhanDeXuat({
    userId: engineerId,
    metaTho: metaHopLe({
      base_lib_version: base,
      sha256: shaKhac,
      candidate_manifest: manifestUngVien(TEN_BLOCK_MOI, shaKhac),
    }),
    dwg: dwgKhac,
    dxfText: DXF_UNG_VIEN,
  });
  assert.equal(trungCho.status, "conflict");
  if (trungCho.status === "conflict") {
    assert.equal(trungCho.loai, "trung-ten");
    assert.match(trungCho.message, /đang chờ duyệt/);
  }
  assert.equal((await layDanhSachDeXuat({ status: "pending" })).length, 1);

  // Trùng tên với block đã có trong thư viện hiện hành.
  const trungThuVien = await nhanDeXuat({
    userId: engineerId,
    metaTho: metaHopLe({ base_lib_version: base, block_name: "fcu" }),
    dwg: DWG_MAU,
    dxfText: DXF_UNG_VIEN,
  });
  assert.equal(trungThuVien.status, "conflict");
  if (trungThuVien.status === "conflict") {
    assert.equal(trungThuVien.loai, "trung-ten");
    assert.match(trungThuVien.message, /đã có block tên/);
  }
  assert.equal((await layDanhSachDeXuat({ status: "pending" })).length, 1);
});

test(
  "base_lib_version lệch → 409 stale; metadata thiếu / sidecar không có block → 422 (AC5)",
  S,
  async () => {
    await donDep();
    const base = await phatHanhNen();
    const { nhanDeXuat } = await import("@/lib/ky-thuat/cad/block-proposals");

    const stale = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: "b-cu" }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(stale.status, "conflict");
    if (stale.status === "conflict") {
      assert.equal(stale.loai, "stale");
      assert.equal(stale.versionHienHanh, base);
    }

    const thieuMeta = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base, takeoff_item_id: "" }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(thieuMeta.status, "invalid");

    // Sidecar là bản thư viện CŨ (không có định nghĩa block mới) → 422.
    const thieuBlock = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base }),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
    });
    assert.equal(thieuBlock.status, "invalid");
    if (thieuBlock.status === "invalid") {
      assert.ok(thieuBlock.errors.some((e) => e.includes(TEN_BLOCK_MOI)));
    }

    // sha256 khai trong meta không khớp tệp → 422.
    const lechSha = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base, sha256: "a".repeat(64) }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(lechSha.status, "invalid");
  },
);

test(
  "duyệt → version thư viện mới chứa đúng block, ghi published_version + người duyệt (AC2)",
  S,
  async () => {
    await donDep();
    const base = await phatHanhNen();
    const { nhanDeXuat, duyetDeXuat, layDanhSachDeXuat } =
      await import("@/lib/ky-thuat/cad/block-proposals");
    const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block-lib");

    const kq = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(kq.status, "created");
    if (kq.status !== "created") return;

    const duyet = await duyetDeXuat({ id: kq.id, userId: pmId });
    assert.equal(duyet.status, "approved", JSON.stringify(duyet));
    if (duyet.status !== "approved") return;
    assert.equal(duyet.version, "b1-mau");

    const moi = await layBlockLibHienHanh();
    assert.ok(moi);
    assert.equal(moi.version, "b1-mau");
    assert.equal(moi.manifest.version, "b1-mau", "manifest phải mang đúng nhãn version mới");
    assert.equal(moi.manifest.blocks.length, 6);
    assert.ok(moi.manifest.blocks.some((b) => b.blockName === TEN_BLOCK_MOI));
    assert.equal(moi.nguoiPhatHanh, "PM duyệt block");

    const ds = await layDanhSachDeXuat({ status: "approved" });
    assert.equal(ds.length, 1);
    assert.equal(ds[0].publishedVersion, "b1-mau");
    assert.equal(ds[0].nguoiQuyetDinh, "PM duyệt block");
    assert.ok(ds[0].decidedAt);

    // Duyệt lại đề xuất đã duyệt → 409, không phát hành đôi.
    const lai = await duyetDeXuat({ id: kq.id, userId: pmId });
    assert.equal(lai.status, "conflict");
  },
);

test(
  "hai đề xuất cùng base: cái duyệt sau bị stale, thư viện KHÔNG mất block của cái trước (AC4)",
  S,
  async () => {
    await donDep();
    const base = await phatHanhNen();
    const { nhanDeXuat, duyetDeXuat, layDanhSachDeXuat } =
      await import("@/lib/ky-thuat/cad/block-proposals");
    const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block-lib");

    const dxfB = dxfThemBlock(DXF_MAU, "XB-RED-DUCT");
    const dwgB = Buffer.concat([DWG_MAU, Buffer.from("b")]);
    const shaB = createHash("sha256").update(dwgB).digest("hex");

    const a = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({ base_lib_version: base }),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    const b = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe({
        base_lib_version: base,
        block_name: "XB-RED-DUCT",
        sha256: shaB,
        candidate_manifest: manifestUngVien("XB-RED-DUCT", shaB),
      }),
      dwg: dwgB,
      dxfText: dxfB,
    });
    assert.equal(a.status, "created");
    assert.equal(b.status, "created");
    if (a.status !== "created" || b.status !== "created") return;

    assert.equal((await duyetDeXuat({ id: a.id, userId: pmId })).status, "approved");

    const sau = await duyetDeXuat({ id: b.id, userId: pmId });
    assert.equal(sau.status, "conflict");
    if (sau.status === "conflict") assert.equal(sau.loai, "stale");

    // Thư viện vẫn là bản của đề xuất A — không bị đè mất block.
    const moi = await layBlockLibHienHanh();
    assert.ok(moi?.manifest.blocks.some((x) => x.blockName === TEN_BLOCK_MOI));
    assert.ok(!moi?.manifest.blocks.some((x) => x.blockName === "XB-RED-DUCT"));

    const ds = await layDanhSachDeXuat({ status: "stale" });
    assert.equal(ds.length, 1);
    assert.equal(ds[0].id, b.id);
  },
);

test("từ chối: bắt lý do, đổi trạng thái, không duyệt lại được", S, async () => {
  await donDep();
  const base = await phatHanhNen();
  const { nhanDeXuat, tuChoiDeXuat, duyetDeXuat, layDanhSachDeXuat } =
    await import("@/lib/ky-thuat/cad/block-proposals");

  const kq = await nhanDeXuat({
    userId: engineerId,
    metaTho: metaHopLe({ base_lib_version: base }),
    dwg: DWG_MAU,
    dxfText: DXF_UNG_VIEN,
  });
  assert.equal(kq.status, "created");
  if (kq.status !== "created") return;

  assert.equal(
    (await tuChoiDeXuat({ id: kq.id, userId: pmId, reason: "Tên chưa theo quy ước XB-" })).status,
    "rejected",
  );
  const ds = await layDanhSachDeXuat({ status: "rejected" });
  assert.equal(ds[0].rejectReason, "Tên chưa theo quy ước XB-");
  assert.equal(ds[0].statusNhan, "Từ chối");

  assert.equal((await duyetDeXuat({ id: kq.id, userId: pmId })).status, "conflict");
  assert.equal((await tuChoiDeXuat({ id: 999999, userId: pmId, reason: "x" })).status, "not-found");
});

test("danh sách: engineer chỉ thấy đề xuất của mình", S, async () => {
  await donDep();
  const base = await phatHanhNen();
  const { nhanDeXuat, layDanhSachDeXuat } = await import("@/lib/ky-thuat/cad/block-proposals");

  await nhanDeXuat({
    userId: engineerId,
    metaTho: metaHopLe({ base_lib_version: base }),
    dwg: DWG_MAU,
    dxfText: DXF_UNG_VIEN,
  });
  assert.equal((await layDanhSachDeXuat({ chiNguoiDeXuat: engineerId })).length, 1);
  assert.equal((await layDanhSachDeXuat({ chiNguoiDeXuat: pmId })).length, 0);
  assert.equal((await layDanhSachDeXuat()).length, 1);
});

test(
  "handler thật: token cad của kỹ sư gửi được (201); subcon 403; approve từ chối token thiết bị (AC6)",
  S,
  async () => {
    await donDep();
    const base = await phatHanhNen();
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { POST, GET } = await import("@/app/api/engineering/cad/block-proposals/route");

    const form = () => {
      const f = new FormData();
      f.set("candidateDwg", new File([new Uint8Array(DWG_MAU)], "blocks.dwg"));
      f.set("sidecarDxf", new File([DXF_UNG_VIEN], "blocks.dxf"));
      f.set("meta", JSON.stringify(metaHopLe({ base_lib_version: base })));
      return f;
    };

    const tokenEng = await createCadToken(engineerId, 1, "May ky su", null);
    const res = await POST(
      new NextRequest("http://x/api/engineering/cad/block-proposals", {
        method: "POST",
        headers: { authorization: `Bearer ${tokenEng.key}` },
        body: form(),
      }),
    );
    assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));

    // GET bằng token của chính kỹ sư: thấy đề xuất của mình, không phải người duyệt.
    const resGet = await GET(
      new NextRequest("http://x/api/engineering/cad/block-proposals?status=pending", {
        headers: { authorization: `Bearer ${tokenEng.key}` },
      }),
    );
    assert.equal(resGet.status, 200);
    const dsBody = (await resGet.json()) as { deXuat: unknown[]; laNguoiDuyet: boolean };
    assert.equal(dsBody.deXuat.length, 1);
    assert.equal(dsBody.laNguoiDuyet, false);

    // AC6: thầu phụ không có quyền đề xuất.
    const tokenSub = await createCadToken(subconId, 1, "May thau phu", null);
    const res403 = await POST(
      new NextRequest("http://x/api/engineering/cad/block-proposals", {
        method: "POST",
        headers: { authorization: `Bearer ${tokenSub.key}` },
        body: form(),
      }),
    );
    assert.equal(res403.status, 403);

    // AC6 (nửa còn lại — token thiết bị gọi approve → 401): route approve KHÔNG có nhánh Bearer nào,
    // chỉ `getCurrentUser()`, nên request mang Bearer mà không có cookie phiên luôn rơi vào 401. Kiểm
    // ở mức nguồn (ca "route approve/reject" phía trên) thay vì gọi handler: nhánh đó chạm `cookies()`
    // của Next, ngoài request scope sẽ throw (đúng quy ước tests/cad-devices.test.ts).
  },
);
