// scripts/check-contrast.ts — Cổng CI canh tương phản WCAG AA của HỆ MÀU THEO THEME.
//
// VÌ SAO: `text-zinc-500` (và các mức chữ phụ khác) là màu chữ dùng ở hàng trăm chỗ. Khi
// giá trị token của một theme không đủ tương phản với mặt thẻ của chính theme đó thì lỗi
// nhân ra toàn app cùng lúc — đợt đo 2026-08-25 đếm ~95 nút DOM vi phạm chỉ riêng Dashboard
// ở theme tối, và cả 4 theme tối đều mắc. axe (e2e) chỉ bắt được phần tử ĐANG hiển thị lúc
// quét nên bỏ sót phần lớn; cổng này kiểm thẳng bảng token nên phủ hết, chạy trong 1 giây
// và không cần trình duyệt.
//
// KIỂM (ngưỡng WCAG AA cho chữ thường: 4,5:1) — CHẶN khi chữ đặt trên NỀN TRANG/MẶT THẺ:
//   1. Chữ zinc mức 300/400/500 trên `--background`, `zinc-950`, `zinc-900`.
//   2. Chữ accent mức 300/400 trên cùng bộ nền đó (chỉ các họ màu app thực sự dùng).
// `zinc-800` chỉ CẢNH BÁO, không chặn: ở các theme đó nó là nền của CONTROL (ô nhập, chip,
// nút phụ) và chữ trên control là zinc-100/200, không phải mức chữ phụ — chặn ở đây sẽ là
// lỗi giả. Vùng `.sheet-stable` ("giấy trắng" cho báo cáo in / lưới kiểu Excel) có bộ nền
// riêng (trắng + zinc-50) và dùng các mức chữ ĐẬM (500..900) nên kiểm theo bộ riêng.
// Nguồn số liệu: đọc THẲNG `app/globals.css` — không chép lại bảng token sang đây (bản
// `scripts/contrast-check.ts` cũ chép tay đã lệch khỏi globals.css sau vài đợt sửa màu).
// Giá trị mặc định Tailwind v4 (khi theme không ghi đè) nằm trong DEFAULTS bên dưới, lấy
// bằng cách render oklch của Tailwind ra sRGB trong trình duyệt.
//
// Chạy: npm run check:contrast
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const AA = 4.5;

// Mặc định Tailwind v4 (oklch → sRGB). Chỉ khai các mức cổng này dùng tới.
const DEFAULTS: Record<string, string> = {
  "zinc-300": "#d4d4d8",
  "zinc-400": "#9f9fa9",
  "zinc-500": "#71717b",
  "zinc-800": "#27272a",
  "zinc-900": "#18181b",
  "zinc-950": "#09090b",
  "amber-300": "#ffd230",
  "amber-400": "#ffb900",
  "blue-300": "#8ec5ff",
  "blue-400": "#51a2ff",
  "cyan-300": "#53eafd",
  "cyan-400": "#00d3f3",
  "emerald-300": "#5ee9b5",
  "emerald-400": "#00d492",
  "indigo-300": "#a3b3ff",
  "indigo-400": "#7c86ff",
  "orange-300": "#ffb86a",
  "orange-400": "#ff8904",
  "purple-300": "#dab2ff",
  "purple-400": "#c27aff",
  "red-300": "#ffa2a2",
  "red-400": "#ff6467",
  "rose-300": "#ffa1ad",
  "rose-400": "#ff637e",
  "sky-300": "#74d4ff",
  "sky-400": "#00bcff",
  "violet-300": "#c4b4ff",
  "violet-400": "#a684ff",
  "yellow-300": "#ffdf20",
  "yellow-400": "#fdc700",
};

const ACCENTS = [...new Set(Object.keys(DEFAULTS).map((k) => k.split("-")[0]))].filter(
  (c) => c !== "zinc",
);

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Đọc các khai báo `--color-*` / `--background` trong một khối CSS (vd `html.navy { … }`). */
function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector + " {");
  if (start === -1) throw new Error(`Không tìm thấy khối CSS "${selector}" trong globals.css`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--(color-[a-z]+-\d+|background):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1].replace("color-", "")] = m[2];
  }
  return out;
}

const css = readFileSync(join(root, "app/globals.css"), "utf8");

