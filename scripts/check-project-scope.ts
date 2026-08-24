// scripts/check-project-scope.ts — Cổng CI: chặn route lấy `project_id` thẳng từ CLIENT mà
// không chốt qua `chotProjectIdChoGhi`. Nâng phạm vi GĐ1 (chỉ `app/api/engineering/**`) lên
// TOÀN BỘ `app/api/**` (W2.2, đợt "nâng tầm dự án" GĐ2). Heuristic dùng chung với
// `tests/engineering-project-scope-invariant.test.ts` qua `scripts/lib/project-scope-scan.ts`
// — xem lý do đầy đủ + lịch sử 2 vòng vá trong file đó.
//
// Chạy: npx tsx scripts/check-project-scope.ts
//  - THOÁT 1 (đỏ) nếu có route dùng trần body.projectId/formData.get("projectId")/
//    searchParams.get("projectId") mà không chốt qua chotProjectIdChoGhi, và không nằm
//    trong WHITELIST.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  conNhanProjectIdTran,
  timRouteViPhamProjectScope,
  walkRoutes,
} from "./lib/project-scope-scan";

const GOC = join(process.cwd(), "app", "api");

// key = đường dẫn thư mục route tính từ app/api (vd "admin/api-keys"). Mỗi mục PHẢI kèm lý do
// cụ thể — đã đọc từng file trước khi thêm, không whitelist cho tiện.
const WHITELIST: Record<string, string> = {
  // ── Route cấu hình chỉ Admin (CAN.manage*) — projectId ở đây là THUỘC TÍNH của tài
  // nguyên đang tạo/sửa (rule/flow/key/field/flag/integration/webhook áp dụng cho dự án
  // nào), KHÔNG phải phạm vi lọc dữ liệu của người gọi. `visibleProjectIds()`
  // (lib/ha-tang/projects.ts) cho Admin thấy TOÀN BỘ dự án hệ thống (không có org_id trên
  // bảng projects) nên nhận projectId bất kỳ từ Admin không phải leo quyền — Admin vốn đã
  // quản được mọi dự án. Đã kiểm: mỗi route dưới đây có `CAN.manage*(user.role)` chặn trước
  // khi đọc projectId từ body.
  "admin/alert-rules":
    "Admin-only (CAN.manageAlertRules) — projectId là thuộc tính rule, không phải phạm vi lọc.",
  "admin/api-keys":
    "Admin-only (CAN.manageIntegrations) — projectId là thuộc tính key, không phải phạm vi lọc.",
  "admin/approval-flows":
    "Admin-only (CAN.manageApprovalFlows) — projectId là thuộc tính flow, không phải phạm vi lọc.",
  "admin/custom-fields":
    "Admin-only (CAN.manageCustomFields) — projectId là thuộc tính field, không phải phạm vi lọc.",
  "admin/feature-flags":
    "Admin-only (CAN.manageFeatureFlags) — projectId là dự án được bật/tắt module, do Admin chỉ định.",
  "admin/integrations":
    "Admin-only (CAN.manageIntegrations) — projectId là thuộc tính tích hợp, không phải phạm vi lọc.",
  "admin/role-permissions":
    "Admin-only (CAN.manageUsers) — projectId là phạm vi override quyền do Admin chỉ định.",
  "admin/webhooks":
    "Admin-only (CAN.manageIntegrations) — projectId là thuộc tính webhook, không phải phạm vi lọc.",
};

console.log("=== Kiểm route không tin projectId client gửi trần (app/api/**) ===");

const viPham = timRouteViPhamProjectScope(GOC, WHITELIST);

if (viPham.length) {
  console.error(
    `\n[LỖI] ${viPham.length} route nhận projectId trần từ body/formData/query mà không chốt ` +
      `qua chotProjectIdChoGhi:`,
  );
  for (const key of viPham) console.error(`  - app/api/${key}/route.ts`);
  console.error(
    "\nSửa: đối chiếu giá trị qua chotProjectIdChoGhi(user, input, hienTai) " +
      "(lib/ha-tang/projects.ts), hoặc bổ sung mục WHITELIST trong " +
      "scripts/check-project-scope.ts kèm lý do cụ thể.",
  );
  process.exit(1);
}

// Whitelist không có mục thừa — route đã sửa xong (dùng chotProjectIdChoGhi) phải gỡ khỏi đây.
const thua = Object.keys(WHITELIST).filter((key) => {
  let src: string;
  try {
    src = readFileSync(join(GOC, key, "route.ts"), "utf8");
  } catch {
    return true; // route đã bị xoá/đổi đường dẫn
  }
  return !conNhanProjectIdTran(src);
});
if (thua.length) {
  console.error(`\n[LỖI] WHITELIST có mục đã hết lý do (route hiện đã tự chốt quyền) — gỡ:`);
  for (const k of thua) console.error(`  - ${k}`);
  process.exit(1);
}

console.log(
  `\n[OK] Không route nào dùng trần projectId ngoài WHITELIST có lý do (tổng ` +
    `${walkRoutes(GOC).length} route đã quét, ${Object.keys(WHITELIST).length} mục whitelist).`,
);
