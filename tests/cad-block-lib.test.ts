import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M100 PR2 — thư viện block chuẩn cho bộ lệnh vẽ XBOSS_VE_*.
// (1) Unit thuần: kiểm định manifest trên bộ mẫu THẬT trong plugin-autocad/doi-chung/ (cùng tệp
//     mà XBoss.Cad.Tests/BlockManifestTests.cs nạp — chống trôi 2 tầng) + các lớp lỗi phải bắt.
// (2) Route-source: force-dynamic, auth 401, quyền 403, 422 kèm danh sách lỗi, ETag.
// (3) Integration (TEST_DATABASE_URL, tự skip): phát hành → idempotent → xung đột version;
//     GET qua handler thật bằng token scope 'cad' (200/304/?manifest=1) và 403 với vai trò
//     không có quyền.
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

/** Bản sao sâu của manifest mẫu để từng ca tự sửa mà không ảnh hưởng ca khác. */
function manifest(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(MANIFEST_MAU));
}

function blocks(m: Record<string, unknown>): Record<string, unknown>[] {
  return m.blocks as Record<string, unknown>[];
}

// ===== (1) Unit thuần =====

test("bộ mẫu doi-chung/ hợp lệ: hash khớp, mọi block khai có thật trong DXF, 0 lỗi 0 cảnh báo", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const kq = kiemDinhManifest(manifest(), DWG_MAU, DXF_MAU);
  assert.equal(kq.ok, true, JSON.stringify(kq.errors));
  assert.deepEqual(kq.warnings, []);
  assert.equal(kq.stats?.blocksTrongDxf, 5);
  assert.equal(kq.stats?.blocksKhaiManifest, 5);
  assert.equal(kq.manifest?.version, "b0-mau");
});

test("chặn: dwgSha256 không khớp tệp .dwg nộp kèm (toàn vẹn chuỗi cung ứng §12)", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const kq = kiemDinhManifest(manifest(), Buffer.from("AC1032 tệp đã bị tráo"), DXF_MAU);
  assert.equal(kq.ok, false);
  assert.ok(kq.errors.some((e) => e.includes("không khớp tệp .dwg")));
});

test("chặn: manifest khai block không có trong DXF sidecar (§6.10 — thư viện hỏng)", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const m = manifest();
  blocks(m)[0].blockName = "XB-KHONG-CO-THAT";
  const kq = kiemDinhManifest(m, DWG_MAU, DXF_MAU);
  assert.equal(kq.ok, false);
  assert.ok(kq.errors.some((e) => e.includes("XB-KHONG-CO-THAT")));
});

test('kind "annotation" (M110) hợp lệ và KHÔNG bị kéo vào khối lượng', async () => {
  const { kiemDinhManifest, LOAI_BLOCK } = await import("@/lib/ky-thuat/cad/block-lib");
  const { NHAN_LOAI_BLOCK } = await import("@/lib/ky-thuat/cad/block-proposals");

  assert.ok((LOAI_BLOCK as readonly string[]).includes("annotation"));
  assert.ok(NHAN_LOAI_BLOCK.annotation.length > 0, "kind mới phải có nhãn tiếng Việt cho web");

  // Tam giác số revision là ký hiệu chú thích: đổi một block phụ kiện sang kind annotation thì
  // manifest vẫn hợp lệ và không sinh cảnh báo takeoff nào (guardrail 1 của M110 — khoanh
  // revision xong, XBOSS_BOCKL phải cho đúng con số như trước).
  const m = manifest();
  const b = blocks(m).find((x) => x.kind === "fitting")!;
  b.kind = "annotation";
  delete b.takeoffItemId;
  const kq = kiemDinhManifest(m, DWG_MAU, DXF_MAU);
  assert.equal(kq.ok, true, JSON.stringify(kq.errors));
  assert.ok(
    !kq.warnings.some((w) => w.includes(String(b.id))),
    `block annotation không được sinh cảnh báo takeoff: ${JSON.stringify(kq.warnings)}`,
  );
});

