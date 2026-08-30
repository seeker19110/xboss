import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M108 PR1 — nạp block HÀNG LOẠT từ tệp tổng hợp (chưa có AI, chưa có UI).
// (1) Unit thuần — TẦNG 1 phân loại tất định: khớp blockNameMatchAny suy đủ kind/hệ/hạng mục;
//     khung tên; không khớp thì CHƯA QUYẾT chứ không đoán (AC5); layer chỉ suy hệ, không suy kind.
// (2) Unit thuần — lọc ứng viên: block ẩn danh, layout, trùng tên trong cùng tệp.
// (3) Integration (TEST_DATABASE_URL, tự skip): nhận lô → duyệt → ĐÚNG MỘT version mới (AC7);
//     trùng tên thư viện thì bỏ qua kèm lý do (AC6); thư viện đổi giữa chừng → stale (AC8);
//     người sửa kind → nguồn đổi thành nguoi_sua và thư viện lưu đúng giá trị người chọn (AC9).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");
const MANIFEST_MAU = JSON.parse(
  readFileSync(join(DOI_CHUNG, "block-lib-manifest-mau.json"), "utf8"),
) as Record<string, unknown>;
const DXF_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dxf"), "utf8");
const DWG_MAU = readFileSync(join(DOI_CHUNG, "block-lib-mau.dwg.txt"));

let pmId = 0;
const daLuu: string[] = [];

// ── (1) Tầng 1 — phân loại tất định ──────────────────────────────────────────

test("tầng 1: tên khớp blockNameMatchAny suy đủ loại, hệ và hạng mục bóc tách", async () => {
  const { phanLoaiTheoLuat } = await import("@/lib/ky-thuat/cad/block");
  const kq = phanLoaiTheoLuat({ blockName: "FCU-01", layer: "M-DUCT-SUPP" });
  assert.equal(kq.kind, "equipment");
  assert.equal(kq.takeoffItemId, "fcu-unit");
  assert.equal(kq.systemId, "HVAC");
  assert.equal(kq.nguon, "luat");
  assert.equal(kq.doTinCay, null, "khớp rule pack là chắc chắn ⇒ không gắn điểm tin cậy");
});

test("tầng 1: hạng mục ĐẾM giá đỡ/lỗ chờ (không nằm trong drawTools) vẫn suy được loại", async () => {
  const { phanLoaiTheoLuat } = await import("@/lib/ky-thuat/cad/block");
  // `support-hanger`/`sleeve-opening` cố ý đứng ngoài drawTools (M100 PR7) — không được coi là
  // rule pack thiếu nhất quán.
  const sup = phanLoaiTheoLuat({ blockName: "XB-SUP-DUCT-01" });
  assert.equal(sup.kind, "support");
  assert.equal(sup.nguon, "luat");
  const slv = phanLoaiTheoLuat({ blockName: "XB-SLEEVE-W1" });
  assert.equal(slv.kind, "sleeve");
  assert.equal(slv.nguon, "luat");
});

test("tầng 1: khung tên nhận theo sheetSetup.titleblockId, KHÔNG đoán khổ giấy", async () => {
  const { phanLoaiTheoLuat } = await import("@/lib/ky-thuat/cad/block");
  const kq = phanLoaiTheoLuat({ blockName: "TITLEBLOCK-A1" });
  assert.equal(kq.kind, "titleblock");
  assert.equal(kq.systemId, null, "khung tên không thuộc hệ nào");
  assert.equal(
    kq.paperSize,
    null,
    "khổ giấy phải do người khai — không suy ra từ khung tên mặc định của rule pack",
  );
});

test("tầng 1 (AC5): tên vô nghĩa thì CHƯA QUYẾT, không bao giờ đoán một kind gần đúng", async () => {
  const { phanLoaiTheoLuat } = await import("@/lib/ky-thuat/cad/block");
  for (const ten of ["BLOCK1", "A$C0123", "ABC-XYZ-99"]) {
    const kq = phanLoaiTheoLuat({ blockName: ten });
    assert.equal(kq.kind, null, `"${ten}" không được gán kind`);
    assert.equal(kq.nguon, "chua_quyet");
    assert.ok(kq.lyDo.length > 0, "phải nêu lý do bằng tiếng Việt cho người duyệt");
  }
});

