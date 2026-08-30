// tests/cad-schematic.test.ts — M117 PR1 (§8 AC1): TẦNG 1 luật đọc sơ đồ nguyên lý (schematic)
// thành đồ thị kết nối. Test THUẦN: không chạm DB, không gọi AI (nên không import tests/setup.ts).
//
// Bản vẽ mẫu dựng ngay trong tệp này bằng vài hàm sinh DXF nhỏ — cố ý không dùng tệp nhị phân để
// người đọc thấy được ngay hình học đang test (mối nối chữ T, khe hở dung sai, nhánh đứt).
import test from "node:test";
import assert from "node:assert/strict";

import {
  THAM_SO_MAC_DINH,
  docSizeTuChu,
  dungGraphSchematic,
  laTagThietBi,
  type GraphSchematic,
  type NutSchematic,
} from "@/lib/ky-thuat/cad/schematic";
import type { BlockManifestEntry } from "@/lib/ky-thuat/cad/block";

// ── Sinh DXF mẫu ─────────────────────────────────────────────────────────────────────────────

type Dinh = [number, number];

function dxf(...thucThe: string[]): string {
  return ["0", "SECTION", "2", "ENTITIES", ...thucThe, "0", "ENDSEC", "0", "EOF"].join("\n");
}

function line(layer: string, a: Dinh, b: Dinh): string {
  return [
    "0",
    "LINE",
    "8",
    layer,
    "10",
    `${a[0]}`,
    "20",
    `${a[1]}`,
    "30",
    "0",
    "11",
    `${b[0]}`,
    "21",
    `${b[1]}`,
    "31",
    "0",
  ].join("\n");
}

function pline(layer: string, dinhs: Dinh[]): string {
  const dau = ["0", "LWPOLYLINE", "8", layer, "90", `${dinhs.length}`, "70", "0"];
  const toado = dinhs.flatMap((d) => ["10", `${d[0]}`, "20", `${d[1]}`]);
  return [...dau, ...toado].join("\n");
}

function text(layer: string, chu: string, p: Dinh): string {
  return [
    "0",
    "TEXT",
    "8",
    layer,
    "10",
    `${p[0]}`,
    "20",
    `${p[1]}`,
    "30",
    "0",
    "40",
    "100",
    "1",
    chu,
  ].join("\n");
}

function insert(layer: string, ten: string, p: Dinh, thuocTinh?: Record<string, string>): string {
  const dau = ["0", "INSERT", "8", layer, "2", ten, "10", `${p[0]}`, "20", `${p[1]}`, "30", "0"];
  if (!thuocTinh || Object.keys(thuocTinh).length === 0) return dau.join("\n");
  const atts = Object.entries(thuocTinh).flatMap(([the, gt]) => [
    "0",
    "ATTRIB",
    "8",
    layer,
    "10",
    `${p[0]}`,
    "20",
    `${p[1]}`,
    "30",
    "0",
    "1",
    gt,
    "2",
    the,
  ]);
  return [...dau, "66", "1", ...atts, "0", "SEQEND", "8", layer].join("\n");
}

// ── Thư viện block mẫu (đúng hình dạng manifest M100 §11) ────────────────────────────────────

const THU_VIEN_MAU: BlockManifestEntry[] = [
  { id: "chiller", blockName: "XB-CHILLER", kind: "equipment", system: "CHW" },
  { id: "bom", blockName: "XB-PUMP", kind: "equipment", system: "CHW" },
  { id: "fcu", blockName: "XB-FCU", kind: "equipment", system: "CHW" },
  { id: "van", blockName: "XB-VAN", kind: "fitting", system: "CHW", attributes: ["TAG"] },
  { id: "khung-ten", blockName: "XB-TITLEBLOCK", kind: "titleblock", paper: "A1" },
];

