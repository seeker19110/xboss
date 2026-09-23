/**
 * UI/UX CRAFTSMAN — lightweight repository guard.
 *
 * Đây không phải design linter toàn năng. Nó xác nhận các nguồn sự thật của UI tồn tại và
 * chặn một số pattern phá kiến trúc theme; các kiểm tra màu chi tiết được package script
 * check:ui-ux nối sang check:mau-accent, check:contrast và check:hex-hardcode.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = [
  "design-system/xboss/MASTER.md",
  ".agents/skills/ui-ux-craftsman/SKILL.md",
  ".agents/rules/ui-ux-guidelines.md",
];

const missing = REQUIRED.filter((path) => !existsSync(path));
if (missing.length) {
  console.error("UI/UX source of truth bị thiếu:");
  for (const path of missing) console.error(` - ${path}`);
  process.exit(1);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (/\.(tsx|ts)$/.test(name)) out.push(path);
  }
  return out;
}

const uiFiles = walk("app").filter((path) => !path.includes("/api/") && !path.includes("\\api\\"));
const violations: string[] = [];

for (const path of uiFiles) {
  const source = readFileSync(path, "utf8");

  // XBoss dùng token inversion, nên dark: tạo hai cơ chế theme cạnh tranh nhau.
  if (/\bdark:/.test(source)) {
    violations.push(`${path}: dùng dark: — XBoss dùng dark-first token inversion`);
  }

  // transition-all dễ animate property layout ngoài ý muốn; yêu cầu chọn property cụ thể.
  if (/\btransition-all\b/.test(source)) {
    violations.push(`${path}: transition-all — hãy chọn transition property cụ thể`);
  }
}

if (violations.length) {
  console.error("UI/UX guard phát hiện pattern cần sửa:");
  for (const item of violations) console.error(` - ${item}`);
  process.exit(1);
}

console.log(
  `UI/UX guard OK: source-of-truth đầy đủ, đã quét ${uiFiles.length} file UI; tiếp tục các gate màu/contrast/hex.`,
);
