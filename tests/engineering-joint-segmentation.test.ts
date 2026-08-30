// M105 PR1 — Engine chia đốt MEPF theo kiểu kết nối (thuần, KHÔNG chạm DB nên không cần
// tests/setup.ts). Phủ AC1–AC8, AC13 qua bộ test vector JSON dùng chung với engine C# (AC12),
// cộng các ca riêng cho chọn kiểu nối tự động, ghi đè, parser biểu thức định mức, và bất biến
// "layer vạch chia không được khớp takeoff" (M105 FR5 — cùng lớp lỗi mà M100 FR4 đã né bằng
// hậu tố EDGE).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  chonKieuNoi,
  docJointRulesTuRulePack,
  docTuyenTuRulePack,
  explodeJointHardware,
  layerVachChia,
  parseSize,
  segmentRunIntoPieces,
  segmentSegment,
  tagDot,
  tinhBieuThucDinhMuc,
  SAI_SO_TONG_CHIEU_DAI_MM,
  type DivideMode,
  type JointHardwareLine,
  type JointRules,
  type JointWarning,
  type PieceResult,
  type SizeKind,
} from "@/lib/ky-thuat/engineering-joint-segmentation";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";
import { hasToken } from "@/lib/ky-thuat/cad/dxf-parser";

// ===== (1) Bộ test vector dùng chung với engine C# (NFR1/AC12) =====

interface TestVector {
  id: string;
  ac: string;
  note: string;
  input: {
    systemId: string;
    itemId: string;
    size: string;
    sizeKind: SizeKind;
    runIndex: number;
    overrideJointType?: string;
    rules: JointRules;
    segments: { lengthMm: number; hasBulge?: boolean }[];
  };
  expected: {
    jointType: string;
    overridden: boolean;
    divideMode: DivideMode;
    maxLenMm: number;
    jointGapMm: number;
    minPieceLenMm: number;
    totalLengthMm: number;
    pieceCount: number;
    jointCount: number;
    pieces: PieceResult[];
    warnings: JointWarning[];
    hardware: JointHardwareLine[];
  };
}

const THU_MUC_VECTOR = join(process.cwd(), "plugin-autocad/testdata/joint-segmentation");

function napVector(): TestVector[] {
  return readdirSync(THU_MUC_VECTOR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(THU_MUC_VECTOR, f), "utf8")) as TestVector);
}

test("test vector: thư mục có đủ bộ ca bắt buộc của đặc tả", () => {
  const ids = napVector().map((v) => v.id);
  for (const bat_buoc of [
    "duct-tdc-7200", // AC1 + AC13
    "duct-nepc-1180", // AC2
    "duct-nepc-1181", // AC3
    "duct-doan-ngan-150", // AC4
    "duct-ghi-de-bich-v-3500", // AC5
    "duct-tdc-2-doan", // AC6
    "pipe-grooved-14000", // AC7
    "tray-tamnoi-9000", // AC8
    "pipe-ren-11700-dot-le-ngan", // FR3 — dồn đốt lẻ
  ]) {
    assert.ok(ids.includes(bat_buoc), `thiếu test vector ${bat_buoc}`);
  }
  assert.ok(ids.length >= 6, "bộ vector phải có tối thiểu 6 ca");
});