/**
 * Sơ đồ nguyên lý nước lạnh rút gọn (đơn vị mm), gồm đủ các ca tầng 1 phải xử lý:
 *
 *   CH-01 ──DN150── P-01 ──DN100── ┬(4000,0)──Ø50── FCU-01
 *                                  └────────DN32─── FCU-02
 *   (6000,3000) ────────── (7000,3000)      ← nhánh đứt, chữ chú thích không phải size
 *   (7000,0) ───────────── XB-LA-MAT        ← block lạ, đầu còn lại bỏ hở
 *
 * Cố ý gài: khe hở 8mm ở đầu bơm (dưới dung sai 20), chữ "DN80" đặt xa mọi cạnh, chữ tag rời cho
 * hai FCU (khối không có ATTRIB).
 */
const DXF_MAU_CHUAN = dxf(
  // Thiết bị
  insert("CHW", "XB-CHILLER", [0, 0], { TAG: "CH-01" }),
  insert("CHW", "XB-PUMP", [2000, 0], { TAG: "P-01" }),
  insert("CHW", "XB-FCU", [5000, 1000]),
  insert("CHW", "XB-FCU", [5000, -1000]),
  insert("CHW", "XB-LA-MAT", [8000, 0]),
  // Ống chính: chiller → bơm → điểm rẽ (đầu vào bơm hở 8mm để thử dung sai)
  line("CHW", [0, 0], [2000, 0]),
  line("CHW", [2000, 8], [4000, 0]),
  // Hai nhánh về FCU
  pline("CHW", [
    [4000, 0],
    [4000, 1000],
    [5000, 1000],
  ]),
  pline("CHW", [
    [4000, 0],
    [4000, -1000],
    [5000, -1000],
  ]),
  // Nhánh đứt (không chạm thiết bị nào) + chữ không phải mẫu size
  line("CHW", [6000, 3000], [7000, 3000]),
  text("CHW", "ONG GIO CAP", [6500, 3100]),
  // Nhánh vào block lạ, đầu kia bỏ hở
  line("CHW", [7000, 0], [7900, 0]),
  // Nhãn kích thước
  text("CHW", "DN150", [1000, 150]),
  text("CHW", "DN100", [3000, 150]),
  text("CHW", "%%c50", [4500, 1150]),
  text("CHW", "DN32", [4500, -1150]),
  // Nhãn đặt xa mọi cạnh — không được gán cho ai
  text("CHW", "DN80", [15000, 15000]),
  // Tag rời của hai FCU
  text("CHW", "FCU-01", [5000, 1200]),
  text("CHW", "FCU-02", [5000, -1200]),
);

// ── Nhãn hoá đồ thị cho dễ đối chiếu ─────────────────────────────────────────────────────────

/** Nhãn ổn định của một nút: thiết bị theo tag/tên khối, nút hình học theo loại + toạ độ. */
function nhan(n: NutSchematic): string {
  if (n.loai === "thiet_bi") return n.tag ?? n.blockName ?? n.id;
  return `${n.loai.toUpperCase()}@${Math.round(n.x)},${Math.round(n.y)}`;
}

function capCanh(g: GraphSchematic): string[] {
  const theoId = new Map(g.nodes.map((n) => [n.id, n] as const));
  return g.edges.map((e) =>
    [nhan(theoId.get(e.from)!), nhan(theoId.get(e.to)!)].sort().join(" | "),
  );
}

function nutTheoNhan(g: GraphSchematic, ten: string): NutSchematic {
  const n = g.nodes.find((x) => nhan(x) === ten);
  assert.ok(n, `không tìm thấy nút "${ten}" trong đồ thị`);
  return n;
}

// ── AC1: mẫu chuẩn ⇒ ≥90% cạnh đúng ─────────────────────────────────────────────────────────

