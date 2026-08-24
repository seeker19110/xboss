// scripts/lib/project-scope-scan.ts — Hàm quét dùng chung cho lớp lỗi B1: route lấy
// `project_id` thẳng từ CLIENT thay vì chốt qua `chotProjectIdChoGhi`.
//
// LỊCH SỬ: viết lần đầu ở GĐ1 trong `tests/engineering-project-scope-invariant.test.ts`, chỉ
// quét `app/api/engineering/**`. W2.2 (đợt "nâng tầm dự án" GĐ2) nâng thành cổng CI quét TOÀN
// BỘ `app/api/**` — hàm quét được TÁCH ra đây để cả test cũ (giữ nguyên phạm vi engineering,
// đã có WHITELIST riêng đang dùng) lẫn cổng CI mới (`check-project-scope.ts`, phạm vi toàn bộ)
// đều dùng chung một heuristic, không chép logic 2 lần (DRY).
//
// Mẫu sai đã lan ra ~15 route: `Number(body.projectId || (user as any).projectId || 1)`.
// `user.projectId` KHÔNG tồn tại trên kiểu `User`, nên biểu thức rơi về đúng giá trị client
// gửi — nhiều chỗ còn đưa chính giá trị đó vào `withProjectScope` nên RLS coi như được hợp
// thức hoá. Trái quy ước ghi ngay đầu `lib/ha-tang/projects.ts`: "Route KHÔNG tin project_id
// client gửi qua body/query". Cùng lớp lỗi đã xảy ra thật ở /api/payment-certs và
// /api/engineering/cad/save-drawing.
//
// Heuristic TĨNH (đọc source, không cần DB): file route chứa `body.projectId`,
// `formData.get("projectId")` hoặc `searchParams.get("projectId")` PHẢI đồng thời chốt giá trị
// đó qua `chotProjectIdChoGhi` (hàm đối chiếu với `visibleProjectIds`), hoặc nằm trong
// WHITELIST của người gọi kèm lý do. Bản đầu của heuristic này (GĐ1, vòng vá 1) CHỈ soi
// body/formData nên mù hoàn toàn với query string — `hse-vision/scans` và `cashflow/forecasts`
// vẫn đọc chéo dự án được bằng `GET ...?projectId=<dự án khác>` (IDOR) mà vẫn trả `[]`. Bộ
// quét dưới đây PHẢI phủ cả ba kênh — không được thu hẹp lại như bản đầu.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Đường dẫn tương đối (từ `goc`) tới các thư mục chứa `route.ts`. */
export function walkRoutes(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walkRoutes(join(dir, ent.name), rel));
    else if (ent.name === "route.ts") out.push(base);
  }
  return out;
}

/**
 * File có nhận projectId từ client ở chỗ KHÔNG đi qua chotProjectIdChoGhi hay không.
 *
 * Không chỉ kiểm "file có nhắc tới chotProjectIdChoGhi" — như thế một dòng import hoặc một
 * comment còn sót lại cũng đủ làm test mù. Thay vào đó: cắt bỏ nguyên các câu lệnh gọi
 * `chotProjectIdChoGhi(...)` (giá trị client là tham số của nó = đã được đối chiếu quyền),
 * phần còn lại mà vẫn còn một trong ba kênh dưới là dùng trần.
 */
export function conNhanProjectIdTran(src: string): boolean {
  const conLai = src.replace(/chotProjectIdChoGhi\([\s\S]*?\);/g, "");
  return (
    /\bbody\.projectId\b/.test(conLai) ||
    /formData\.get\(\s*["']projectId["']\s*\)/.test(conLai) ||
    /searchParams\.get\(\s*["']projectId["']\s*\)/.test(conLai)
  );
}

/** Route dưới `goc` nhận projectId từ client mà KHÔNG chốt qua chotProjectIdChoGhi. */
export function timRouteViPhamProjectScope(
  goc: string,
  whitelist: Record<string, string>,
): string[] {
  const viPham: string[] = [];
  for (const key of walkRoutes(goc)) {
    const src = readFileSync(join(goc, key, "route.ts"), "utf8");
    if (!conNhanProjectIdTran(src)) continue;
    if (key in whitelist) continue;
    viPham.push(key);
  }
  return viPham;
}