for (const v of napVector()) {
  test(`vector ${v.id} (${v.ac}): ${v.note}`, () => {
    const kq = segmentRunIntoPieces({
      systemId: v.input.systemId,
      itemId: v.input.itemId,
      size: v.input.size,
      sizeKind: v.input.sizeKind,
      runIndex: v.input.runIndex,
      rules: v.input.rules,
      segments: v.input.segments,
      ...(v.input.overrideJointType ? { overrideJointType: v.input.overrideJointType } : {}),
    });

    assert.equal(kq.jointType, v.expected.jointType, "kiểu nối");
    assert.equal(kq.overridden, v.expected.overridden, "cờ ghi đè");
    assert.equal(kq.divideMode, v.expected.divideMode, "chế độ chia");
    assert.equal(kq.maxLenMm, v.expected.maxLenMm, "đốt tối đa");
    assert.equal(kq.jointGapMm, v.expected.jointGapMm, "khe mối nối");
    assert.equal(kq.minPieceLenMm, v.expected.minPieceLenMm, "đốt tối thiểu");
    assert.equal(kq.totalLengthMm, v.expected.totalLengthMm, "tổng chiều dài");
    assert.equal(kq.pieceCount, v.expected.pieceCount, "số đốt");
    assert.equal(kq.jointCount, v.expected.jointCount, "số mối nối");
    assert.deepEqual(kq.warnings, v.expected.warnings, "cảnh báo");

    assert.equal(kq.pieces.length, v.expected.pieces.length, "số dòng đốt");
    kq.pieces.forEach((dot, i) => {
      const mong = v.expected.pieces[i];
      assert.ok(mong, `thiếu đốt kỳ vọng #${i}`);
      assert.equal(dot.segmentIndex, mong.segmentIndex, `đốt ${i}: segmentIndex`);
      assert.equal(dot.pieceIndex, mong.pieceIndex, `đốt ${i}: pieceIndex`);
      assert.equal(dot.tag, mong.tag, `đốt ${i}: tag`);
      assert.ok(
        Math.abs(dot.lengthMm - mong.lengthMm) <= 0.05,
        `đốt ${i}: dài ${dot.lengthMm} ≠ kỳ vọng ${mong.lengthMm}`,
      );
    });

    // Bất biến FR2 trên từng đoạn — tính lại độc lập với engine.
    v.input.segments.forEach((seg, segmentIndex) => {
      const cua = kq.pieces.filter((p) => p.segmentIndex === segmentIndex);
      const tong =
        cua.reduce((s, p) => s + p.lengthMm, 0) + (cua.length - 1) * v.expected.jointGapMm;
      assert.ok(
        Math.abs(tong - seg.lengthMm) <= SAI_SO_TONG_CHIEU_DAI_MM,
        `đoạn ${segmentIndex}: Σ đốt + khe = ${tong} ≠ ${seg.lengthMm}`,
      );
    });

    const hardware = explodeJointHardware(kq, v.input.rules.hardware);
    assert.equal(hardware.length, v.expected.hardware.length, "số dòng phụ kiện");
    hardware.forEach((dong, i) => {
      const mong = v.expected.hardware[i];
      assert.ok(mong, `thiếu dòng phụ kiện kỳ vọng #${i}`);
      assert.equal(dong.item, mong.item, `phụ kiện ${i}: mã`);
      assert.equal(dong.unit, mong.unit, `phụ kiện ${i}: đơn vị`);
      assert.ok(
        Math.abs(dong.quantity - mong.quantity) <= 0.001,
        `phụ kiện ${dong.item}: ${dong.quantity} ≠ kỳ vọng ${mong.quantity}`,
      );
    });
  });
}

// ===== (2) Chọn kiểu nối tự động theo cạnh lớn / DN (FR1) =====

const SEL_DUCT = [
  { jointType: "nep_c", maxSideMm: 450, maxLenMm: 1180, jointGapMm: 0 },
  { jointType: "tdc", maxSideMm: 1500, maxLenMm: 1110, jointGapMm: 5 },
  { jointType: "mat_bich_v", maxSideMm: null, maxLenMm: 1180, jointGapMm: 5 },
];
const SEL_PIPE = [
  { jointType: "ren", maxDn: 50, maxLenMm: 5800, jointGapMm: 0 },
  { jointType: "grooved", maxDn: null, maxLenMm: 5800, jointGapMm: 3 },
];

test("chonKieuNoi: tuyến WxH xét CẠNH LỚN, mục đầu khớp thắng", () => {
  const kieu = (size: string) => chonKieuNoi(size, "WxH", SEL_DUCT)?.jointType;
  assert.equal(kieu("300x200"), "nep_c"); // cạnh lớn 300 ≤ 450
  assert.equal(kieu("450x200"), "nep_c"); // biên trên của nẹp C
  assert.equal(kieu("200x451"), "tdc"); // cạnh lớn là CHIỀU CAO, không phải W
  assert.equal(kieu("800x400"), "tdc"); // AC5 — 800×400 tự chọn TDC
  assert.equal(kieu("1500x400"), "tdc"); // biên trên của TDC
  assert.equal(kieu("1600x400"), "mat_bich_v"); // vượt dải → mục bắt hết
  assert.equal(kieu("800X400"), "tdc"); // chữ X hoa
  assert.equal(chonKieuNoi("khong-phai-co", "WxH", SEL_DUCT), null);
});