test("M117 AC1 — schematic mẫu chuẩn: tầng 1 dựng đúng ≥90% số cạnh", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);

  // Danh sách cạnh do người đọc bản vẽ liệt kê tay.
  const mongDoi = [
    ["CH-01", "P-01"],
    ["P-01", "NUT_RE@4000,0"],
    ["NUT_RE@4000,0", "FCU-01"],
    ["NUT_RE@4000,0", "FCU-02"],
    ["DAU_HO@6000,3000", "DAU_HO@7000,3000"],
    ["DAU_HO@7000,0", "XB-LA-MAT"],
  ].map((c) => [...c].sort().join(" | "));

  const thucTe = capCanh(g);
  const dung = mongDoi.filter((c) => thucTe.includes(c)).length;
  assert.ok(
    dung / mongDoi.length >= 0.9,
    `mới dựng đúng ${dung}/${mongDoi.length} cạnh: ${JSON.stringify(thucTe, null, 2)}`,
  );
  // Không được đẻ thêm cạnh không có thật — nối bừa còn tệ hơn thiếu.
  assert.equal(thucTe.length, mongDoi.length);
});

test("M117 AC1 — size đọc từ chữ gần cạnh, đã chuẩn hoá", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);
  const theoId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const size = new Map(
    g.edges.map(
      (e) =>
        [[nhan(theoId.get(e.from)!), nhan(theoId.get(e.to)!)].sort().join(" | "), e.size] as const,
    ),
  );
  assert.equal(size.get(["CH-01", "P-01"].sort().join(" | ")), "DN150");
  assert.equal(size.get(["P-01", "NUT_RE@4000,0"].sort().join(" | ")), "DN100");
  // `%%c50` là ký hiệu đường kính trong DXF — parser giải mã thành Ø50.
  assert.equal(size.get(["NUT_RE@4000,0", "FCU-01"].sort().join(" | ")), "Ø50");
  assert.equal(size.get(["NUT_RE@4000,0", "FCU-02"].sort().join(" | ")), "DN32");
});

test("M117 AC1 — thiết bị khớp thư viện là 'luat', block lạ để 'chua_quyet'", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);

  const chiller = nutTheoNhan(g, "CH-01");
  assert.equal(chiller.nguon, "luat");
  assert.equal(chiller.kind, "equipment");
  assert.equal(chiller.systemId, "CHW");
  assert.equal(chiller.doTinCay, null); // tầng 1 không có xác suất

  const la = nutTheoNhan(g, "XB-LA-MAT");
  assert.equal(la.nguon, "chua_quyet");
  assert.equal(la.kind, null);
  assert.equal(la.systemId, null);
  assert.match(la.lyDo, /không có trong thư viện/);
});

test("M117 AC1 — tag lấy từ ATTRIB, thiếu ATTRIB thì lấy chữ mã hiệu ở gần", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);
  // CH-01/P-01 đến từ ATTRIB TAG của chính khối; FCU-01/FCU-02 đến từ chữ rời cạnh khối.
  assert.equal(nutTheoNhan(g, "CH-01").blockName, "XB-CHILLER");
  assert.equal(nutTheoNhan(g, "P-01").blockName, "XB-PUMP");
  assert.equal(nutTheoNhan(g, "FCU-01").blockName, "XB-FCU");
  assert.equal(nutTheoNhan(g, "FCU-02").blockName, "XB-FCU");
});

test("M117 AC1 — nút rẽ là 'luat', đầu dây cụt là 'chua_quyet' và cạnh thiếu 'noi'", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);

  const re = nutTheoNhan(g, "NUT_RE@4000,0");
  assert.equal(re.loai, "nut_re");
  assert.equal(re.nguon, "luat");

  const ho = nutTheoNhan(g, "DAU_HO@7000,0");
  assert.equal(ho.loai, "dau_ho");
  assert.equal(ho.nguon, "chua_quyet");

  const theoId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const canhHo = g.edges.filter((e) =>
    [e.from, e.to].some((id) => theoId.get(id)!.loai === "dau_ho"),
  );
  assert.equal(canhHo.length, 2);
  for (const e of canhHo) {
    assert.equal(e.nguon, "chua_quyet");
    assert.ok(e.thieu.includes("noi"));
  }
});

