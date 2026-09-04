// scripts/check-dead-routes.ts — Cổng CI: dò ROUTE API không có lời gọi nào trong repo.
//
// VÌ SAO: audit 2026-08-25 (docs/audit-2026-08-25-tinh-nang-theo-vong-doi.md §3.5) đếm được
// 25 trong 505 route API mà không một dòng mã nào trong repo gọi tới. Phần lớn KHÔNG phải
// rác — cron gọi từ ngoài, API mở /api/v1 cho hệ ngoài — nên script này KHÔNG đòi xoá; nó
// chỉ chặn tập đó **phình thêm** trong im lặng.
//
// `check:dead-code` không thay được: nó dựng đồ thị import, mà route handler luôn là
// entrypoint của Next (không ai import) nên với nó route nào cũng "sống".
//
// Chạy: npx tsx scripts/check-dead-routes.ts
//  - THOÁT 1 (đỏ) nếu có route không ai gọi mà KHÔNG nằm trong scripts/dead-routes-allowlist.json.
//  - Cảnh báo (không đỏ) khi allowlist còn ghi route đã có người gọi hoặc đã bị xoá.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Nơi một lời gọi route có thể nằm: mã app/lib, script, test, e2e, worker, service worker
// và proxy. KHÔNG tính tài liệu (.md) — nhắc trong tài liệu không phải là lời gọi.
const CALLER_DIRS = ["app", "lib", "scripts", "e2e", "tests", "mepf-worker", "public", "proxy.ts"];
/** Chính file allowlist nằm trong `scripts/` nên nó khớp mọi route được khai trong đó —
 *  không tính là người gọi, nếu không mỗi mục allowlist tự làm route của nó "sống". */
const NOT_A_CALLER = "scripts/dead-routes-allowlist.json";

const allowlist: { route: string; ly_do: string }[] = JSON.parse(
  readFileSync(join(root, "scripts/dead-routes-allowlist.json"), "utf8"),
);
const allowed = new Set(allowlist.map((e) => e.route));

const routeFiles = execFileSync("find", ["app/api", "-name", "route.ts"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);

/** Đường dẫn route → regex khớp lời gọi. Đoạn động `[id]` khớp mọi thứ trừ dấu đóng chuỗi,
 *  để bắt cả `` `/api/tasks/${id}/photos` ``. Bỏ `/api` đầu để khớp cả lời gọi tương đối
 *  của plugin (`api/devices/pair/claim`). */
function callPattern(routePath: string): string {
  return routePath.replace(/^\/api/, "api").replace(/\[[^\]]*\]/g, "[^\"`' ]*");
}

const dead: string[] = [];
const alive = new Set<string>();

for (const file of routeFiles) {
  const routePath = file.replace(/^app/, "").replace(/\/route\.ts$/, "");
  let hits = "";
  try {
    hits = execFileSync("grep", ["-rlE", callPattern(routePath), ...CALLER_DIRS], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    hits = ""; // grep thoát 1 khi không khớp gì
  }
  const callers = hits
    .trim()
    .split("\n")
    .filter((f) => f && f !== file && f !== NOT_A_CALLER);
  if (callers.length === 0) dead.push(routePath);
  else alive.add(routePath);
}

const unexpected = dead.filter((r) => !allowed.has(r));
const stale = allowlist.filter((e) => alive.has(e.route) || !dead.includes(e.route));

console.log("=== Kiểm route API không ai gọi ===");
console.log(
  `Route quét: ${routeFiles.length} | có người gọi: ${alive.size} | không ai gọi: ${dead.length}` +
    ` (đã khai trong allowlist: ${dead.length - unexpected.length})`,
);

if (stale.length) {
  console.warn(
    `\n[CẢNH BÁO] allowlist còn ghi route đã có người gọi hoặc đã xoá — dọn khỏi ` +
      `scripts/dead-routes-allowlist.json:\n  - ${stale.map((e) => e.route).join("\n  - ")}`,
  );
}

if (unexpected.length) {
  console.error(
    `\n[LỖI] Route API mới mà không dòng mã nào trong repo gọi tới:\n  - ${unexpected.join("\n  - ")}\n\n` +
      "Gắn nó vào UI/script thật, hoặc xoá route, hoặc (nếu người ngoài repo gọi — cron, API mở, " +
      "plugin) thêm vào scripts/dead-routes-allowlist.json KÈM LÝ DO.",
  );
  process.exit(1);
}

console.log("\nOK — không có route không ai gọi ngoài allowlist.");
