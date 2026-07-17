// scripts/check-sw-exclude.ts (M52 PR3) — Cổng CI: đối chiếu `swExclude` khai báo trong
// module registry (lib/modules.ts) với danh sách path loại trừ cache thật trong
// public/sw.js (file tĩnh, KHÔNG sinh tự động — script này chỉ KIỂM, không sửa).
//
// VÌ SAO: quên loại trừ 1 route động khỏi cache SW (hoặc ngược lại, khai báo swExclude
// mà sw.js chưa cập nhật) là lớp lỗi đã lặp lại. Gắn kiểm này vào CI để lệch là đỏ.
//
// Chạy: npx tsx scripts/check-sw-exclude.ts
//  - THOÁT 1 (đỏ) nếu 1 pattern swExclude được module khai báo NHƯNG không có trong sw.js
//    (vd: có người gỡ pattern khỏi sw.js mà quên bỏ khỏi registry → cache sai).
//  - Chỉ CẢNH BÁO (không đỏ) nếu sw.js loại trừ 1 path mà chưa module nào "nhận" trong
//    registry — vì registry đang phủ dần (M52 PR3), chưa liệt kê hết module.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MODULES } from "../lib/modules";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swSource = readFileSync(join(root, "public/sw.js"), "utf8");

// Trích mọi path `/api/...` được loại trừ trong sw.js: các literal trong
// `url.pathname.startsWith("/api/...")` DÀI HƠN cổng chung "/api/" (bỏ cổng gốc + asset).
const swExcludes = new Set(
  Array.from(swSource.matchAll(/startsWith\("(\/api\/[^"]+)"\)/g), (m) => m[1]),
);

// Path swExclude khai báo trong registry → module nào khai.
const declared = new Map<string, string[]>();
for (const mod of MODULES) {
  for (const path of mod.swExclude ?? []) {
    declared.set(path, [...(declared.get(path) ?? []), mod.key]);
  }
}

const missingInSw: string[] = [];
for (const [path, mods] of declared) {
  if (!swExcludes.has(path)) missingInSw.push(`${path} (module: ${mods.join(", ")})`);
}

// Path sw.js loại trừ nhưng chưa module nào nhận — chỉ cảnh báo (registry phủ dần).
const unclaimed = [...swExcludes].filter((p) => !declared.has(p));

console.log("=== Kiểm swExclude (lib/modules.ts) ↔ public/sw.js ===");
console.log(`sw.js loại trừ: ${[...swExcludes].join(", ") || "(không có)"}`);
console.log(`registry khai báo: ${[...declared.keys()].join(", ") || "(không có)"}`);

if (unclaimed.length) {
  console.warn(
    `\n[CẢNH BÁO] sw.js loại trừ nhưng chưa module nào nhận trong registry: ${unclaimed.join(", ")}`,
  );
}

if (missingInSw.length) {
  console.error(
    `\n[LỖI] swExclude khai báo trong registry nhưng KHÔNG có trong public/sw.js:\n  - ${missingInSw.join(
      "\n  - ",
    )}\n\nThêm path vào khối loại trừ trong public/sw.js (nhớ tăng version CACHE) hoặc bỏ khỏi swExclude.`,
  );
  process.exit(1);
}

console.log("\n[OK] Mọi swExclude khai báo trong registry đều có trong public/sw.js.");