test("chặn: kind lạ, id trùng, thiếu blockName, hai mục trùng tên block", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");

  const mKind = manifest();
  blocks(mKind)[0].kind = "phu-kien";
  assert.ok(kiemDinhManifest(mKind, DWG_MAU, DXF_MAU).errors.some((e) => e.includes("kind")));

  const mTrung = manifest();
  blocks(mTrung)[1].id = blocks(mTrung)[0].id;
  assert.ok(kiemDinhManifest(mTrung, DWG_MAU, DXF_MAU).errors.some((e) => e.includes("id trùng")));

  const mThieu = manifest();
  delete blocks(mThieu)[0].blockName;
  assert.ok(kiemDinhManifest(mThieu, DWG_MAU, DXF_MAU).errors.some((e) => e.includes("blockName")));

  // Hai mục cùng tên block chỉ khác hoa thường → cùng một định nghĩa trong DWG (bản C# kiểm y hệt).
  const mTrungTen = manifest();
  blocks(mTrungTen)[3].blockName = String(blocks(mTrungTen)[0].blockName).toLowerCase();
  assert.ok(
    kiemDinhManifest(mTrungTen, DWG_MAU, DXF_MAU).errors.some((e) => e.includes("hoa thường")),
  );
});

test("chặn: thiết bị thiếu thuộc tính TAG (FR6), khung tên thiếu khổ giấy (FR9a)", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");

  const mTag = manifest();
  const tb = blocks(mTag).find((b) => b.kind === "equipment")!;
  tb.attributes = ["MODEL", "SIZE"];
  assert.ok(kiemDinhManifest(mTag, DWG_MAU, DXF_MAU).errors.some((e) => e.includes("TAG")));

  const mPaper = manifest();
  delete blocks(mPaper).find((b) => b.kind === "titleblock")!.paper;
  assert.ok(kiemDinhManifest(mPaper, DWG_MAU, DXF_MAU).errors.some((e) => e.includes("paper")));
});

test("chặn: nộp nhầm DXF vào ô .dwg (không mang chữ ký DWG)", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const m = manifest();
  m.dwgSha256 = createHash("sha256").update(DXF_MAU).digest("hex");
  const kq = kiemDinhManifest(m, Buffer.from(DXF_MAU, "utf8"), DXF_MAU);
  assert.equal(kq.ok, false);
  assert.ok(kq.errors.some((e) => e.includes("chữ ký DWG")));
});

test("chặn: DXF sidecar hỏng cấu trúc", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const kq = kiemDinhManifest(manifest(), DWG_MAU, "0\nSECTION\nrác không phải DXF");
  assert.equal(kq.ok, false);
  assert.ok(kq.errors.some((e) => e.includes("DXF sidecar")));
});

test("cảnh báo (không chặn): tên block thiết bị lệch blockNameMatchAny của rule pack §18", async () => {
  const { kiemDinhManifest, doiChieuTakeoff } = await import("@/lib/ky-thuat/cad/block-lib");

  // Đổi cả tên block trong manifest LẪN trong DXF để chỉ còn đúng một sai lệch: khớp takeoff.
  const m = manifest();
  blocks(m).find((b) => b.kind === "equipment")!.blockName = "MAY-LANH";
  const dxf = DXF_MAU.replace(/^FCU$/m, "MAY-LANH");
  const kq = kiemDinhManifest(m, DWG_MAU, dxf);
  assert.equal(kq.ok, true, JSON.stringify(kq.errors));
  assert.ok(kq.warnings.some((w) => w.includes("blockNameMatchAny")));

  // takeoffItemId ma / thiếu → cũng chỉ là cảnh báo.
  const mMa = { version: "x", dwgSha256: "0".repeat(64), blocks: blocks(manifest()) };
  mMa.blocks.find((b) => b.kind === "equipment")!.takeoffItemId = "item-khong-ton-tai";
  assert.ok(
    doiChieuTakeoff(mMa as never).some((w) => w.includes("item-khong-ton-tai")),
    "item takeoff ma phải sinh cảnh báo",
  );

  const mThieu = { version: "x", dwgSha256: "0".repeat(64), blocks: blocks(manifest()) };
  delete mThieu.blocks.find((b) => b.kind === "equipment")!.takeoffItemId;
  assert.ok(doiChieuTakeoff(mThieu as never).some((w) => w.includes("takeoffItemId")));
});

