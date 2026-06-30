// Kiểm tra tương phản WCAG cho hệ màu zinc của XBoss qua cả 6 theme (dark/light/kingblue/darkblue/navy)
// + nút accent chữ trắng. Dùng để biến "ứng viên grep" (text-zinc-500/600) thành "khả năng lỗi cao"
// TRƯỚC khi chạy axe (ground-truth cuối). Xem docs/a11y/contrast-audit.md.
//
// Chạy: npx tsx scripts/contrast-check.ts
//
// Lưu ý: hex ở đây là xấp xỉ thang Tailwind (v3-style). Tailwind v4 render `oklch` có thể lệch nhẹ
// ở các ca sát ngưỡng → axe trên bản production vẫn là trọng tài cuối.

type Scale = Record<number, string>;

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const channel = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(channel(0)) + 0.7152 * lin(channel(2)) + 0.0722 * lin(channel(4));
}

function ratio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const AA = 4.5;
const mark = (r: number) => (r >= AA ? "OK " : "FAIL");

// Thang zinc mặc định Tailwind (theme `dark` — globals.css không ghi đè zinc ở dark).
const ZINC_DEFAULT: Scale = {
  50: "#fafafa",
  100: "#f4f4f5",
  200: "#e4e4e7",
  300: "#d4d4d8",
  400: "#a1a1aa",
  500: "#71717a",
  600: "#52525b",
  700: "#3f3f46",
  800: "#27272a",
  900: "#18181b",
  950: "#09090b",
};

type Theme = { name: string; bg: string; zinc: Scale };

const THEMES: Theme[] = [
  { name: "dark", bg: "#0a0a0a", zinc: ZINC_DEFAULT },
  {
    name: "light",
    bg: "#ffffff",
    zinc: {
      50: "#18181b",
      100: "#27272a",
      200: "#3f3f46",
      300: "#52525b",
      400: "#52525b",
      500: "#71717a",
      600: "#a1a1aa",
      700: "#d4d4d8",
      800: "#e4e4e7",
      900: "#f4f4f5",
      950: "#fafafa",
    },
  },
  {
    name: "kingblue",
    bg: "#0a1f4d",
    zinc: {
      50: "#f4f8fe",
      100: "#e8f0fd",
      200: "#d4e2fa",
      300: "#b3c9f4",
      400: "#8aabec",
      500: "#5d87de",
      600: "#3a6bd0",
      700: "#2451b5",
      800: "#1a3f94",
      900: "#123075",
      950: "#0d2459",
    },
  },
  {
    name: "darkblue",
    bg: "#0c1a2e",
    zinc: {
      50: "#f5fafd",
      100: "#eaf3fb",
      200: "#d7e8f5",
      300: "#b6d3e8",
      400: "#8aacc8",
      500: "#5a7ca0",
      600: "#3b6188",
      700: "#2a4d73",
      800: "#1e3a5f",
      900: "#152b48",
      950: "#0f2138",
    },
  },
  {
    name: "navy",
    bg: "#060b18",
    zinc: {
      50: "#f8fafc",
      100: "#f1f5f9",
      200: "#e2e8f0",
      300: "#cbd5e1",
      400: "#94a3b8",
      500: "#64748b",
      600: "#475569",
      700: "#2c3e5e",
      800: "#1c2a44",
      900: "#111c30",
      950: "#0b1220",
    },
  },
];

const TEXT_LEVELS = [600, 500, 400, 300];
const BG_LEVELS: Array<number | "bg"> = ["bg", 950, 900, 800, 700];

console.log("=== text-zinc-N trên nền (ratio | OK/FAIL @ AA 4.5) ===\n");
for (const t of THEMES) {
  console.log(`### theme: ${t.name}`);
  console.log(
    ["text\\bg"]
      .concat(BG_LEVELS.map((b) => (b === "bg" ? "--bg" : `z-${b}`)))
      .map((s) => s.padEnd(10))
      .join(""),
  );
  for (const tl of TEXT_LEVELS) {
    const row = [`z-${tl}`.padEnd(10)];
    for (const bl of BG_LEVELS) {
      const bgHex = bl === "bg" ? t.bg : t.zinc[bl];
      const r = ratio(t.zinc[tl], bgHex);
      row.push(`${r.toFixed(2)} ${mark(r)}`.padEnd(10));
    }
    console.log(row.join(""));
  }
  console.log("");
}

// Nút accent chữ trắng — mức -500/-600/-700 không bị theme nào ghi đè → giống nhau mọi theme.
const ACCENTS: Record<string, Scale> = {
  emerald: { 500: "#10b981", 600: "#059669", 700: "#047857" },
  sky: { 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1" },
  amber: { 500: "#f59e0b", 600: "#d97706", 700: "#b45309" },
  green: { 500: "#22c55e", 600: "#16a34a", 700: "#15803d" },
  teal: { 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e" },
  cyan: { 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490" },
  blue: { 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
  violet: { 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9" },
  rose: { 500: "#f43f5e", 600: "#e11d48", 700: "#be123c" },
  red: { 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
  indigo: { 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca" },
};

console.log("=== Nút accent CHỮ TRẮNG (#fff) — giống nhau mọi theme ===");
console.log(
  ["accent".padEnd(10), "-500".padEnd(12), "-600".padEnd(12), "-700".padEnd(12)].join(""),
);
for (const [name, scale] of Object.entries(ACCENTS)) {
  const row = [name.padEnd(10)];
  for (const lvl of [500, 600, 700]) {
    const r = ratio("#ffffff", scale[lvl]);
    row.push(`${r.toFixed(2)} ${mark(r)}`.padEnd(12));
  }
  console.log(row.join(""));
}