test("chonKieuNoi: tuyến DN xét số DN", () => {
  const kieu = (size: string) => chonKieuNoi(size, "DN", SEL_PIPE)?.jointType;
  assert.equal(kieu("DN25"), "ren");
  assert.equal(kieu("DN50"), "ren"); // biên trên
  assert.equal(kieu("DN65"), "grooved");
  assert.equal(kieu("DN80"), "grooved"); // AC7
  assert.equal(kieu("dn 200"), "grooved");
  assert.equal(chonKieuNoi("80", "DN", SEL_PIPE), null); // thiếu tiền tố DN
});

test("parseSize: đọc W/H và DN làm biến cho biểu thức định mức", () => {
  assert.deepEqual(parseSize("800x400", "WxH"), { W: 800, H: 400 });
  assert.deepEqual(parseSize("800X400", "WxH"), { W: 800, H: 400 });
  assert.deepEqual(parseSize(" 800 x 400 ", "WxH"), { W: 800, H: 400 });
  assert.deepEqual(parseSize("DN80", "DN"), { DN: 80 });
  assert.deepEqual(parseSize("dn80", "DN"), { DN: 80 });
  assert.equal(parseSize("", "WxH"), null);
  assert.equal(parseSize("0x400", "WxH"), null);
});

// ===== (3) Ghi đè kiểu nối (AC5) =====

const RULES_DUCT: JointRules = {
  selection: SEL_DUCT,
  divideMode: "deu",
  minPieceLenMm: 200,
  layerStyle: { suffix: "JOINT", color: 8, linetype: "DASHED" },
  hardware: {
    nep_c: [
      { item: "thanh-nep-c", perJoint: "2*W", unit: "m" },
      { item: "thanh-s-slip", perJoint: "2*H", unit: "m" },
    ],
    tdc: [
      { item: "ke-goc-tdc", perJoint: 4, unit: "cái" },
      { item: "bulong-m8", perJoint: 8, unit: "cái" },
      { item: "gioang-tdc-m", perJoint: "2*(W+H)", unit: "m" },
    ],
    mat_bich_v: [
      { item: "thep-goc-v-m", perJoint: "2*(W+H)", unit: "m" },
      { item: "bulong-m8", perJoint: "ceil(2*(W+H)/100)", unit: "cái" },
    ],
  },
};

function chayDuct(lengthMm: number, ghiDe?: string) {
  return segmentRunIntoPieces({
    systemId: "HVAC",
    itemId: "duct-supp",
    size: "800x400",
    sizeKind: "WxH",
    runIndex: 1,
    rules: RULES_DUCT,
    segments: [{ lengthMm }],
    ...(ghiDe ? { overrideJointType: ghiDe } : {}),
  });
}

test("ghi đè kiểu nối: dùng tham số kiểu được chọn tay, bật cờ overridden", () => {
  const tuDong = chayDuct(3500);
  assert.equal(tuDong.jointType, "tdc");
  assert.equal(tuDong.overridden, false);

  const ghiDe = chayDuct(3500, "mat_bich_v");
  assert.equal(ghiDe.jointType, "mat_bich_v");
  assert.equal(ghiDe.overridden, true);
  assert.equal(ghiDe.maxLenMm, 1180, "phải dùng đốt tối đa của bích V");
  assert.notEqual(ghiDe.pieceCount, tuDong.pieceCount, "tham số khác thì cách chia phải khác");

  // Ghi đè trùng đúng kiểu tự chọn thì KHÔNG coi là ghi đè.
  assert.equal(chayDuct(3500, "tdc").overridden, false);
});

test("ghi đè kiểu nối lạ (tuyến không khai) → ném lỗi tiếng Việt, không đoán bừa", () => {
  assert.throws(() => chayDuct(3500, "tdf-tu-gap"), /không khai kiểu nối "tdf-tu-gap"/);
});

test("tagDot: D-<itemId>-<tuyến 3 chữ số>-<đốt 2 chữ số>", () => {
  assert.equal(tagDot("duct-supp", 1, 1), "D-duct-supp-001-01");
  assert.equal(tagDot("chw-pipe", 12, 7), "D-chw-pipe-012-07");
  assert.equal(tagDot("tray-pwr", 128, 103), "D-tray-pwr-128-103");
});

// ===== (4) Phụ kiện mối nối (AC13) & parser biểu thức (FR7) =====