test("cảnh báo: manifest khai thuộc tính mà DXF không có ATTDEF tương ứng", async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const m = manifest();
  const tb = blocks(m).find((b) => b.kind === "equipment")!;
  tb.attributes = ["TAG", "MODEL", "SIZE", "LUU_LUONG"];
  const kq = kiemDinhManifest(m, DWG_MAU, DXF_MAU);
  assert.equal(kq.ok, true, JSON.stringify(kq.errors));
  assert.ok(kq.warnings.some((w) => w.includes("LUU_LUONG")));
});

test('chặn: "attributes" sai kiểu (không phải mảng) chỉ sinh ĐÚNG 1 lỗi — không chồng thêm "thiếu TAG"', async () => {
  const { kiemDinhManifest } = await import("@/lib/ky-thuat/cad/block-lib");
  const m = manifest();
  const tb = blocks(m).find((b) => b.kind === "equipment")!;
  tb.attributes = "khong-phai-mang"; // sai kiểu — phải là mảng chuỗi
  const kq = kiemDinhManifest(m, DWG_MAU, DXF_MAU);
  assert.equal(kq.ok, false);
  assert.equal(kq.errors.length, 1, JSON.stringify(kq.errors));
  assert.match(kq.errors[0], /"attributes" phải là danh sách chuỗi/);
  assert.ok(
    !kq.errors.some((e) => e.includes("TAG")),
    "không được sinh thêm lỗi 'thiếu TAG' chồng lên lỗi kiểu dữ liệu gốc",
  );
});

// ===== (2) Route-source =====

test("route block-lib: force-dynamic, 401 khi chưa đăng nhập, 403 theo quyền, 422 kèm lỗi", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "block-lib", "route.ts"),
    "utf8",
  );
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph/);
  assert.match(src, /isAdminOrPm\(user\.role\)/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 422/);
  assert.match(src, /hitRateLimit\(`cad-block-lib:/);
  assert.match(src, /status: 304/);
  // GET nhận token plugin; POST (phát hành) CHỈ nhận phiên web — token thiết bị không được
  // phát hành thư viện (M100 §12).
  assert.match(src, /getCadTokenUser/);
  const post = src.slice(src.indexOf("export async function POST"));
  assert.ok(!post.includes("getCadTokenUser"), "POST không được nhận token thiết bị");
});

test("route block-lib POST: kiểm content-length SỚM, kiểm lại kích thước thật (dwg/dxf/manifest) TRƯỚC khi arrayBuffer()/text() — chặn body chunked không header vượt trần", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "block-lib", "route.ts"),
    "utf8",
  );
  const post = src.slice(src.indexOf("export async function POST"));

  // Vẫn còn lưới chặn sớm theo header content-length (rẻ, không đọc form).
  assert.match(
    post,
    /isContentTooLarge\(req\.headers\.get\("content-length"\), GIOI_HAN_TEP_CAD\)/,
  );

  // Lưới thứ hai: kiểm size thật của dwg/dxf/manifest — bắt được cả body chunked (không có
  // header content-length nên lưới thứ nhất bị bỏ qua).
  const idxFormParsed = post.indexOf("await req.formData()");
  const idxSizeCheck = post.indexOf("dwg.size > GIOI_HAN_TEP_CAD");
  const idxDwgArrayBuffer = post.indexOf("dwg.arrayBuffer()");
  const idxDxfText = post.indexOf("dxfText: await dxf.text()");
  assert.ok(idxFormParsed >= 0 && idxSizeCheck >= 0 && idxDwgArrayBuffer >= 0 && idxDxfText >= 0);
  // Kiểm size thật phải nằm SAU khi parse form (đã có dwg/dxf là File) và TRƯỚC khi buffer nội
  // dung (arrayBuffer/text) — đúng thứ tự "biết size không cần đọc hết nội dung".
  assert.ok(idxFormParsed < idxSizeCheck, "kiểm size thật phải sau khi đã parse formData");
  assert.ok(
    idxSizeCheck < idxDwgArrayBuffer && idxSizeCheck < idxDxfText,
    "kiểm size thật phải trước khi arrayBuffer()/text() — tránh nạp buffer vượt trần vào RAM",
  );
  assert.match(post, /dxf\.size > GIOI_HAN_TEP_CAD/);
  assert.match(post, /status: 413/);
});

// ===== (3) Integration (Postgres) =====

let userId = 0;
let userSubconId = 0;
const daLuu: string[] = [];

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  await run(`DELETE FROM cad_block_libs`);
  const dau = Date.now();
  userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM thư viện block', 'block-lib-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  userSubconId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Thầu phụ', 'block-lib-sub-${dau}@test.local', 'x', 'subcon', 1)`,
  );
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
  await run(`DELETE FROM api_keys WHERE created_by IN (?, ?)`, userId, userSubconId);
  await run(`DELETE FROM users WHERE id IN (?, ?)`, userId, userSubconId);
});