test("tầng 1: layer chỉ suy được HỆ, không bao giờ suy loại block", async () => {
  const { phanLoaiTheoLuat } = await import("@/lib/ky-thuat/cad/block");
  const kq = phanLoaiTheoLuat({ blockName: "BLOCK7", layer: "M-DUCT-SUPP" });
  assert.equal(kq.kind, null);
  assert.equal(kq.systemId, "HVAC", "layer HVAC cho biết hệ để người duyệt đỡ gõ lại");
  assert.equal(kq.nguon, "chua_quyet");
});

test("tầng 1: thống kê đếm đúng phần quyết được / còn treo cho tầng 2-3", async () => {
  const { phanLoaiLoTheoLuat, thongKePhanLoai } = await import("@/lib/ky-thuat/cad/block");
  const kq = phanLoaiLoTheoLuat([
    { blockName: "FCU-01" },
    { blockName: "AHU-02" },
    { blockName: "BLOCK1" },
  ]);
  assert.deepEqual(thongKePhanLoai(kq), { tong: 3, quyetDuoc: 2, chuaQuyet: 1 });
});

// ── (2) Lọc ứng viên ─────────────────────────────────────────────────────────

test("lọc ứng viên: bỏ block ẩn danh, layout, trùng tên trong cùng tệp — kèm lý do", async () => {
  const { locUngVien } = await import("@/lib/ky-thuat/cad/block");
  const { giuLai, boQua } = locUngVien([
    { blockName: "FCU-01" },
    { blockName: "*U12" },
    { blockName: "*Model_Space" },
    { blockName: "fcu-01" }, // AutoCAD không phân biệt hoa thường
    { blockName: "  " },
  ]);
  assert.deepEqual(
    giuLai.map((u) => u.blockName),
    ["FCU-01"],
  );
  assert.equal(boQua.length, 4);
  assert.ok(
    boQua.every((b) => b.lyDo.length > 0),
    "mỗi block bị bỏ qua phải có lý do đọc được",
  );
});

// ── (3) Integration ──────────────────────────────────────────────────────────

async function donDep(): Promise<void> {
  const { run, query } = await import("@/lib/db");
  for (const r of await query<{ k: string }>(`SELECT storage_key AS k FROM cad_block_libs`)) {
    daLuu.push(r.k);
  }
  for (const r of await query<{ k: string }>(
    `SELECT jsonb_array_elements(manifest -> 'blocks') ->> 'fileKey' AS k FROM cad_block_libs`,
  )) {
    if (r.k) daLuu.push(r.k);
  }
  await run(`DELETE FROM cad_block_batches`); // items xoá theo ON DELETE CASCADE
  await run(`DELETE FROM cad_block_proposals`);
  await run(`DELETE FROM cad_block_libs`);
}

async function phatHanhNen(): Promise<string> {
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
  return row.version;
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM nạp lô', 'blo-pm-${Date.now()}@test.local', 'x', 'pm', 1)`,
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
  await run(`DELETE FROM users WHERE id = ?`, pmId);
});

test("AC6: nhận lô bỏ qua block trùng tên thư viện, giữ lại phần còn lại", S, async () => {
  await donDep();
  const nen = await phatHanhNen();
  const { nhanLoBlock, layLo } = await import("@/lib/ky-thuat/cad/block");

  const kq = await nhanLoBlock({
    userId: pmId,
    nguon: "web",
    ungViens: [
      { blockName: "FCU", attributes: ["TAG"] }, // đã có trong thư viện mẫu
      { blockName: "AHU-01", attributes: ["TAG"] },
      { blockName: "BLOCK1" },
    ],
  });
  assert.equal(kq.status, "created", JSON.stringify(kq));
  if (kq.status !== "created") return;
  assert.equal(kq.tong, 2);
  assert.ok(
    kq.boQua.some((b) => b.blockName === "FCU" && b.lyDo.includes(nen)),
    "lý do bỏ qua phải nói rõ thư viện version nào đã có block đó",
  );

  const chiTiet = await layLo(kq.loId);
  assert.ok(chiTiet);
  assert.equal(chiTiet.lo.status, "pending");
  assert.equal(chiTiet.lo.aiEnabled, false, "PR1 chưa có AI");
  const ahu = chiTiet.dong.find((d) => d.blockName === "AHU-01");
  assert.equal(ahu?.kind, "equipment");
  assert.equal(ahu?.nguonQuyetDinh, "luat");
  const b1 = chiTiet.dong.find((d) => d.blockName === "BLOCK1");
  assert.equal(b1?.kind, null);
  assert.equal(b1?.nguonQuyetDinh, "chua_quyet");
});

