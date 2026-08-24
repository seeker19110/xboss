import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { conNhanProjectIdTran, timRouteViPhamProjectScope } from "../scripts/lib/project-scope-scan";

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
// `body.projectId`, `formData.get("projectId")` hoặc `searchParams.get("projectId")` PHẢI
// đồng thời chốt giá trị đó qua `chotProjectIdChoGhi` (hàm đối chiếu với `visibleProjectIds`),
// hoặc nằm trong WHITELIST dưới kèm lý do. Route MỚI viết lại mẫu cũ mà không giải trình → đỏ.
//
// Vòng vá 2 (reviewer bắt): bản đầu của test này CHỈ soi body/formData nên mù hoàn toàn với
// query string — `hse-vision/scans` và `cashflow/forecasts` vẫn đọc chéo dự án được bằng
// `GET ...?projectId=<dự án khác>` (IDOR) mà `timRouteViPham()` vẫn trả `[]`. Đúng lớp lỗi B1,
// chỉ đổi kênh nhập liệu — nên bộ kiểm phải phủ cả ba kênh client gửi vào.
//
// W2.2 (GĐ2): heuristic dùng chung (walkRoutes/conNhanProjectIdTran) đã tách sang
// `scripts/lib/project-scope-scan.ts` để cổng CI `check:project-scope` (quét TOÀN BỘ
// `app/api/**`) dùng lại thay vì chép logic lần 2 (DRY). Test này GIỮ NGUYÊN phạm vi hẹp
// `app/api/engineering/**` với WHITELIST riêng — không gộp vào cổng CI vì whitelist toàn repo
// dài hơn nhiều, để lẫn sẽ khó soát riêng nhóm engineering.

// Đường dẫn tương đối app/api/engineering/<key>/route.ts. Mỗi mục kèm lý do cụ thể.
// Whitelist RỖNG sau khi tích hợp: cả 3 mục hoãn của vòng 1 (esign/sign, esign/envelopes,
// queue/upload) đều đã được chốt projectId thật — esign/sign ở việc V2, còn esign/envelopes
// và queue/upload vá lúc tích hợp (chúng chỉ được hoãn để tránh 2 worktree cùng sửa 1 file,
// không phải vì có lý do chính đáng để tin client). Thêm mục mới vào đây phải kèm lý do cụ
// thể và một mốc gỡ rõ ràng — ca "WHITELIST không có mục thừa" bên dưới sẽ báo đỏ khi lý do
// hết hiệu lực, đúng như nó đã bắt được `esign/sign` ngay lần chạy đầu sau tích hợp.
const WHITELIST: Record<string, string> = {};

const GOC = join(process.cwd(), "app", "api", "engineering");

/** Route engineering nhận projectId từ client mà KHÔNG chốt qua chotProjectIdChoGhi. */
export function timRouteViPham(): string[] {
  return timRouteViPhamProjectScope(GOC, WHITELIST);
}

test("route engineering không được tin projectId client gửi", () => {
  assert.deepEqual(
    timRouteViPham(),
    [],
    "Route lấy projectId từ body/formData/query mà không chốt qua chotProjectIdChoGhi " +
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