test("M117 AC1 — chữ ở xa hoặc không đúng mẫu size thì KHÔNG gán cho cạnh nào", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);
  // "DN80" đặt cách mọi cạnh hơn 10.000 đơn vị; "ONG GIO CAP" không phải mẫu size.
  assert.equal(
    g.edges.some((e) => e.size === "DN80"),
    false,
  );
  const nhanhDut = g.edges.filter((e) => e.thieu.includes("noi"));
  for (const e of nhanhDut) {
    assert.equal(e.size, null);
    assert.ok(e.thieu.includes("size"));
    assert.match(e.lyDo, /Không có nhãn kích thước/);
  }
});

test("M117 — thống kê và hình dạng JSONB đúng hợp đồng §9", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);
  assert.equal(g.version, 1);
  assert.equal(g.thongKe.tongNut, g.nodes.length);
  assert.equal(g.thongKe.tongCanh, g.edges.length);
  assert.equal(g.thongKe.thietBi, 5);
  assert.equal(g.thongKe.nutRe, 1);
  assert.equal(g.thongKe.dauHo, 3);
  assert.equal(g.thongKe.canhCoSize, 4);
  assert.equal(g.thongKe.canhChuaQuyet, 2);
  // Phải tuần tự hoá được nguyên vẹn để ghi vào cột `cad_schematic_graphs.graph` (JSONB).
  assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
  for (const n of g.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  for (const e of g.edges) assert.ok(e.diem.length >= 2);
});

test("M117 — chạy hai lần trên cùng tệp cho kết quả trùng khít (id ổn định)", () => {
  const a = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);
  const b = dungGraphSchematic(DXF_MAU_CHUAN, THU_VIEN_MAU);
  assert.deepEqual(b, a);
});

// ── Dung sai điểm chạm & hình học ────────────────────────────────────────────────────────────

test("M117 — dung sai điểm chạm: khe hở nhỏ hơn dung sai vẫn coi là nối", () => {
  const noiHut = dxf(line("CHW", [0, 0], [1000, 0]), line("CHW", [1015, 0], [2000, 0]));

  // Dung sai mặc định 20 > khe 15 ⇒ hai đoạn thành MỘT cạnh giữa hai đầu hở.
  const gan = dungGraphSchematic(noiHut, THU_VIEN_MAU);
  assert.equal(gan.edges.length, 1);
  assert.equal(gan.thongKe.dauHo, 2);

  // Siết dung sai xuống 5 ⇒ đúng hai cạnh rời, bốn đầu hở (tham số hoá có tác dụng thật).
  const chat = dungGraphSchematic(noiHut, THU_VIEN_MAU, { dungSaiNut: 5 });
  assert.equal(chat.edges.length, 2);
  assert.equal(chat.thongKe.dauHo, 4);
});

test("M117 — mối nối chữ T: đầu dây chạm GIỮA dây khác thì cắt đoạn thành nút rẽ", () => {
  const chuT = dxf(line("CHW", [0, 0], [2000, 0]), line("CHW", [1000, 12], [1000, 1000]));
  const g = dungGraphSchematic(chuT, THU_VIEN_MAU);
  assert.equal(g.thongKe.nutRe, 1);
  assert.equal(g.edges.length, 3);
});

test("M117 — chữ nằm giữa hai cạnh ở khoảng cách xấp xỉ nhau thì bỏ, không đoán", () => {
  const songSong = dxf(
    line("CHW", [0, 0], [2000, 0]),
    line("CHW", [0, 600], [2000, 600]),
    text("CHW", "DN100", [1000, 300]),
  );
  const g = dungGraphSchematic(songSong, THU_VIEN_MAU);
  assert.equal(g.edges.length, 2);
  for (const e of g.edges) assert.equal(e.size, null);
  assert.ok(g.canhBao.some((c) => /nằm gần từ hai cạnh trở lên/.test(c)));
});