test(
  "phát hành: đạt → tạo dòng; cùng tệp lần 2 → idempotent; cùng version khác nội dung → xung đột",
  S,
  async () => {
    const { phatHanhBlockLib, layBlockLibHienHanh, docTepBlockLib } =
      await import("@/lib/ky-thuat/cad/block-lib");

    const kq = await phatHanhBlockLib({
      userId,
      manifestTho: manifest(),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
    });
    assert.equal(kq.status, "created", JSON.stringify(kq));
    if (kq.status !== "created") return;
    assert.equal(kq.version, "b0-mau");

    const hienHanh = await layBlockLibHienHanh();
    assert.ok(hienHanh);
    daLuu.push(hienHanh.storageKey);
    assert.equal(hienHanh.version, "b0-mau");
    assert.equal(hienHanh.manifest.blocks.length, 5);
    assert.equal(hienHanh.dwgSha256, createHash("sha256").update(DWG_MAU).digest("hex"));
    assert.equal(hienHanh.nguoiPhatHanh, "PM thư viện block");
    // Manifest lưu NGUYÊN hợp đồng §11 — không nhét kết quả kiểm định vào.
    assert.deepEqual(Object.keys(hienHanh.manifest).sort(), ["blocks", "dwgSha256", "version"]);
    // Tệp .dwg đọc lại được nguyên vẹn.
    const tep = await docTepBlockLib(hienHanh);
    assert.ok(tep && tep.equals(DWG_MAU));

    // Idempotent: đúng tệp + đúng version → trả dòng cũ, không tạo bản đôi.
    const lai = await phatHanhBlockLib({
      userId,
      manifestTho: manifest(),
      dwg: DWG_MAU,
      dxfText: DXF_MAU,
    });
    assert.equal(lai.status, "idempotent");
    if (lai.status === "idempotent") assert.equal(lai.id, kq.id);

    const { queryOne } = await import("@/lib/db");
    const dem = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
    assert.equal(dem?.n, 1);

    // Cùng version nhưng nội dung khác → xung đột (append-only, §17).
    const dwgKhac = Buffer.from("AC1032 noi dung khac");
    const mKhac = manifest();
    mKhac.dwgSha256 = createHash("sha256").update(dwgKhac).digest("hex");
    const xungDot = await phatHanhBlockLib({
      userId,
      manifestTho: mKhac,
      dwg: dwgKhac,
      dxfText: DXF_MAU,
    });
    assert.equal(xungDot.status, "version-conflict");
  },
);

