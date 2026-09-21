// scripts/check-hex-hardcode.ts — Cổng CI chặn hardcode mã màu hex trong component UI.
//
// VÌ SAO: XBoss dark-first, mọi màu đảo qua bảng token CSS trong app/globals.css (5 theme).
// Hex viết thẳng trong component KHÔNG đảo theo theme — ở theme sáng, nét vẽ/nhãn màu tối
// gần như biến mất trên nền trắng. `check:contrast` không bắt được vì nó đọc bảng token,
// không đọc màu nằm trong thuộc tính SVG hay lời gọi canvas (audit 2026-09-05: 44 chỗ ở
// 3 trang engineering lọt lưới đúng theo đường này).
//
// THAY BẰNG GÌ:
//  - SVG / thư viện biểu đồ nhận chuỗi CSS  → `var(--color-…)` (mẫu: app/components/SCurveChart.tsx)
//  - canvas 2D (ctx.fillStyle/strokeStyle)  → `mauToken("--color-…")` (app/lib/mauTheme.ts)
//
// KHÔNG áp cho:
//  - app/globals.css (chính là nơi ĐỊNH NGHĨA bảng token)
//  - app/api/** (PDF của @react-pdf/renderer không có CSS variable — màu phải là hex thật)
//  - khối `@media print` / trang in (in ra giấy luôn nền trắng, không theo theme)
//  - <meta name="theme-color"> (trình duyệt yêu cầu giá trị màu thật)
//
// Chạy: npx tsx scripts/check-hex-hardcode.ts
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Đường dẫn (tiền tố, so từ gốc repo) được miễn — kèm lý do để người sau không gỡ bừa. */
const MIEN_TRU: { tienTo: string; lyDo: string }[] = [
  { tienTo: "app/api/", lyDo: "PDF @react-pdf/renderer không đọc được CSS variable" },
  { tienTo: "app/globals.css", lyDo: "nơi định nghĩa bảng token" },
];

/** Tên file/thư mục có 'print' trong đường dẫn: trang in luôn nền trắng, không theo theme. */
const laTrangIn = (p: string) => /(^|\/)print(\/|\.|$)/.test(p) || p.includes("/print/");

// Chỉ soi hex nằm ở VỊ TRÍ MÀU thật: thuộc tính SVG (fill/stroke), thuộc tính style/canvas
// (color/background/fillStyle/strokeStyle), hoặc giá trị tuỳ ý của Tailwind `bg-[#…]`.
// Hex lọt vào bình luận ("PR #390", "Block #142") hay chuỗi khác không phải màu → bỏ qua.
const HEX = "#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b";
const VI_TRI_MAU = new RegExp(
  `(?:fill|stroke|color|background|backgroundColor|fillStyle|strokeStyle|borderColor|` +
    `stopColor|shadowColor)\\s*[:=]\\s*["'\`]?${HEX}` +
    `|-\\[${HEX}\\]` +
    `|(?:^|[;{])\\s*(?:background|color|border|fill|stroke)[a-z-]*\\s*:\\s*${HEX}`,
  "i",
);

/** Dòng chỉ là bình luận (//, /*, *, {/*) — hex trong đó không phải màu được vẽ. */
const laBinhLuan = (l: string) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l.trim());

function liet(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      liet(p, out);
    } else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const viPham: { file: string; line: number; text: string }[] = [];

for (const f of liet("app")) {
  if (MIEN_TRU.some((m) => f.startsWith(m.tienTo)) || laTrangIn(f)) continue;
  const lines = readFileSync(join(root, f), "utf8").split("\n");
  // Khối CSS in viết trong styled-jsx: trang in luôn nền trắng nên hex ở đây là đúng.
  // Đếm ĐỘ SÂU ngoặc kể từ dòng `@media print` — khối con (.no-print { … }) đóng ngoặc của
  // riêng nó, không được nhầm là hết khối in.
  let sauKhiIn = 0;
  lines.forEach((line, i) => {
    if (sauKhiIn === 0 && /@media\s+print/.test(line)) {
      sauKhiIn = 1;
      return;
    }
    if (sauKhiIn > 0) {
      sauKhiIn += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (sauKhiIn <= 0) sauKhiIn = 0;
      return;
    }
    if (laBinhLuan(line)) return;
    if (line.includes("theme-color")) return; // trình duyệt cần màu thật
    if (/print:/.test(line)) return; // tiện ích Tailwind chỉ áp khi in
    if (line.includes("check:hex-hardcode-allow")) return;
    if (VI_TRI_MAU.test(line))
      viPham.push({ file: f, line: i + 1, text: line.trim().slice(0, 120) });
  });
}

console.log("=== Kiểm hardcode mã màu hex trong component ===");
if (viPham.length) {
  console.error(`\n[LỖI] ${viPham.length} chỗ hardcode hex (không đảo được theo theme):\n`);
  for (const v of viPham) console.error(`  ${v.file}:${v.line}\n    ${v.text}\n`);
  console.error(
    'Thay bằng `var(--color-…)` (SVG/biểu đồ) hoặc `mauToken("--color-…")` (canvas).\n' +
      "Trường hợp buộc phải dùng hex thật: thêm comment `check:hex-hardcode-allow` kèm lý do.\n",
  );
  process.exit(1);
}
console.log(`[OK] Không có hardcode hex ngoài vùng miễn trừ (${MIEN_TRU.length} vùng).\n`);
