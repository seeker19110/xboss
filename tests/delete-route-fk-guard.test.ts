import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Bất biến tĩnh (không DB): mọi route có `export ... DELETE` trong app/api phải bắt Postgres
// 23503 (qua `laLoiKhoaNgoai` hoặc tự bắt "23503") → 409 dependency_conflict,
// hoặc nằm trong allowlist có lý do. Route DELETE mới quên bắt sẽ làm test này đỏ.

const GOC = path.join(process.cwd(), "app", "api");

// Route DELETE KHÔNG xoá cứng bản ghi có thể bị tham chiếu → không thể dính 23503.
const ALLOWLIST: Record<string, string> = {
  "admin/api-keys/[id]/route.ts": "thu hồi key bằng UPDATE revoked_at, không xoá dòng",
  "projects/[id]/route.ts": "không hỗ trợ xoá cứng dự án — luôn trả 409",
  "auth/totp/route.ts": "tắt 2FA: UPDATE + xoá mã khôi phục (bảng lá) trong transaction",
  "invoices/[id]/route.ts": "soft-delete (deleted_at)",
  "insurance-bonds/[id]/route.ts": "soft-delete (deleted_at)",
  "claims/[id]/route.ts": "soft-delete (deleted_at)",
  "contracts/[id]/route.ts": "soft-delete + đã chặn bằng đếm liên kết trả 409 dependency_conflict",
  "tasks/[id]/approve/route.ts": "huỷ nghiệm thu: UPDATE trạng thái, không xoá dòng",
  "floor-approvals/[id]/route.ts": "huỷ nghiệm thu tầng: UPDATE cờ duyệt, không xoá dòng",
  "diaries/[date]/lock/route.ts": "mở khoá nhật ký: UPDATE trạng thái",
  "workpackages/[id]/bbnt/route.ts": "gỡ file BBNT bằng UPDATE cột, không xoá dòng",
  "workpackages/[id]/drawing/route.ts": "gỡ file bản vẽ bằng UPDATE cột, không xoá dòng",
};

function duyet(dir: string, out: string[] = []): string[] {
  for (const ten of readdirSync(dir)) {
    const p = path.join(dir, ten);
    if (statSync(p).isDirectory()) duyet(p, out);
    else if (ten === "route.ts") out.push(p);
  }
  return out;
}

const coDelete = /export\s+(?:async\s+function|const)\s+DELETE\b/;

test("mọi route DELETE trong app/api bắt 23503 hoặc nằm trong allowlist có lý do", () => {
  const thieu: string[] = [];
  let soDelete = 0;
  for (const f of duyet(GOC)) {
    const src = readFileSync(f, "utf8");
    if (!coDelete.test(src)) continue;
    soDelete++;
    const rel = path.relative(GOC, f).split(path.sep).join("/");
    if (rel in ALLOWLIST) continue;
    const xuLy = /\blaLoiKhoaNgoai\s*\(/.test(src) || src.includes('"23503"');
    if (!xuLy) thieu.push(rel);
  }
  assert.ok(soDelete > 50, "phải quét được các route DELETE");
  assert.deepEqual(thieu, [], `route DELETE chưa xử lý 23503 → 409: ${thieu.join(", ")}`);
});

test("allowlist không chứa mục thừa (route đã bị xoá hoặc không còn DELETE)", () => {
  for (const rel of Object.keys(ALLOWLIST)) {
    const src = readFileSync(path.join(GOC, rel), "utf8");
    assert.ok(coDelete.test(src), `${rel} không còn export DELETE — bỏ khỏi allowlist`);
  }
});
