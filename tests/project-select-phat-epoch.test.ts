import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// QUALITY-FINAL-1 S05 (A2-FR03): cookie dự án dùng chung mọi tab — mọi chỗ client đổi dự án qua
// POST /api/project/select phải phát epoch đổi ngữ cảnh (phatDoiNguCanh) để tab khác khoá dữ liệu
// dự án cũ. Quét tĩnh app/** để chỗ gọi mới không quên (lỗi thật từng sót ở /portfolio).

const GOC = join(process.cwd(), "app");

function duyet(dir: string): string[] {
  const ra: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ra.push(...duyet(p));
    else if (/\.(ts|tsx)$/.test(e.name)) ra.push(p);
  }
  return ra;
}

test("mọi file client gọi /api/project/select đều phát phatDoiNguCanh", () => {
  const goi = duyet(GOC).filter((f) => {
    // Bỏ chính route handler phía server.
    if (relative(GOC, f).startsWith(join("api", "project", "select"))) return false;
    return readFileSync(f, "utf8").includes("/api/project/select");
  });
  assert.ok(goi.length >= 2, "phải tìm thấy ít nhất ProjectSwitcher + portfolio");
  const thieu = goi
    .filter((f) => !/phatDoiNguCanh\(\s*["']switch["']\s*\)/.test(readFileSync(f, "utf8")))
    .map((f) => relative(process.cwd(), f));
  assert.deepEqual(thieu, [], 'Gọi /api/project/select nhưng không phatDoiNguCanh("switch")');
});
