import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M113 PR2 — API `?project=` của thư viện block hai tầng.
// (1) Unit thuần: luật xung đột tên block giữa bộ dự án và bộ toàn cục (§4/FR3), ETag cặp id (§4.6).
// (2) Route-source: 3 route nhận `project` qua đúng cửa đối chiếu (chotProjectIdChoDoc/ChoGhi),
//     ngoài phạm vi → 404, auth/force-dynamic giữ nguyên.
// (3) Integration (TEST_DATABASE_URL, tự skip): phát hành bộ dự án (AC4/AC5/AC6), GET qua handler
//     thật bằng token thiết bị: manifest trộn (AC2), dự án chưa có bộ riêng (AC3), dự án lạ (AC8).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import type { BlockLibRow, BlockManifestEntry } from "@/lib/ky-thuat/cad/block";

const S = { skip: !HAS_TEST_DB };

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");
const MANIFEST_MAU = JSON.parse(
  readFileSync(join(DOI_CHUNG, "block-lib-manifest-mau.json"), "utf8"),
) as { version: string; dwgSha256: string; blocks: Record<string, unknown>[] };
const DXF_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dxf"), "utf8");
const DWG_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dwg.txt"));

function manifestToanCuc(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(MANIFEST_MAU));
}

/** Manifest bộ dự án: chỉ khai lại khung tên (đè theo id) — phần còn lại lấy từ bộ toàn cục. */
function manifestDuAn(version: string, block: Record<string, unknown>): Record<string, unknown> {
  return { version, dwgSha256: MANIFEST_MAU.dwgSha256, blocks: [block] };
}

const KHUNG_TEN = MANIFEST_MAU.blocks.find((b) => b.kind === "titleblock")!;

// ===== (1) Unit thuần =====

function bo(id: number, version: string, blocks: BlockManifestEntry[]): BlockLibRow {
  return {
    id,
    version,
    manifest: { version, dwgSha256: "a".repeat(64), blocks },
    storageKey: `blocklib-${version}.dwg`,
    dwgSha256: "a".repeat(64),
    nguoiPhatHanh: null,
    createdAt: null,
  };
}

test("kiemXungDotBlockName: cùng tên KHÁC id → lỗi nêu cả hai block; cùng id (đè) → không lỗi", async () => {
  const { kiemXungDotBlockName } = await import("@/lib/ky-thuat/cad/block");
  const toanCuc = bo(1, "g1", [{ id: "titleblock-a1", blockName: "XB-TB-A1", kind: "titleblock" }]);

  const loi = kiemXungDotBlockName(
    [{ id: "khung-ten-cdt", blockName: "xb-tb-a1", kind: "titleblock" }],
    toanCuc,
  );
  assert.equal(loi.length, 1);
  assert.ok(loi[0].includes("khung-ten-cdt") && loi[0].includes("titleblock-a1"));

  // Đè đúng id là chuyện bình thường, không phải xung đột.
  assert.deepEqual(
    kiemXungDotBlockName(
      [{ id: "titleblock-a1", blockName: "XB-TB-A1", kind: "titleblock" }],
      toanCuc,
    ),
    [],
  );
  // Chưa có bộ toàn cục → không có gì để đụng.
  assert.deepEqual(
    kiemXungDotBlockName([{ id: "x", blockName: "XB-TB-A1", kind: "titleblock" }], null),
    [],
  );
});

test("etagBlockLibTron: đổi bộ nào trong cặp cũng đổi ETag (§4.6)", async () => {
  const { etagBlockLibTron } = await import("@/lib/ky-thuat/cad/block");
  const gc = bo(1, "g1", []);
  const da = bo(2, "b1", []);
  const goc = etagBlockLibTron(gc, da);
  assert.equal(etagBlockLibTron(gc, da), goc, "cùng cặp id ⇒ cùng ETag");
  assert.notEqual(etagBlockLibTron(bo(3, "g2", []), da), goc);
  assert.notEqual(etagBlockLibTron(gc, bo(4, "b2", [])), goc);
  assert.notEqual(etagBlockLibTron(gc, null), goc);
});

// ===== (2) Route-source =====

function nguon(...doan: string[]): string {
  return readFileSync(join(process.cwd(), ...doan), "utf8");
}