test("AC7 + AC9: duyệt lô ra ĐÚNG MỘT version; bấm lại không sinh version thứ hai", S, async () => {
  await donDep();
  const nen = await phatHanhNen();
  const { nhanLoBlock, layLo, duyetLo } = await import("@/lib/ky-thuat/cad/block");
  const { layBlockLibHienHanh, layLichSuBlockLib } = await import("@/lib/ky-thuat/cad/block");

  const nhan = await nhanLoBlock({
    userId: pmId,
    nguon: "web",
    ungViens: [
      { blockName: "AHU-01", attributes: ["TAG"] },
      { blockName: "BLOCK1" }, // chưa quyết được → người duyệt phải khai
    ],
  });
  assert.equal(nhan.status, "created");
  if (nhan.status !== "created") return;

  const truoc = await layLo(nhan.loId);
  const dongB1 = truoc!.dong.find((d) => d.blockName === "BLOCK1")!;

  // Chưa khai kind cho BLOCK1 ⇒ phải bị chặn, không được lẳng lặng bỏ dòng đó.
  const thieu = await duyetLo({ userId: pmId, loId: nhan.loId });
  assert.equal(thieu.status, "invalid", JSON.stringify(thieu));

  // Người duyệt khai loại cho dòng đó (AC9).
  const kq = await duyetLo({
    userId: pmId,
    loId: nhan.loId,
    sua: [{ id: dongB1.id, kind: "fitting", systemId: "HVAC", takeoffItemId: "elbow-duct" }],
  });
  assert.equal(kq.status, "created", JSON.stringify(kq));
  if (kq.status !== "created") return;
  assert.equal(kq.soBlockThem, 2);

  const sau = await layLo(nhan.loId);
  assert.equal(
    sau!.dong.find((d) => d.id === dongB1.id)!.nguonQuyetDinh,
    "nguoi_sua",
    "dòng người sửa phải đổi nguồn quyết định",
  );

  const hienHanh = await layBlockLibHienHanh();
  assert.equal(hienHanh!.version, kq.version);
  assert.notEqual(hienHanh!.version, nen);
  assert.equal(
    hienHanh!.dwgSha256,
    (await layLichSuBlockLib(50)).find((r) => r.version === nen)!.dwgSha256,
    "tệp nền KHÔNG đổi — plugin đang cache theo hash không phải tải lại",
  );
  const ten = hienHanh!.manifest.blocks.map((b) => b.blockName);
  assert.ok(ten.includes("AHU-01") && ten.includes("BLOCK1"));
  assert.ok(ten.includes("FCU"), "block cũ của thư viện không được mất");
  assert.equal(
    hienHanh!.manifest.blocks.find((b) => b.blockName === "BLOCK1")!.kind,
    "fitting",
    "thư viện phải lưu đúng giá trị người duyệt chọn",
  );

  // Bấm duyệt lần nữa → idempotent (AC7).
  const lai = await duyetLo({ userId: pmId, loId: nhan.loId });
  assert.equal(lai.status, "idempotent");
  if (lai.status === "idempotent") assert.equal(lai.version, kq.version);
  const soVersion = (await layLichSuBlockLib(50)).length;
  assert.equal(soVersion, 2, "chỉ nền + 1 version mới");
});