test("kiểm định fail → KHÔNG ghi dòng nào (không có thư viện nửa vời)", S, async () => {
  const { phatHanhBlockLib } = await import("@/lib/ky-thuat/cad/block-lib");
  const { queryOne } = await import("@/lib/db");
  const truoc = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);

  const m = manifest();
  m.version = "b-hong";
  blocks(m)[0].blockName = "XB-KHONG-CO-THAT";
  const kq = await phatHanhBlockLib({ userId, manifestTho: m, dwg: DWG_MAU, dxfText: DXF_MAU });
  assert.equal(kq.status, "invalid");

  const sau = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cad_block_libs`);
  assert.equal(sau?.n, truoc?.n);
});

test(
  "GET qua handler thật: token cad tải được tệp + manifest + ETag/304; vai trò không quyền → 403",
  S,
  async () => {
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { GET } = await import("@/app/api/engineering/cad/block-lib/route");
    const { layBlockLibHienHanh, etagBlockLib } = await import("@/lib/ky-thuat/cad/block-lib");

    // Bảo đảm đã có bản phát hành (ca này có thể chạy độc lập với ca trên).
    let hienHanh = await layBlockLibHienHanh();
    if (!hienHanh) {
      const { phatHanhBlockLib } = await import("@/lib/ky-thuat/cad/block-lib");
      await phatHanhBlockLib({ userId, manifestTho: manifest(), dwg: DWG_MAU, dxfText: DXF_MAU });
      hienHanh = await layBlockLibHienHanh();
      if (hienHanh) daLuu.push(hienHanh.storageKey);
    }
    assert.ok(hienHanh);

    const token = await createCadToken(userId, 1, "May test block-lib", null);
    const goi = (url: string, headers: Record<string, string>) =>
      GET(new NextRequest(url, { headers }));

    const res = await goi("http://x/api/engineering/cad/block-lib", {
      authorization: `Bearer ${token.key}`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("etag"), etagBlockLib(hienHanh));
    assert.equal(res.headers.get("x-block-lib-version"), hienHanh.version);
    assert.equal(res.headers.get("content-type"), "application/acad");
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(DWG_MAU));

    // Cache còn mới → 304, không tải lại tệp (AC8).
    const res304 = await goi("http://x/api/engineering/cad/block-lib", {
      authorization: `Bearer ${token.key}`,
      "if-none-match": etagBlockLib(hienHanh),
    });
    assert.equal(res304.status, 304);

    const resManifest = await goi("http://x/api/engineering/cad/block-lib?manifest=1", {
      authorization: `Bearer ${token.key}`,
    });
    assert.equal(resManifest.status, 200);
    const body = (await resManifest.json()) as { manifest: { blocks: unknown[] } };
    assert.equal(body.manifest.blocks.length, 5);

    // Vai trò không có CAN.viewEngineeringGraph → 403 (token hợp lệ vẫn bị chặn).
    const tokenSubcon = await createCadToken(userSubconId, 1, "May thau phu", null);
    const res403 = await goi("http://x/api/engineering/cad/block-lib", {
      authorization: `Bearer ${tokenSubcon.key}`,
    });
    assert.equal(res403.status, 403);
  },
);

test(
  "GET với ?v= khác version hiện hành → 404 (không âm thầm trả bản khác thứ client xin)",
  S,
  async () => {
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { GET } = await import("@/app/api/engineering/cad/block-lib/route");
    const { layBlockLibHienHanh, phatHanhBlockLib } = await import("@/lib/ky-thuat/cad/block-lib");

    let hienHanh = await layBlockLibHienHanh();
    if (!hienHanh) {
      await phatHanhBlockLib({ userId, manifestTho: manifest(), dwg: DWG_MAU, dxfText: DXF_MAU });
      hienHanh = await layBlockLibHienHanh();
      if (hienHanh) daLuu.push(hienHanh.storageKey);
    }
    assert.ok(hienHanh);

    const token = await createCadToken(userId, 1, "May test tham so v", null);

    // v khớp version hiện hành → vẫn trả bình thường (200).
    const resKhop = await GET(
      new NextRequest(`http://x/api/engineering/cad/block-lib?v=${hienHanh.version}`, {
        headers: { authorization: `Bearer ${token.key}` },
      }),
    );
    assert.equal(resKhop.status, 200);

    // v khác version hiện hành → 404 kèm thông điệp tiếng Việt, không lặng lẽ trả bản khác.
    const resLech = await GET(
      new NextRequest("http://x/api/engineering/cad/block-lib?v=phien-ban-khong-ton-tai", {
        headers: { authorization: `Bearer ${token.key}` },
      }),
    );
    assert.equal(resLech.status, 404);
    const body = (await resLech.json()) as { error: string };
    assert.match(body.error, /không còn là bản hiện hành/);
  },
);

test("GET khi chưa phát hành thư viện nào → 404 kèm hướng dẫn tiếng Việt", S, async () => {
  const { run } = await import("@/lib/db");
  const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
  const { GET } = await import("@/app/api/engineering/cad/block-lib/route");
  await run(`DELETE FROM cad_block_libs`);

  const token = await createCadToken(userId, 1, "May test rong", null);
  const res = await GET(
    new NextRequest("http://x/api/engineering/cad/block-lib", {
      headers: { authorization: `Bearer ${token.key}` },
    }),
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /Chưa phát hành thư viện block nào/);
});