// `dark` không khai lại nền: --background của nó nằm ở :root (globals.css để dark là mặc định).
const rootVars = readBlock(css, ":root");
const THEMES = ["dark", "light", "kingblue", "darkblue", "navy"].map((name) => {
  const vars = readBlock(css, `html.${name}`);
  return { name, vars: { background: rootVars.background, ...vars } };
});
const SHEET_STABLE = readBlock(css, ".sheet-stable");

const val = (vars: Record<string, string>, key: string) => vars[key] ?? DEFAULTS[key];

type Fail = { theme: string; text: string; bg: string; hex: string; bgHex: string; r: number };
const fails: Fail[] = [];

console.log("=== Kiểm tương phản hệ màu theo theme (ngưỡng AA 4,5:1) ===\n");

const warns: Fail[] = [];

function check(
  name: string,
  texts: [string, string][],
  surfaces: [string, string][],
  blocking: boolean,
) {
  let worst = Infinity;
  for (const [tName, tHex] of texts) {
    for (const [bName, bHex] of surfaces) {
      const r = ratio(tHex, bHex);
      worst = Math.min(worst, r);
      if (r < AA) {
        (blocking ? fails : warns).push({
          theme: name,
          text: tName,
          bg: bName,
          hex: tHex,
          bgHex: bHex,
          r,
        });
      }
    }
  }
  return worst;
}

for (const { name, vars } of THEMES) {
  const surface = (key: string): [string, string] | null => {
    const hex = key === "--background" ? val(vars, "background") : val(vars, key);
    return hex ? [key, hex] : null;
  };
  const surfaces = ["--background", "zinc-950", "zinc-900"].map(surface).filter(Boolean) as [
    string,
    string,
  ][];
  const control = [surface("zinc-800")].filter(Boolean) as [string, string][];

  const texts: [string, string][] = [
    ...[300, 400, 500].map((l) => [`zinc-${l}`, val(vars, `zinc-${l}`)] as [string, string]),
    ...ACCENTS.flatMap(
      (c) => [300, 400].map((l) => [`${c}-${l}`, val(vars, `${c}-${l}`)]) as [string, string][],
    ),
  ].filter(([, hex]) => !!hex);

  const worst = check(name, texts, surfaces, true);
  check(name, texts, control, false);
  console.log(
    `  ${name.padEnd(14)} ${texts.length} mức chữ × ${surfaces.length} nền — thấp nhất ${worst.toFixed(2)}:1`,
  );
}

// `.sheet-stable`: nền trắng cố định, chữ dùng các mức ĐẬM.
{
  const texts = [500, 600, 700, 800, 900]
    .map((l) => [`zinc-${l}`, SHEET_STABLE[`zinc-${l}`]] as [string, string])
    .filter(([, hex]) => !!hex);
  const surfaces: [string, string][] = [
    ["trắng", "#ffffff"],
    ["zinc-50", SHEET_STABLE["zinc-50"] ?? "#fafafa"],
  ];
  const worst = check(".sheet-stable", texts, surfaces, true);
  console.log(
    `  ${".sheet-stable".padEnd(14)} ${texts.length} mức chữ × ${surfaces.length} nền — thấp nhất ${worst.toFixed(2)}:1`,
  );
}

if (warns.length) {
  console.log(`\n  [Cảnh báo, không chặn] ${warns.length} cặp chữ/nền control (zinc-800) < AA:`);
  for (const w of warns) {
    console.log(`    ${w.theme}: text-${w.text} trên ${w.bg} = ${w.r.toFixed(2)}:1`);
  }
}

if (fails.length) {
  console.error(`\n[LỖI] ${fails.length} cặp chữ/nền dưới ngưỡng AA ${AA}:1:\n`);
  for (const f of fails) {
    console.error(
      `  ${f.theme}: text-${f.text} (${f.hex}) trên ${f.bg} (${f.bgHex}) = ${f.r.toFixed(2)}:1`,
    );
  }
  console.error(
    "\n  Sửa bằng cách ghi đè token trong app/globals.css cho theme đó (xem ghi chú html.dark),\n" +
      "  KHÔNG đổi tay từng class ở trang.\n",
  );
  process.exit(1);
}

console.log("\n[OK] Mọi mức chữ đều đạt AA trên mọi nền của mọi theme.\n");
