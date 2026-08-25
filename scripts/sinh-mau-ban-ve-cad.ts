// M99 PR7 — sinh BỘ BẢN VẼ MẪU cam kết trong repo (§15 "bộ bản vẽ mẫu").
//
// Hai tệp cùng một hình học, khác đơn vị vẽ:
//   mau-01-mep-mm.dxf   $INSUNITS=4 (mm)  — bản chuẩn
//   mau-02-mep-met.dxf  $INSUNITS=6 (m)   — y hệt, toạ độ chia 1000 (AC13: bóc tách phải ra
//                                            cùng khối lượng với bản mm sau khi quy đổi)
// Nội dung cố tình mang đủ dị tật để kiểm tích hợp bám vào:
//   · layer sai chuẩn cho AC1 (ánh xạ về M-DUCT-SUPP / M-CHW-PIPE / G-ANNO-TEXT…)
//   · TEXT mã TCVN3 cho AC2
//   · thực thể Z≠0 cho AC3 (ép phẳng giữ nguyên hình chiếu XY)
//   · 3 đoạn ống trên layer khớp item length cho AC10
//   · 1 polyline KÍN (đo diện tích) + 1 polyline HỞ gần kín cho AC9
//
//   npm run cad:mau-ban-ve            # ghi lại 2 tệp
//   npm run cad:mau-ban-ve -- --kiem  # chỉ kiểm nội dung tệp còn khớp script (dùng trong CI)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateDxf, parseDxf } from "@/lib/ky-thuat/cad/dxf-parser";

const THU_MUC = join(process.cwd(), "plugin-autocad", "mau-ban-ve");

type Diem = [number, number, number];

const LAYERS: Array<{ ten: string; mau: number }> = [
  { ten: "01_M_ONG_GIO_CAP_CHINH", mau: 4 },
  { ten: "03_P_ONG_NUOC_LANH_CHW", mau: 5 },
  { ten: "08_G_GHI_CHU_DIM_TEXT", mau: 7 },
  { ten: "ZZZ_KHONG_KHOP_GI", mau: 8 },
];

// Toạ độ viết theo mm; bản mét chia cho 1000 (giữ nguyên hình học).
const ONG_CHW: Array<[Diem, Diem]> = [
  [
    [0, 0, 0],
    [6000, 0, 0],
  ],
  [
    [6000, 0, 0],
    [6000, 4500, 0],
  ],
  // Đoạn thứ 3 nằm ở cao độ Z≠0 — AC3 ép phẳng phải giữ nguyên hình chiếu XY.
  [
    [6000, 4500, 2800],
    [12000, 4500, 2800],
  ],
];

const DUCT_KIN: Diem[] = [
  [0, 8000, 0],
  [4000, 8000, 0],
  [4000, 11000, 0],
  [0, 11000, 0],
];

// Polyline HỞ "gần kín": hai đầu cách nhau 3mm — dưới dung sai nearGapToleranceMm của rule pack.
const DUCT_HO: Diem[] = [
  [8000, 8000, 0],
  [12000, 8000, 0],
  [12000, 11000, 0],
  [8000, 11000, 0],
  [8000, 8003, 0],
];

const GHI_CHU = "TÇng 5 - Phßng m¸y l¹nh"; // TCVN3 → "Tầng 5 - Phòng máy lạnh" (AC2)

