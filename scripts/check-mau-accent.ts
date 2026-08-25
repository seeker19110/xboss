// scripts/check-mau-accent.ts — Cổng CI chặn chữ trắng trên nền accent sáng.
//
// VÌ SAO: chữ trắng trên nền `bg-{emerald|sky|amber|green|teal|cyan}-500/600` không đạt
// tương phản, dễ đọc trên nền sáng (lỗi a11y). Lỗi này lặp lần ≥3 (54b3e03 → ee8fce1 → 57 file ở GĐ1).
//
// KIỂM:
//  1. Cấm: chữ trắng (`text-white` HOẶC `text-on-accent` — cùng là #ffffff, xem globals.css)
//     cùng nền accent sáng ĐẶC `bg-{emerald|sky|amber|green|teal|cyan|lime|yellow}-400|500|600`,
//     ở BẤT KỲ trạng thái nào: nền gốc, `hover:`, `focus:` hay `active:`.
//     Vì sao xét cả trạng thái hover: mẫu nút chính cũ `bg-emerald-700 hover:bg-emerald-600
//     text-on-accent` đạt 5,36:1 lúc nghỉ nhưng tụt còn 3,65:1 ngay khi rê chuột — axe chỉ
//     bắt được nếu đúng lúc quét con trỏ đang nằm trên nút, nên gần như luôn lọt lưới.
//     Quy ước thay thế: nút chính đậm dần khi rê chuột (`bg-emerald-700 hover:bg-emerald-800`).
//     Chỉ xét nền ĐẶC (không có `/opacity`): nền mờ `bg-{c}-500/10` là lớp phủ nhạt trên mặt
//     thẻ tối, không phải nền sáng thật.
//  2. Cấm: hover no-op — bg-{c}-N đi cùng hover:bg-{c}-N (cùng số N).
//     ⚠️ Dương tính giả: bg-emerald-600/20 vs hover:bg-emerald-600/30 khác opacity → OK.
//     ⚠️ Bỏ qua: disabled:hover: hoặc focus:hover: (prefix complex trước hover).
//  3. KHÔNG cấm nhóm PASS (blue|violet|rose|red|indigo) — có tương phản ≥4,7:1 (xem docs/audit.md §13.3).
//
// Chạy: npx tsx scripts/check-mau-accent.ts
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Violation {
  file: string;
  line: number;
  issue: string;
  className: string;
}

const violations: Violation[] = [];

/** Quét mọi .tsx/.ts file. */
function walk(dir: string): string[] {
  try {
    return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    );
  } catch {
    return [];
  }
}

const files = walk("app");

for (const f of files) {
  const filePath = join(root, f);
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Quét MỌI chuỗi ký tự trên dòng (nháy đơn/kép/backtick), không chỉ `className="..."`:
      // bảng biến thể của bộ component nền (`app/components/ui/Button.tsx` — VARIANT/SIZE)
      // là các chuỗi rời nằm ngoài JSX, trước đây lọt lưới nên nút chính dùng chung vẫn
      // giữ nguyên mẫu hover sáng dần. Chuỗi không chứa class `bg-`/`text-` thì tự bị loại
      // ở các bước kiểm bên dưới nên không sinh dương tính giả.
      const classNameMatches = line.matchAll(/["'`]([^"'`\n]*?)["'`]/g);

      for (const match of classNameMatches) {
        const classStr = match[1];
        const lineNum = i + 1;

        // Split class string thành từng class, bỏ qua rỗng.
        const classList = classStr.split(/\s+/).filter(Boolean);

        // Kiểm điều 1: chữ trắng + nền accent sáng đặc (kể cả ở trạng thái hover/focus/active)
        const hasTextWhite = classList.some((c) => c === "text-white" || c === "text-on-accent");
        if (hasTextWhite) {
          const badAccent = classList.find((c) =>
            /^(?:hover:|focus:|active:)?bg-(emerald|sky|amber|green|teal|cyan|lime|yellow)-(400|500|600)$/.test(
              c,
            ),
          );

          if (badAccent) {
            violations.push({
              file: f,
              line: lineNum,
              issue: `chữ trắng cùng nền accent sáng \`${badAccent}\` (tương phản < 4,5:1 — dùng nền -700/-800, hoặc đổi chữ sang text-on-accent-dark)`,
              className: classStr,
            });
          }
        }

        // Kiểm điều 2: hover no-op — bg-{c}-N + hover:bg-{c}-N (cùng N và opacity).
        // Chỉ kiểm "hover:" không có prefix trước (không xét disabled:hover:, focus:hover:, v.v).
        const accentMap = new Map<string, Set<string>>();
        for (const cls of classList) {
          // Chỉ xem xét:
          // 1. "bg-..." (base, không hover)
          // 2. "hover:bg-..." (hover không prefix)
          // Bỏ qua: "disabled:hover:...", "focus:hover:...", v.v (có `:` trước `hover:`).
          let isHover = false;
          let bgClass = cls;

          if (cls.startsWith("hover:")) {
            isHover = true;
            bgClass = cls.slice(6); // Bỏ "hover:" đi.
          } else if (cls.includes(":hover:")) {
            // Bỏ qua vì có prefix phức tạp.
            continue;
          }

          // Parse bg-{color}-{level}[/{opacity}].
          const m = bgClass.match(/^bg-([a-z]+)-(\d+)(?:\/([\d]+))?$/);
          if (m) {
            const [, color, level, opacity] = m;
            const opacityStr = opacity || "100";
            const key = `${color}-${level}-${opacityStr}`;
            const variantType = isHover ? "hover" : "base";

            if (!accentMap.has(key)) accentMap.set(key, new Set());
            accentMap.get(key)!.add(variantType);
          }
        }

        // Kiểm: có "base" và "hover" cùng key → hover no-op.
        for (const [key, variants] of accentMap) {
          if (variants.has("base") && variants.has("hover")) {
            // Extract opacity từ key.
            const parts = key.split("-");
            const opacity = parts[parts.length - 1];
            const colorLevel = parts.slice(0, -1).join("-");

            violations.push({
              file: f,
              line: lineNum,
              issue: `hover no-op: bg-${colorLevel} và hover:bg-${colorLevel} (cùng opacity /${opacity})`,
              className: classStr,
            });
          }
        }
      }
    }
  } catch (e) {
    // Bỏ qua file không đọc được.
  }
}

console.log("=== Kiểm màu accent (chữ trắng trên nền sáng) ===");
console.log(`File quét: ${files.length}`);

if (violations.length) {
  console.error(`\n[LỖI] Tìm thấy ${violations.length} vi phạm:\n`);
  violations.forEach((v) => {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.issue}`);
    console.error(`    className: ${v.className}\n`);
  });
  process.exit(1);
}

console.log("\n[OK] Không phát hiện vi phạm màu accent.\n");