test("route block-lib: `?project=` đi qua chotProjectIdChoDoc (đọc)/chotProjectIdChoGhi (ghi), ngoài phạm vi → 404", () => {
  const src = nguon("app", "api", "engineering", "cad", "block-lib", "route.ts");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /chotProjectIdChoDoc\(user, thamSoDuAn\)/);
  assert.match(src, /status: 404/);
  // Ghi bộ của dự án: quyền CAN.manageDrawings trong phạm vi dự án (M113 §13 chốt 2026-08-29),
  // đường TOÀN CỤC vẫn chỉ Admin/PM.
  const post = src.slice(src.indexOf("export async function POST"));
  assert.match(post, /CAN\.manageDrawings\(user\.role\)/);
  assert.match(post, /chotProjectIdChoGhi\(user, thamSoDuAn, hienTai\)/);
  assert.match(post, /isAdminOrPm\(user\.role\)/);
  assert.ok(!post.includes("getCadTokenUser"), "POST không được nhận token thiết bị");
});

test("route block-lib/blocks: `?project=` cùng cửa đối chiếu, vẫn chỉ nhận phiên web", () => {
  const src = nguon("app", "api", "engineering", "cad", "block-lib", "blocks", "route.ts");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /CAN\.manageDrawings\(user\.role\)/);
  assert.match(src, /chotProjectIdChoGhi\(user, thamSoDuAn, hienTai\)/);
  assert.match(src, /status: 404/);
  assert.ok(!src.includes("getCadTokenUser"), "POST không được nhận token thiết bị");
});

// ===== (3) Integration (Postgres) =====

let userId = 0;
let duAnA = 0;
let duAnB = 0;
let duAnC = 0;
const daLuu: string[] = [];

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  await run(`DELETE FROM cad_block_libs`);
  userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM M113 PR2', 'm113-pr2-${Date.now()}@test.local', 'x', 'pm', 1)`,
  );
  duAnA = await insertId(`INSERT INTO projects (name, org_id) VALUES ('M113 PR2 A', 1)`);
  duAnB = await insertId(`INSERT INTO projects (name, org_id) VALUES ('M113 PR2 B', 1)`);
  // Dự án C chỉ để kiểm AC4 (hai dự án cùng nhãn version) — B phải KHÔNG có bộ riêng nào cho AC3.
  duAnC = await insertId(`INSERT INTO projects (name, org_id) VALUES ('M113 PR2 C', 1)`);
});

after(async () => {
  if (!HAS_TEST_DB || !userId) return;
  const { run } = await import("@/lib/db");
  const { storageDelete } = await import("@/lib/nen/storage");
  for (const key of daLuu) {
    await storageDelete(1, key);
    await storageDelete(1, `${key}.sidecar.dxf`);
  }
  await run(`DELETE FROM cad_block_libs`);
  await run(`DELETE FROM api_keys WHERE created_by = ?`, userId);
  await run(`DELETE FROM users WHERE id = ?`, userId);
  await run(`DELETE FROM projects WHERE id IN (?, ?, ?)`, duAnA, duAnB, duAnC);
});

/** Phát hành bộ toàn cục mẫu (một lần cho cả nhóm ca) và nhớ khoá tệp để dọn. */
async function batBuocCoBoToanCuc() {
  const { layBlockLibHienHanh, phatHanhBlockLib } = await import("@/lib/ky-thuat/cad/block");
  let row = await layBlockLibHienHanh();
  if (!row) {
    const kq = await phatHanhBlockLib({
      userId,
      manifestTho: manifestToanCuc(),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
    });
    assert.equal(kq.status, "created", JSON.stringify(kq));
    row = await layBlockLibHienHanh();
    if (row) daLuu.push(row.storageKey);
  }
  assert.ok(row);
  return row;
}

