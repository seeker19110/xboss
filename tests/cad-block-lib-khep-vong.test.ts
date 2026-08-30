import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Khép vòng thư viện block (M103 + M100 PR2): sau khi đề xuất block được DUYỆT, gọi
// GET /api/engineering/cad/block-lib bằng ĐÚNG đường plugin thật dùng (token thiết bị CAD,
// header Authorization: Bearer) → manifest phải là version MỚI, chứa đúng block vừa duyệt,
// sha256 khớp tệp .dwg thật đang lưu trên kho. Đường nhận đề xuất/duyệt đã có test riêng ở
// tests/cad-block-proposals.test.ts — ca này chỉ kiểm khúc CÒN THIẾU: plugin tải lại thư viện
// bằng token thiết bị sau khi duyệt có thấy đúng bản mới hay không.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");
const MANIFEST_MAU = JSON.parse(
  readFileSync(join(DOI_CHUNG, "block-lib-manifest-mau.json"), "utf8"),
) as Record<string, unknown>;
const DXF_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dxf"), "utf8");
const DWG_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dwg.txt"));

const TEN_BLOCK_MOI = "XB-KHEP-VONG";

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
    "ENDBLK",
  ].join("\n");
  const iBlocks = goc.indexOf("\nBLOCKS\n");
  const iEnd = goc.indexOf("\n0\nENDSEC", iBlocks);
  return `${goc.slice(0, iEnd)}\n${khoi}${goc.slice(iEnd)}`;
}

const DXF_UNG_VIEN = dxfThemBlock(DXF_MAU, TEN_BLOCK_MOI);

function manifestUngVien(): Record<string, unknown> {
  const m = JSON.parse(JSON.stringify(MANIFEST_MAU)) as Record<string, unknown>;
  (m.blocks as Record<string, unknown>[]).push({
    id: `khep-vong-${TEN_BLOCK_MOI.toLowerCase()}`,
    blockName: TEN_BLOCK_MOI,
    kind: "fitting",
    system: "HVAC",
    takeoffItemId: "duct-fitting",
  });
  return m;
}

function metaHopLe(baseVersion: string): Record<string, unknown> {
  return {
    block_name: TEN_BLOCK_MOI,
    kind: "fitting",
    system_id: "HVAC",
    takeoff_item_id: "duct-fitting",
    note: "Block test khép vòng",
    base_lib_version: baseVersion,
    candidate_manifest: manifestUngVien(),
    sha256: createHash("sha256").update(DWG_MAU).digest("hex"),
  };
}

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
  await run(`DELETE FROM cad_block_proposals`);
  await run(`DELETE FROM cad_block_libs`);
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const dau = Date.now();
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM khép vòng', 'block-lib-khep-vong-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  engineerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư khép vòng', 'block-lib-khep-vong-eng-${dau}@test.local', 'x', 'engineer', 1)`,
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
  "đề xuất được duyệt → plugin tải lại thư viện bằng token thiết bị thấy version mới, " +
    "chứa đúng block vừa duyệt, sha256 khớp tệp .dwg thật đang lưu",
  S,
  async () => {
    await donDep();
    const { phatHanhBlockLib } = await import("@/lib/ky-thuat/cad/block");
    const { nhanDeXuat, duyetDeXuat } = await import("@/lib/ky-thuat/cad/block");
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { GET } = await import("@/app/api/engineering/cad/block-lib/route");

    // Thư viện nền b0-mau.
    const nen = await phatHanhBlockLib({
      userId: pmId,
      manifestTho: JSON.parse(JSON.stringify(MANIFEST_MAU)),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
    });
    assert.ok(nen.status === "created" || nen.status === "idempotent", JSON.stringify(nen));

    // Plugin (token thiết bị) tải thư viện NỀN trước — phải thấy version cũ, chưa có block mới.
    const tokenEng = await createCadToken(engineerId, 1, "May ky su khep vong", null);
    const truoc = await GET(
      new NextRequest("http://x/api/engineering/cad/block-lib?manifest=1", {
        headers: { authorization: `Bearer ${tokenEng.key}` },
      }),
    );
    assert.equal(truoc.status, 200);
    const manifestTruoc = (await truoc.json()) as {
      version: string;
      manifest: { blocks: { blockName: string }[] };
    };
    assert.equal(manifestTruoc.version, "b0-mau");
    assert.ok(!manifestTruoc.manifest.blocks.some((b) => b.blockName === TEN_BLOCK_MOI));

    // Kỹ sư đề xuất block mới, PM duyệt.
    const deXuat = await nhanDeXuat({
      userId: engineerId,
      metaTho: metaHopLe(manifestTruoc.version),
      dwg: DWG_MAU,
      dxfText: DXF_UNG_VIEN,
    });
    assert.equal(deXuat.status, "created", JSON.stringify(deXuat));
    if (deXuat.status !== "created") return;

    const duyet = await duyetDeXuat({ id: deXuat.id, userId: pmId });
    assert.equal(duyet.status, "approved", JSON.stringify(duyet));
    if (duyet.status !== "approved") return;
    assert.notEqual(duyet.version, manifestTruoc.version);

    // ---- Đúng đường plugin thật dùng: GET với token thiết bị (Authorization: Bearer) ----
    const sauManifest = await GET(
      new NextRequest("http://x/api/engineering/cad/block-lib?manifest=1", {
        headers: { authorization: `Bearer ${tokenEng.key}` },
      }),
    );
    assert.equal(sauManifest.status, 200);
    const manifestSau = (await sauManifest.json()) as {
      version: string;
      dwgSha256: string;
      manifest: { version: string; dwgSha256: string; blocks: { blockName: string }[] };
    };
    assert.equal(manifestSau.version, duyet.version, "phải là version MỚI vừa duyệt");
    assert.ok(
      manifestSau.manifest.blocks.some((b) => b.blockName === TEN_BLOCK_MOI),
      "manifest mới phải chứa block vừa duyệt",
    );

    // Tải tệp .dwg thật (không ?manifest=1) — sha256 tệp thật phải khớp sha256 khai trong manifest,
    // và khớp đúng nội dung .dwg đã nộp kèm đề xuất (chuỗi cung ứng không bị tráo giữa 2 bước).
    const sauFile = await GET(
      new NextRequest("http://x/api/engineering/cad/block-lib", {
        headers: { authorization: `Bearer ${tokenEng.key}` },
      }),
    );
    assert.equal(sauFile.status, 200);
    assert.equal(sauFile.headers.get("x-block-lib-version"), duyet.version);
    const tepThat = Buffer.from(await sauFile.arrayBuffer());
    const shaThat = createHash("sha256").update(tepThat).digest("hex");
    assert.equal(shaThat, manifestSau.manifest.dwgSha256, "sha256 tệp thật phải khớp manifest");
    assert.equal(sauFile.headers.get("x-block-lib-sha256"), shaThat);
    assert.ok(
      tepThat.equals(DWG_MAU),
      "tệp .dwg thư viện mới vẫn là DWG_MAU (đề xuất dùng chung DWG nền)",
    );
  },
);