test("AC13 — QTO phụ kiện TDC cho 800x400 dài 7200: 6 mối × (4 ke + 8 bulông), gioăng 14,4 m", () => {
  const kq = chayDuct(7200);
  assert.equal(kq.jointCount, 6);
  const hw = explodeJointHardware(kq, RULES_DUCT.hardware);
  const tra = (item: string) => hw.find((d) => d.item === item);
  assert.deepEqual(tra("ke-goc-tdc"), { item: "ke-goc-tdc", unit: "cái", quantity: 24 });
  assert.deepEqual(tra("bulong-m8"), { item: "bulong-m8", unit: "cái", quantity: 48 });
  // 2*(800+400) = 2400 mm = 2,4 m mỗi mối × 6 mối = 14,4 m (đơn vị "m" quy đổi mm→m).
  assert.deepEqual(tra("gioang-tdc-m"), { item: "gioang-tdc-m", unit: "m", quantity: 14.4 });
});

test("phụ kiện: tuyến 0 mối nối không phát sinh vật tư; kiểu nối thiếu định mức → ném lỗi", () => {
  const motDot = chayDuct(1000);
  assert.equal(motDot.jointCount, 0);
  assert.deepEqual(explodeJointHardware(motDot, RULES_DUCT.hardware), []);
  assert.throws(
    () => explodeJointHardware({ jointType: "la_hoac", jointCount: 3, size: "800x400" }, {}),
    /thiếu định mức phụ kiện cho kiểu nối "la_hoac"/,
  );
});

test("phụ kiện: đọc lại từ bảng đốt (chỉ có chuỗi size) vẫn ra đúng số", () => {
  const hw = explodeJointHardware(
    { jointType: "tdc", jointCount: 6, size: "800x400", itemId: "duct-supp" },
    RULES_DUCT.hardware,
  );
  assert.deepEqual(hw.find((d) => d.item === "gioang-tdc-m")?.quantity, 14.4);
});

test("parser biểu thức định mức: số, biến, 4 phép, ngoặc, ceil()", () => {
  const v = { W: 800, H: 400 };
  assert.equal(tinhBieuThucDinhMuc("4", v), 4);
  assert.equal(tinhBieuThucDinhMuc("2*W", v), 1600);
  assert.equal(tinhBieuThucDinhMuc("2*(W+H)", v), 2400);
  assert.equal(tinhBieuThucDinhMuc("ceil(2*(W+H)/100)", v), 24);
  assert.equal(
    tinhBieuThucDinhMuc("ceil(2*(W+H)/100)", { W: 805, H: 400 }),
    25,
    "ceil làm tròn lên",
  );
  assert.equal(tinhBieuThucDinhMuc("W/H", v), 2, "phép chia");
  assert.equal(tinhBieuThucDinhMuc("W - H - 100", v), 300, "trừ trái sang phải");
  assert.equal(tinhBieuThucDinhMuc("1 + 2*3", v), 7, "nhân trước cộng");
  assert.equal(tinhBieuThucDinhMuc("(1+2)*3", v), 9, "ngoặc đổi thứ tự");
  assert.equal(tinhBieuThucDinhMuc("0.5*DN", { DN: 80 }), 40, "số thập phân + biến DN");
  assert.equal(tinhBieuThucDinhMuc("-2 + 10", v), 8, "dấu âm một ngôi");
});

test("parser biểu thức định mức: biểu thức lạ phải ném lỗi, không bao giờ thực thi mã", () => {
  const v = { W: 800, H: 400 };
  const loi = [
    "process.exit(1)", // truy cập toàn cục
    "require('fs')", // gọi hàm ngoài danh sách
    "W ** 2", // toán tử không hỗ trợ
    "Math.max(W,H)", // hàm không hỗ trợ
    "X + 1", // biến không xác định
    "DN + 1", // tuyến WxH không có DN
    "2*(W+H", // thiếu đóng ngoặc
    "2*", // thiếu vế
    "W 800", // thừa token
    "W/0", // chia cho 0
    "", // rỗng
  ];
  for (const bt of loi) {
    assert.throws(() => tinhBieuThucDinhMuc(bt, v), new RegExp("."), `phải ném lỗi: "${bt}"`);
  }
  // Lỗi phải nói tiếng Việt, đủ để kỹ sư sửa rule pack.
  assert.throws(() => tinhBieuThucDinhMuc("X + 1", v), /không hợp lệ: "X"/);
  assert.throws(() => tinhBieuThucDinhMuc("DN + 1", v), /biến "DN" mà cỡ tuyến không có giá trị/);
});

// ===== (5) Bất biến số học FR2 trên dải chiều dài rộng =====