test(
  "AC4/AC5: hai dự án cùng nhãn 'b1' đều phát hành được; phát hành lại đúng tệp → idempotent",
  S,
  async () => {
    const { phatHanhBlockLib, layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");
    const { withProjectScope } = await import("@/lib/db");
    await batBuocCoBoToanCuc();

    for (const duAn of [duAnA, duAnC]) {
      const kq = await phatHanhBlockLib({
        userId,
        manifestTho: manifestDuAn("b1", { ...KHUNG_TEN }),
        dwg: DWG_MAU,
        dxfText: DXF_MAU,
        projectId: duAn,
      });
      assert.equal(kq.status, "created", JSON.stringify(kq));
      const row = await withProjectScope(duAn, () => layBlockLibHienHanh(duAn));
      assert.ok(row);
      daLuu.push(row.storageKey);
      assert.equal(row.version, "b1");
      assert.deepEqual(
        row.manifest.blocks.map((b) => b.id),
        ["titleblock-a1"],
      );
    }

    // AC5: đúng tệp + đúng nhãn → trả lại dòng cũ, không tạo bản đôi ở tầng dự án.
    const lai = await phatHanhBlockLib({
      userId,
      manifestTho: manifestDuAn("b1", { ...KHUNG_TEN }),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
      projectId: duAnA,
    });
    assert.equal(lai.status, "idempotent");

    const { queryOne } = await import("@/lib/db");
    const dem = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cad_block_libs WHERE project_id = ?`,
      duAnA,
    );
    assert.equal(dem?.n, 1);
  },
);

test(
  "AC6: bộ dự án khai blockName trùng bộ toàn cục nhưng KHÁC id → từ chối lúc phát hành",
  S,
  async () => {
    const { phatHanhBlockLib } = await import("@/lib/ky-thuat/cad/block");
    const { queryOne } = await import("@/lib/db");
    await batBuocCoBoToanCuc();

    const truoc = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    const kq = await phatHanhBlockLib({
      userId,
      manifestTho: manifestDuAn("b-xung-dot", { ...KHUNG_TEN, id: "khung-ten-cdt" }),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
      projectId: duAnA,
    });
    assert.equal(kq.status, "invalid");
    if (kq.status !== "invalid") return;
    assert.ok(
      kq.kiemDinh.errors.some(
        (e) => e.includes("khung-ten-cdt") && e.includes(String(KHUNG_TEN.blockName)),
      ),
      JSON.stringify(kq.kiemDinh.errors),
    );

    const sau = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    assert.equal(sau?.n, truoc?.n, "kiểm định fail thì không ghi dòng nào");
  },
);

test(
  "AC2/AC3/AC8 qua handler GET thật: manifest trộn có nguon, dự án chưa có bộ riêng trùng khít toàn cục, dự án lạ → 404",
  S,
  async () => {
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { GET } = await import("@/app/api/engineering/cad/block-lib/route");
    const { phatHanhBlockLib, layBlockLibHienHanh, etagBlockLibTron } =
      await import("@/lib/ky-thuat/cad/block");
    const { withProjectScope } = await import("@/lib/db");
    const toanCuc = await batBuocCoBoToanCuc();

    // Dự án A có bộ riêng đè đúng khung tên; dự án B không có bộ nào.
    let boA = await withProjectScope(duAnA, () => layBlockLibHienHanh(duAnA));
    if (!boA) {
      const kq = await phatHanhBlockLib({
        userId,
        manifestTho: manifestDuAn("b1", { ...KHUNG_TEN }),
        dwg: DWG_MAU,
        dxfText: DXF_MAU,
        projectId: duAnA,
      });
      assert.equal(kq.status, "created", JSON.stringify(kq));
      boA = await withProjectScope(duAnA, () => layBlockLibHienHanh(duAnA));
      if (boA) daLuu.push(boA.storageKey);
    }
    assert.ok(boA);

    const token = await createCadToken(userId, 1, "May test M113 PR2", null);
    const goi = (url: string, headers: Record<string, string> = {}) =>
      GET(new NextRequest(url, { headers: { authorization: `Bearer ${token.key}`, ...headers } }));

    // AC2 — trộn: khung tên nguon "project", các block còn lại "global".
    const resA = await goi(`http://x/api/engineering/cad/block-lib?manifest=1&project=${duAnA}`);
    assert.equal(resA.status, 200);
    const bodyA = (await resA.json()) as {
      projectId: number;
      boDuAn: { version: string } | null;
      manifest: { blocks: { id: string; nguon: string; libVersion: string }[] };
    };
    assert.equal(bodyA.projectId, duAnA);
    assert.equal(bodyA.boDuAn?.version, "b1");
    assert.equal(bodyA.manifest.blocks.length, MANIFEST_MAU.blocks.length);
    const khungTen = bodyA.manifest.blocks.find((b) => b.id === KHUNG_TEN.id);
    assert.equal(khungTen?.nguon, "project");
    assert.equal(khungTen?.libVersion, "b1");
    assert.ok(
      bodyA.manifest.blocks
        .filter((b) => b.id !== KHUNG_TEN.id)
        .every((b) => b.nguon === "global" && b.libVersion === toanCuc.version),
    );

    // ETag = cặp id hai bộ → 304 khi client đã có bản mới nhất.
    const etag = etagBlockLibTron(toanCuc, boA);
    assert.equal(resA.headers.get("etag"), etag);
    const res304 = await goi(`http://x/api/engineering/cad/block-lib?manifest=1&project=${duAnA}`, {
      "if-none-match": etag,
    });
    assert.equal(res304.status, 304);

    // AC3 — dự án B chưa có bộ riêng ⇒ trùng khít bộ toàn cục.
    const resB = await goi(`http://x/api/engineering/cad/block-lib?manifest=1&project=${duAnB}`);
    assert.equal(resB.status, 200);
    const bodyB = (await resB.json()) as {
      boDuAn: unknown;
      manifest: { blocks: { id: string; nguon: string }[] };
    };
    assert.equal(bodyB.boDuAn, null);
    assert.deepEqual(
      bodyB.manifest.blocks.map((b) => b.id),
      toanCuc.manifest.blocks.map((b) => b.id),
    );
    assert.ok(bodyB.manifest.blocks.every((b) => b.nguon === "global"));

    // AC1 — không kèm `?project=` thì hành vi y hệt hôm nay: chỉ bộ toàn cục, không trường thêm.
    const resCu = await goi("http://x/api/engineering/cad/block-lib?manifest=1");
    const bodyCu = (await resCu.json()) as {
      version: string;
      manifest: { blocks: Record<string, unknown>[] };
    };
    assert.equal(bodyCu.version, toanCuc.version);
    assert.deepEqual(bodyCu.manifest.blocks, toanCuc.manifest.blocks);

    // AC8 — dự án không thấy được (ở đây: không tồn tại) → 404, không rò rỉ.
    const res404 = await goi(
      `http://x/api/engineering/cad/block-lib?manifest=1&project=${duAnA + duAnB + duAnC + 10_000}`,
    );
    assert.equal(res404.status, 404);
  },
);

test(
  "themBlockTuWeb theo dự án: nền là bộ CỦA dự án, chặn tên đụng bộ toàn cục (§4)",
  S,
  async () => {
    const { themBlockTuWeb } = await import("@/lib/ky-thuat/cad/block");
    const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");
    const { withProjectScope } = await import("@/lib/db");
    await batBuocCoBoToanCuc();

    // Dự án B chưa có bộ riêng → đường thêm block lẻ báo đúng lý do, không rơi về bộ toàn cục.
    const chuaCo = await themBlockTuWeb({
      userId,
      metaTho: {
        block_name: "XB-DUCT-ELBOW",
        kind: "fitting",
        system_id: "HVAC",
        takeoff_item_id: "duct-fitting",
      },
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
      projectId: duAnB,
    });
    assert.equal(chuaCo.status, "conflict");
    if (chuaCo.status === "conflict") assert.equal(chuaCo.loai, "chua-co-thu-vien");

    // Dự án A đã có bộ riêng → thêm block trùng TÊN với bộ toàn cục bị chặn.
    const boA = await withProjectScope(duAnA, () => layBlockLibHienHanh(duAnA));
    assert.ok(boA, "ca AC4 đã phát hành bộ b1 cho dự án A");
    const trungTen = await themBlockTuWeb({
      userId,
      metaTho: {
        block_name: "XB-DUCT-ELBOW",
        kind: "fitting",
        system_id: "HVAC",
        takeoff_item_id: "duct-fitting",
      },
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
      projectId: duAnA,
    });
    assert.equal(trungTen.status, "conflict");
    if (trungTen.status === "conflict") {
      assert.equal(trungTen.loai, "trung-ten");
      assert.match(trungTen.message, /toàn cục/);
    }
  },
);