test("M117 — khối khung tên không được thành nút của sơ đồ", () => {
  const coKhungTen = dxf(
    line("CHW", [0, 0], [2000, 0]),
    insert("KHUNGTEN", "XB-TITLEBLOCK", [50000, 50000]),
  );
  const g = dungGraphSchematic(coKhungTen, THU_VIEN_MAU);
  assert.equal(g.thongKe.thietBi, 0);
  assert.ok(g.canhBao.some((c) => /khung tên/.test(c)));
});

test("M117 — thiết bị vẽ ĐÈ lên ống: cắt ống tại vị trí thiết bị", () => {
  const vanTrenOng = dxf(
    line("CHW", [0, 0], [2000, 0]),
    insert("CHW", "XB-VAN", [1000, 0], { TAG: "V-01" }),
  );
  const g = dungGraphSchematic(vanTrenOng, THU_VIEN_MAU);
  const van = nutTheoNhan(g, "V-01");
  assert.equal(van.kind, "fitting");
  const canhCuaVan = g.edges.filter((e) => e.from === van.id || e.to === van.id);
  assert.equal(canhCuaVan.length, 2);
});

test("M117 — tệp rỗng/không phải DXF: trả đồ thị rỗng kèm cảnh báo, không ném lỗi", () => {
  const g = dungGraphSchematic("không phải DXF", THU_VIEN_MAU);
  assert.equal(g.nodes.length, 0);
  assert.equal(g.edges.length, 0);
  assert.ok(g.canhBao.length > 0);
});

test("M117 — thư viện block rỗng: mọi thiết bị đều 'chua_quyet' nhưng cạnh vẫn dựng đủ", () => {
  const g = dungGraphSchematic(DXF_MAU_CHUAN, []);
  assert.equal(g.thongKe.canhCoSize, 4);
  assert.ok(g.nodes.filter((n) => n.loai === "thiet_bi").every((n) => n.nguon === "chua_quyet"));
});

// ── Đọc chữ ─────────────────────────────────────────────────────────────────────────────────

test("M117 — docSizeTuChu chuẩn hoá đúng và không đọc nhầm mã hiệu thiết bị", () => {
  assert.equal(docSizeTuChu("600x300"), "600x300");
  assert.equal(docSizeTuChu("ỐNG GIÓ CẤP 600 X 300"), "600x300");
  assert.equal(docSizeTuChu("600×300"), "600x300");
  assert.equal(docSizeTuChu("DN100"), "DN100");
  assert.equal(docSizeTuChu("dn 100"), "DN100");
  assert.equal(docSizeTuChu("Ø50"), "Ø50");
  assert.equal(docSizeTuChu("PHI 32"), "Ø32");
  assert.equal(docSizeTuChu("D200"), "Ø200");
  // Mã hiệu thiết bị KHÔNG được đọc thành size.
  assert.equal(docSizeTuChu("FCU-01"), null);
  assert.equal(docSizeTuChu("AHU-D2"), null);
  assert.equal(docSizeTuChu("GHI CHÚ CHUNG"), null);
  assert.equal(docSizeTuChu(""), null);
});

test("M117 — laTagThietBi nhận mã hiệu, loại câu chữ thường", () => {
  assert.equal(laTagThietBi("FCU-01"), true);
  assert.equal(laTagThietBi("AHU-2-05"), true);
  assert.equal(laTagThietBi("P_01"), true);
  assert.equal(laTagThietBi("ỐNG GIÓ CẤP"), false);
  assert.equal(laTagThietBi("600x300"), false);
});

test("M117 — tham số mặc định giữ nguyên hợp đồng (ngưỡng theo đơn vị bản vẽ)", () => {
  assert.equal(THAM_SO_MAC_DINH.dungSaiNut, 20);
  assert.equal(THAM_SO_MAC_DINH.banKinhChamBlock, 300);
  assert.equal(THAM_SO_MAC_DINH.nguongTextCanh, 500);
  assert.ok(THAM_SO_MAC_DINH.heSoNhapNhang > 1);
});