test("bất biến FR2: Σ đốt + khe = chiều dài đoạn ở mọi chiều dài, cả 2 chế độ", () => {
  const cacRule = [
    { maxLenMm: 1110, jointGapMm: 5 },
    { maxLenMm: 1180, jointGapMm: 0 },
    { maxLenMm: 5800, jointGapMm: 3 },
    { maxLenMm: 2500, jointGapMm: 0 },
  ];
  const modes: DivideMode[] = ["deu", "cay_nguyen"];
  for (const rule of cacRule) {
    for (const mode of modes) {
      for (let L = 210; L <= 30000; L += 137) {
        const kq = segmentSegment(L, rule, mode, 200);
        const tong =
          kq.pieces.reduce((s, p) => s + p, 0) + (kq.pieces.length - 1) * rule.jointGapMm;
        assert.ok(
          Math.abs(tong - L) <= SAI_SO_TONG_CHIEU_DAI_MM,
          `${mode} L=${L} maxLen=${rule.maxLenMm}: Σ=${tong}`,
        );
        assert.ok(
          !kq.warnings.includes("sai_lech_tong_chieu_dai"),
          `${mode} L=${L}: engine tự báo lệch tổng`,
        );
        assert.ok(
          kq.pieces.every((p) => p <= rule.maxLenMm + 0.5),
          `${mode} L=${L}: có đốt dài quá đốt tối đa`,
        );
      }
    }
  }
});

test("cay_nguyen: phần dư nhỏ hơn cả khe mối nối vẫn không sinh đốt dài 0/âm", () => {
  // L = maxLen + 2 với khe 3: sau cây nguyên đầu chỉ còn 2 mm, không đủ mở một mối nối mới.
  for (const min of [0, 300]) {
    const kq = segmentSegment(5802, { maxLenMm: 5800, jointGapMm: 3 }, "cay_nguyen", min);
    assert.ok(
      kq.pieces.every((p) => p > 0),
      `min=${min}: có đốt dài 0 hoặc âm — ${JSON.stringify(kq.pieces)}`,
    );
    const tong = kq.pieces.reduce((s, p) => s + p, 0) + (kq.pieces.length - 1) * 3;
    assert.ok(Math.abs(tong - 5802) <= SAI_SO_TONG_CHIEU_DAI_MM, `min=${min}: Σ=${tong}`);
  }
});

test("segmentSegment: đầu vào vô lý ném lỗi ngay (fail-fast)", () => {
  const rule = { maxLenMm: 1110, jointGapMm: 5 };
  assert.throws(() => segmentSegment(0, rule, "deu", 200), /Chiều dài đoạn không hợp lệ/);
  assert.throws(() => segmentSegment(-5, rule, "deu", 200), /Chiều dài đoạn không hợp lệ/);
  assert.throws(
    () => segmentSegment(1000, { maxLenMm: 0, jointGapMm: 0 }, "deu", 200),
    /maxLenMm không hợp lệ/,
  );
  assert.throws(
    () => segmentSegment(1000, { maxLenMm: 100, jointGapMm: -1 }, "deu", 200),
    /jointGapMm không hợp lệ/,
  );
});

test("FR4: đoạn có cung tròn (bulge) không chia, giữ nguyên 1 đốt kèm cảnh báo", () => {
  const kq = segmentRunIntoPieces({
    systemId: "HVAC",
    itemId: "duct-supp",
    size: "800x400",
    sizeKind: "WxH",
    runIndex: 1,
    rules: RULES_DUCT,
    segments: [{ lengthMm: 4000, hasBulge: true }, { lengthMm: 2000 }],
  });
  assert.deepEqual(kq.warnings, ["doan_cong_khong_chia_duoc"]);
  assert.equal(kq.pieces.filter((p) => p.segmentIndex === 0).length, 1);
  assert.equal(kq.pieces.filter((p) => p.segmentIndex === 1).length, 2);
  assert.equal(kq.jointCount, 1, "đoạn không chia không sinh mối nối");
});

// ===== (6) Đọc tham số từ rule pack (AC10) =====