function so(v: number, chia: number): string {
  const x = v / chia;
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

function cap(ma: number | string, giaTri: string | number): string {
  return `${ma}\n${giaTri}\n`;
}

function duongThang(layer: string, a: Diem, b: Diem, chia: number): string {
  return (
    cap(0, "LINE") +
    cap(8, layer) +
    cap(10, so(a[0], chia)) +
    cap(20, so(a[1], chia)) +
    cap(30, so(a[2], chia)) +
    cap(11, so(b[0], chia)) +
    cap(21, so(b[1], chia)) +
    cap(31, so(b[2], chia))
  );
}

function polyline(layer: string, diem: Diem[], kin: boolean, chia: number): string {
  let s = cap(0, "LWPOLYLINE") + cap(8, layer) + cap(90, diem.length) + cap(70, kin ? 1 : 0);
  for (const p of diem) s += cap(10, so(p[0], chia)) + cap(20, so(p[1], chia));
  return s;
}

function chu(layer: string, p: Diem, cao: number, noiDung: string, chia: number): string {
  return (
    cap(0, "TEXT") +
    cap(8, layer) +
    cap(10, so(p[0], chia)) +
    cap(20, so(p[1], chia)) +
    cap(30, so(p[2], chia)) +
    cap(40, so(cao, chia)) +
    cap(1, noiDung)
  );
}

function dungDxf(insUnits: number): string {
  const chia = insUnits === 6 ? 1000 : 1;

  let s = "";
  s += cap(0, "SECTION") + cap(2, "HEADER");
  s += cap(9, "$ACADVER") + cap(1, "AC1032");
  s += cap(9, "$INSUNITS") + cap(70, insUnits);
  s += cap(9, "$MEASUREMENT") + cap(70, 1);
  s += cap(0, "ENDSEC");

  s +=
    cap(0, "SECTION") +
    cap(2, "TABLES") +
    cap(0, "TABLE") +
    cap(2, "LAYER") +
    cap(70, LAYERS.length);
  for (const l of LAYERS) {
    s += cap(0, "LAYER") + cap(2, l.ten) + cap(70, 0) + cap(62, l.mau) + cap(6, "CONTINUOUS");
  }
  s += cap(0, "ENDTAB") + cap(0, "ENDSEC");

  // BLOCKS rỗng + OBJECTS tối thiểu: AutoCAD (và validateDxf) đòi đủ section cho tệp AC1032.
  s += cap(0, "SECTION") + cap(2, "BLOCKS") + cap(0, "ENDSEC");

  s += cap(0, "SECTION") + cap(2, "ENTITIES");
  for (const [a, b] of ONG_CHW) s += duongThang("03_P_ONG_NUOC_LANH_CHW", a, b, chia);
  s += polyline("01_M_ONG_GIO_CAP_CHINH", DUCT_KIN, true, chia);
  s += polyline("01_M_ONG_GIO_CAP_CHINH", DUCT_HO, false, chia);
  s += chu("08_G_GHI_CHU_DIM_TEXT", [0, 12000, 0], 250, GHI_CHU, chia);
  s += chu("ZZZ_KHONG_KHOP_GI", [0, 12500, 0], 250, "LAYER KHONG THUOC HE NAO", chia);
  s += cap(0, "ENDSEC");

  s += cap(0, "SECTION") + cap(2, "OBJECTS") + cap(0, "ENDSEC");

  s += cap(0, "EOF");
  return s;
}

const TEP: Array<{ ten: string; insUnits: number }> = [
  { ten: "mau-01-mep-mm.dxf", insUnits: 4 },
  { ten: "mau-02-mep-met.dxf", insUnits: 6 },
];

function main() {
  const kiem = process.argv.includes("--kiem");
  for (const { ten, insUnits } of TEP) {
    const noiDung = dungDxf(insUnits);

    const hopLe = validateDxf(noiDung);
    if (!hopLe.valid) {
      console.error(`[LỖI] ${ten} không hợp lệ: ${hopLe.errors.join(" · ")}`);
      process.exit(1);
    }
    const parsed = parseDxf(noiDung, ten);
    if (parsed.entities.length === 0 || parsed.layers.length !== LAYERS.length) {
      console.error(
        `[LỖI] ${ten} parse ra ${parsed.entities.length} thực thể / ${parsed.layers.length} layer`,
      );
      process.exit(1);
    }

    const duongDan = join(THU_MUC, ten);
    if (kiem) {
      if (readFileSync(duongDan, "utf8") !== noiDung) {
        console.error(`[LỖI] ${ten} lệch script — chạy \`npm run cad:mau-ban-ve\` rồi commit.`);
        process.exit(1);
      }
      console.log(`[OK] ${ten} khớp script (${parsed.entities.length} thực thể).`);
      continue;
    }
    writeFileSync(duongDan, noiDung, "utf8");
    console.log(
      `[OK] Đã ghi ${ten} — ${parsed.entities.length} thực thể, ${parsed.layers.length} layer.`,
    );
  }
}

main();
