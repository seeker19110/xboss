import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Chữ tiếng Việt bị mã hoá hai lần (UTF-8 đọc nhầm thành cp1252 rồi lưu lại) — vd "Chá»‰" thay
// cho "Chỉ" — từng lọt vào thông báo lỗi của `app/api/workpackages/route.ts`. Các chuỗi dưới đây
// không bao giờ xuất hiện trong tiếng Việt hợp lệ (khác "ĐÃ"/"MÃ" viết hoa), nên gặp là lỗi thật.
const MOJIBAKE = /Ä‘|Æ°|Æ¡|á»|áº/;

test("mã nguồn app/lib/scripts không chứa chữ tiếng Việt bị mã hoá hai lần", () => {
  const files = execFileSync("git", ["ls-files", "app", "lib", "scripts"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
  const loi: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((dong, i) => {
        if (MOJIBAKE.test(dong)) loi.push(`${f}:${i + 1}: ${dong.trim().slice(0, 80)}`);
      });
  }
  assert.deepEqual(loi, []);
});
