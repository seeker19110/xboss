import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// V4 (đợt "nâng tầm dự án" GĐ1) — Test bất biến chặn lớp lỗi B1: route engineering lấy
// `project_id` thẳng từ CLIENT.
//
// Mẫu sai đã lan ra ~15 route: `Number(body.projectId || (user as any).projectId || 1)`.
// `user.projectId` KHÔNG tồn tại trên kiểu `User`, nên biểu thức rơi về đúng giá trị client
// gửi — nhiều chỗ còn đưa chính giá trị đó vào `withProjectScope` nên RLS coi như được hợp
// thức hoá. Trái quy ước ghi ngay đầu `lib/ha-tang/projects.ts`: "Route KHÔNG tin project_id
// client gửi qua body/query". Cùng lớp lỗi đã xảy ra thật ở /api/payment-certs và
// /api/engineering/cad/save-drawing.
//
// Heuristic TĨNH (đọc source, không cần DB): file route trong `app/api/engineering/**` chứa
// `body.projectId` hoặc `formData.get("projectId")` PHẢI đồng thời tham chiếu
// `chotProjectIdChoGhi` (hàm đối chiếu với `visibleProjectIds`), hoặc nằm trong WHITELIST
// dưới kèm lý do. Route MỚI viết lại mẫu cũ mà không giải trình → test đỏ.

// Đường dẫn tương đối app/api/engineering/<key>/route.ts. Mỗi mục kèm lý do cụ thể.
const WHITELIST: Record<string, string> = {
  // Việc V2 cùng đợt đang siết quyền ký e-Sign, trong đó có phần chốt projectId qua
  // chotProjectIdChoGhi (PLAN.md V2 mục 5). File thuộc phạm vi V2 nên V4 không được sửa —
  // gỡ khỏi whitelist sau khi tích hợp V2.
  "esign/sign": "đang xử lý ở việc V2, gỡ khỏi whitelist sau khi tích hợp",
  "esign/envelopes": "đang xử lý ở việc V2, gỡ khỏi whitelist sau khi tích hợp",
  // Route upload multipart đang thuộc phạm vi việc V8 (thêm chặn content-length). V4 không
  // sửa file của việc khác — projectId lấy từ formData vẫn cần chốt lại sau khi V8 tích hợp.
  "queue/upload": "đang xử lý ở việc V8, projectId từ formData chờ chốt sau khi tích hợp",
};

function walkRoutes(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walkRoutes(join(dir, ent.name), rel));
    else if (ent.name === "route.ts") out.push(base);
  }
  return out;
}

const GOC = join(process.cwd(), "app", "api", "engineering");

/**
 * File có nhận projectId từ client ở chỗ KHÔNG đi qua chotProjectIdChoGhi hay không.
 *
 * Không chỉ kiểm "file có nhắc tới chotProjectIdChoGhi" — như thế một dòng import hoặc một
 * comment còn sót lại cũng đủ làm test mù. Thay vào đó: cắt bỏ nguyên các câu lệnh gọi
 * `chotProjectIdChoGhi(...)` (giá trị client là tham số của nó = đã được đối chiếu quyền),
 * phần còn lại mà vẫn còn `body.projectId`/`formData.get("projectId")` là dùng trần.
 */
function conNhanProjectIdTran(src: string): boolean {
  const conLai = src.replace(/chotProjectIdChoGhi\([\s\S]*?\);/g, "");
  return (
    /\bbody\.projectId\b/.test(conLai) || /formData\.get\(\s*["']projectId["']\s*\)/.test(conLai)
  );
}

/** Route engineering nhận projectId từ client mà KHÔNG chốt qua chotProjectIdChoGhi. */
export function timRouteViPham(): string[] {
  const viPham: string[] = [];
  for (const key of walkRoutes(GOC)) {
    const src = readFileSync(join(GOC, key, "route.ts"), "utf8");
    if (!conNhanProjectIdTran(src)) continue;
    if (key in WHITELIST) continue;
    viPham.push(key);
  }
  return viPham;
}

test("route engineering không được tin projectId client gửi", () => {
  assert.deepEqual(
    timRouteViPham(),
    [],
    "Route lấy projectId từ body/formData mà không chốt qua chotProjectIdChoGhi " +
      "(xem lib/ha-tang/projects.ts) — sửa route hoặc bổ sung WHITELIST kèm lý do",
  );
});

test("WHITELIST không có mục thừa", () => {
  const thua = Object.keys(WHITELIST).filter((key) => {
    let src: string;
    try {
      src = readFileSync(join(GOC, key, "route.ts"), "utf8");
    } catch {
      return true; // route đã bị xoá/đổi đường dẫn
    }
    return !conNhanProjectIdTran(src);
  });
  assert.deepEqual(thua, [], `WHITELIST có mục đã hết lý do — gỡ: ${thua.join(", ")}`);
});