test("docJointRulesTuRulePack: tuyến có khai thì trả tham số, không khai thì trả null", () => {
  const pack = getCurrentRulePack();
  const duct = docTuyenTuRulePack(pack, "HVAC", "duct-supp");
  assert.ok(duct, "duct-supp phải có jointRules trong rule pack v9");
  assert.equal(duct.sizeKind, "WxH");
  assert.equal(duct.layer, "M-DUCT-SUPP");
  assert.equal(duct.jointRules.divideMode, "deu");

  const pipe = docJointRulesTuRulePack(pack, "PIPING", "chw-pipe");
  assert.ok(pipe);
  assert.equal(pipe.divideMode, "cay_nguyen");

  assert.equal(docJointRulesTuRulePack(pack, "HVAC", "khong-co-tuyen-nay"), null);
  assert.equal(docJointRulesTuRulePack(pack, "KHONG-CO-HE", "duct-supp"), null);
  // Không truyền rule pack → dùng rule pack đang phát hành.
  assert.ok(docJointRulesTuRulePack(null, "HVAC", "duct-supp"));
});

test("rule pack v9: mọi tuyến vẽ được đều khai jointRules hợp lệ (phủ kín, có định mức)", () => {
  const pack = getCurrentRulePack();
  for (const sys of pack.drawTools.systems) {
    for (const line of sys.lines) {
      const info = docTuyenTuRulePack(pack, sys.id, line.itemId);
      assert.ok(info, `tuyến ${sys.id}/${line.itemId} thiếu jointRules`);
      const r = info.jointRules;
      assert.ok(["deu", "cay_nguyen"].includes(r.divideMode), `divideMode lạ: ${r.divideMode}`);
      assert.ok(r.selection.length > 0, `${line.itemId}: selection rỗng`);
      const cuoi = r.selection[r.selection.length - 1];
      const nguongCuoi = info.sizeKind === "WxH" ? cuoi?.maxSideMm : cuoi?.maxDn;
      assert.equal(nguongCuoi ?? null, null, `${line.itemId}: selection không có mục bắt hết`);
      for (const row of r.selection) {
        assert.ok(
          row.maxLenMm > r.minPieceLenMm,
          `${line.itemId}/${row.jointType}: maxLenMm phải lớn hơn minPieceLenMm`,
        );
        assert.ok(r.hardware[row.jointType], `${line.itemId}: thiếu định mức ${row.jointType}`);
      }
      // Mọi cỡ khai sẵn của tuyến phải chọn được kiểu nối và tính được định mức.
      for (const size of line.sizes) {
        const chon = chonKieuNoi(size, info.sizeKind, r.selection);
        assert.ok(chon, `${line.itemId}: cỡ ${size} không chọn được kiểu nối`);
        const kq = segmentRunIntoPieces({
          systemId: sys.id,
          itemId: line.itemId,
          size,
          sizeKind: info.sizeKind,
          runIndex: 1,
          rules: r,
          segments: [{ lengthMm: 12345 }],
        });
        assert.ok(kq.pieceCount > 0);
        assert.ok(explodeJointHardware(kq, r.hardware).length > 0);
      }
    }
  }
});

// ===== (7) Bất biến layer: vạch chia KHÔNG được khớp takeoff (FR5) =====

test("FR5: layer vạch chia của mọi tuyến KHÔNG khớp takeoff.layerMatchAny nào (chống bóc trùng)", () => {
  const pack = getCurrentRulePack();
  for (const sys of pack.drawTools.systems) {
    for (const line of sys.lines) {
      const info = docTuyenTuRulePack(pack, sys.id, line.itemId);
      assert.ok(info, `tuyến ${sys.id}/${line.itemId} thiếu jointRules`);
      const layerJoint = layerVachChia(line.layer, info.jointRules.layerStyle).toUpperCase();
      for (const item of pack.takeoff.items) {
        for (const key of item.layerMatchAny) {
          assert.ok(
            !hasToken(layerJoint, key.toUpperCase()),
            `Layer vạch chia ${layerJoint} khớp takeoff ${item.id} (${key}) — vạch chia sẽ bị bóc thành chiều dài tuyến`,
          );
        }
      }
    }
  }
});

test("FR5: hậu tố '-JOINT' (có gạch nối) LÀ cái bẫy — chứng minh test trên bắt được", () => {
  const pack = getCurrentRulePack();
  const line = pack.drawTools.systems[0]?.lines[0];
  assert.ok(line);
  const sai = layerVachChia(line.layer, { suffix: "-JOINT" }).toUpperCase();
  assert.ok(
    hasToken(sai, line.layer.toUpperCase()),
    "dấu '-' là ranh giới token nên layer vẫn khớp mục bóc — đúng lớp lỗi mà hậu tố 'JOINT' né",
  );
});
