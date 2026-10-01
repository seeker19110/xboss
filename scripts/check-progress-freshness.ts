// scripts/check-progress-freshness.ts — Cổng CI: chặn PROGRESS.md lỗi thời so với code vừa merge.
//
// VÌ SAO CẦN: CLAUDE.md bắt buộc "Mọi commit thêm tính năng/fix có ý nghĩa đã ghi vào PROGRESS.md
// trước khi push" nhưng không có gì ép buộc — commit merge vào main có thể đổi app/lib/migrations
// đáng kể mà quên cập nhật PROGRESS.md, phiên sau đọc phải trạng thái cũ.
//
// CHỈ kiểm được phần CƠ HỌC (commit vừa vào main có đổi thư mục nghiệp vụ mà không đổi
// PROGRESS.md không) — không kiểm được nội dung tường thuật có đúng/đủ không. Giới hạn cố ý.
//
// Chạy: npx tsx scripts/check-progress-freshness.ts
// Chỉ có ý nghĩa khi chạy trên push vào main (job CI dùng fetch-depth: 2 để có commit cha).
//
// Chế độ `--base <ref>` (ADR-0012): so CẢ NHÁNH với <ref> (`<ref>...HEAD`) thay vì chỉ commit
// vừa vào main — hook `.claude/hooks/pre-push-gate.sh` gọi trước mỗi `git push` để bắt lỗi
// ngay trên nhánh, khỏi đợi tới lúc đã merge mới đỏ main. Cùng một luật với CI, không chép lại.
import { execFileSync } from "node:child_process";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const baseIdx = process.argv.indexOf("--base");
const base = baseIdx >= 0 ? process.argv[baseIdx + 1] : undefined;

function refExists(ref: string): boolean {
  try {
    git("rev-parse", "--verify", "--quiet", ref);
    return true;
  } catch {
    return false;
  }
}

console.log(
  base
    ? `=== Kiểm PROGRESS.md có lỗi thời trên nhánh so với ${base} ===`
    : "=== Kiểm PROGRESS.md có lỗi thời so với commit vừa vào main ===",
);

if (base ? !refExists(base) : !refExists("HEAD~1")) {
  console.log(
    base
      ? `OK — không có ref ${base} (chưa fetch?), bỏ qua kiểm tra.`
      : "OK — không có commit cha (checkout nông hoặc commit đầu tiên), bỏ qua kiểm tra.",
  );
  process.exit(0);
}

const changed = (
  base ? git("diff", "--name-only", `${base}...HEAD`) : git("diff", "--name-only", "HEAD~1", "HEAD")
)
  .split("\n")
  .filter(Boolean);

if (changed.length === 0) {
  console.log(
    base ? "OK — nhánh chưa đổi file nào so với base." : "OK — commit này không đổi file nào.",
  );
  process.exit(0);
}

const touchedProgress = changed.includes("PROGRESS.md");

// Thư mục coi là "nghiệp vụ có ý nghĩa" — đổi ở đây mà không cập nhật PROGRESS.md là lỗi thời.
// Cố ý loại trừ test/docs/scripts thuần kiểm tra để không báo oan mọi commit nhỏ.
const SIGNIFICANT_PREFIXES = ["app/", "lib/", "migrations/"];
const significant = changed.filter((f) => SIGNIFICANT_PREFIXES.some((p) => f.startsWith(p)));

console.log(
  base ? `Nhánh: ${base}...HEAD` : `Commit: ${git("log", "-1", "--format=%h %s", "HEAD")}`,
);
console.log(`Số file đổi: ${changed.length} (nghiệp vụ: ${significant.length})`);

if (significant.length === 0) {
  console.log(
    "OK — không đổi thư mục nghiệp vụ (app/lib/migrations), không bắt buộc cập nhật PROGRESS.md.",
  );
  process.exit(0);
}

if (touchedProgress) {
  console.log("OK — PROGRESS.md đã được cập nhật cùng commit.");
  process.exit(0);
}

console.error(
  `\n[LỖI] ${base ? "Nhánh" : "Commit"} này đổi ${significant.length} file nghiệp vụ (vd: ${significant
    .slice(0, 5)
    .join(", ")}${significant.length > 5 ? "…" : ""}) nhưng KHÔNG cập nhật PROGRESS.md.\n` +
    "CLAUDE.md yêu cầu mọi commit thêm tính năng/fix có ý nghĩa phải ghi vào PROGRESS.md TRƯỚC khi push — xem TRAPS.md mục 1 để biết hệ quả khi tài liệu lệch code.",
);
process.exit(1);