test("AC8: thư viện lên version khác trong lúc lô chờ → lô stale, chặn duyệt", S, async () => {
  await donDep();
  await phatHanhNen();
  const { nhanLoBlock, duyetLo, layLo } = await import("@/lib/ky-thuat/cad/block");

  const nhan = await nhanLoBlock({
    userId: pmId,
    nguon: "web",
    ungViens: [{ blockName: "AHU-01", attributes: ["TAG"] }],
  });
  assert.equal(nhan.status, "created");
  if (nhan.status !== "created") return;

  // Một lượt phát hành KHÁC chen vào giữa lúc lô trên còn chờ (hai kỹ sư nạp song song).
  const chen = await nhanLoBlock({
    userId: pmId,
    nguon: "web",
    ungViens: [{ blockName: "SPK-01", attributes: ["TAG"] }],
  });
  assert.equal(chen.status, "created");
  if (chen.status !== "created") return;
  const daPhatHanh = await duyetLo({ userId: pmId, loId: chen.loId });
  assert.equal(daPhatHanh.status, "created", JSON.stringify(daPhatHanh));

  const kq = await duyetLo({ userId: pmId, loId: nhan.loId });
  assert.equal(kq.status, "stale", JSON.stringify(kq));
  assert.equal((await layLo(nhan.loId))!.lo.status, "stale");
});

test("từ chối lô: ghi lý do, không đụng thư viện", S, async () => {
  await donDep();
  const nen = await phatHanhNen();
  const { nhanLoBlock, tuChoiLo, layLo, duyetLo } = await import("@/lib/ky-thuat/cad/block");
  const { layBlockLibHienHanh } = await import("@/lib/ky-thuat/cad/block");

  const nhan = await nhanLoBlock({
    userId: pmId,
    nguon: "plugin",
    ungViens: [{ blockName: "AHU-01", attributes: ["TAG"] }],
  });
  assert.equal(nhan.status, "created");
  if (nhan.status !== "created") return;

  assert.deepEqual(await tuChoiLo({ userId: pmId, loId: nhan.loId, lyDo: "  " }), {
    ok: false,
    message: "Phải nêu lý do từ chối.",
  });
  assert.equal((await tuChoiLo({ userId: pmId, loId: nhan.loId, lyDo: "Sai tệp" })).ok, true);

  const sau = await layLo(nhan.loId);
  assert.equal(sau!.lo.status, "rejected");
  assert.equal(sau!.lo.rejectReason, "Sai tệp");
  assert.equal((await layBlockLibHienHanh())!.version, nen, "thư viện không được đổi");
  assert.equal((await duyetLo({ userId: pmId, loId: nhan.loId })).status, "stale");
});

test("trần lô + tệp rỗng bị từ chối kèm số đo thật", S, async () => {
  const { nhanLoBlock, TRAN_BLOCK_MOI_LO } = await import("@/lib/ky-thuat/cad/block");
  const rong = await nhanLoBlock({ userId: pmId, nguon: "web", ungViens: [] });
  assert.equal(rong.status, "invalid");

  const qua = await nhanLoBlock({
    userId: pmId,
    nguon: "web",
    ungViens: Array.from({ length: TRAN_BLOCK_MOI_LO + 1 }, (_, i) => ({ blockName: `B${i}` })),
  });
  assert.equal(qua.status, "invalid");
  if (qua.status === "invalid") {
    assert.ok(
      qua.errors[0].includes(String(TRAN_BLOCK_MOI_LO + 1)),
      "phải nói rõ tệp có bao nhiêu block, không cắt âm thầm",
    );
  }
});

test("trần tính trên block NẠP ĐƯỢC, không phải số định nghĩa thô", S, async () => {
  const { nhanLoBlock, TRAN_BLOCK_MOI_LO } = await import("@/lib/ky-thuat/cad/block");
  await donDep();
  await phatHanhNen();

  // Vượt trần về số định nghĩa, nhưng quá nửa là block ẩn danh ⇒ phần nạp được vẫn trong trần.
  // Chặn ca này là chặn oan.
  const ungViens = [
    ...Array.from({ length: TRAN_BLOCK_MOI_LO }, (_, i) => ({ blockName: `OK${i}` })),
    ...Array.from({ length: 50 }, (_, i) => ({ blockName: `*U${i}` })),
  ];
  const kq = await nhanLoBlock({ userId: pmId, nguon: "web", ungViens });
  assert.equal(kq.status, "created", JSON.stringify(kq).slice(0, 300));
  if (kq.status === "created") assert.equal(kq.tong, TRAN_BLOCK_MOI_LO);
});
