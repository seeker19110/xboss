import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// V3 (audit 2026-08-24, lỗ hổng Cao A4) từng thêm bất biến này sau khi phát hiện 14 route
// engineering ghi dữ liệu chỉ kiểm đăng nhập, không kiểm quyền (giả telemetry IoT sinh cảnh
// báo HSE CRITICAL, thầu phụ tự chấm điểm tín nhiệm của chính mình). Các cặp quyền cụ thể
// của đợt đó (BIM/God-Tier, IoT, SubconAi) đã bị gỡ cùng lúc xoá route/UI tương ứng — xem
// PROGRESS.md — chỉ còn bất biến chung dưới đây, vẫn cần giữ cho mọi route engineering mới.
const GOC = path.join(process.cwd(), "app/api/engineering");

test("không còn route engineering POST/PATCH/DELETE nào thiếu CAN.", () => {
  const thieu: string[] = [];
  const duyet = (thuMuc: string) => {
    for (const muc of fs.readdirSync(thuMuc, { withFileTypes: true })) {
      const p = path.join(thuMuc, muc.name);
      if (muc.isDirectory()) duyet(p);
      else if (muc.name === "route.ts") {
        const src = fs.readFileSync(p, "utf8");
        if (/export async function (POST|PATCH|DELETE)\b/.test(src) && !src.includes("CAN.")) {
          thieu.push(path.relative(process.cwd(), p));
        }
      }
    }
  };
  duyet(GOC);
  assert.deepEqual(thieu, [], `route ghi dữ liệu thiếu kiểm quyền:\n${thieu.join("\n")}`);
});
