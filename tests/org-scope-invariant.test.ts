import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// M54 GĐ1 PR2 — Test bất biến chống bỏ sót scope đa TỔ CHỨC (org_id) — song hành với
// tests/project-scope-invariant.test.ts nhưng cho trục org.
//
// 13 bảng nhóm gốc PR1 (migrations/0078_org_axis.sql) mang cột org_id NOT NULL: chúng là
// DỮ LIỆU MASTER/CONFIG SỞ HỮU THEO TỔ CHỨC (khác dữ liệu nghiệp vụ scope theo dự án). Một
// route GET liệt kê CHÍNH các bảng này (FROM <bảng gốc>) mà quên `org_id = user.orgId` sẽ
// rò rỉ dữ liệu xuyên tenant. Heuristic TĨNH (đọc source, không cần DB): route có GET +
// SELECT + `FROM <bảng gốc>` PHẢI tham chiếu `org_id`/`orgId`, hoặc nằm trong WHITELIST.
//
// CHỦ ĐÍCH chỉ soi `FROM <bảng gốc>` (không soi `JOIN`): các bảng gốc (nhất là `users`/
// `projects`) bị JOIN khắp nơi CHỈ để hiển thị tên/mã — ép org_id lên mọi JOIN vừa sai vừa
// nhiễu. Chấp nhận false-negative (như project-scope-invariant) — mục tiêu là CHẶN route
// MỚI liệt kê master data org mà quên lọc, không phải chứng minh mọi route đã đúng.

// 14 bảng gốc PR1 (13 bảng mang org_id + boq_codes PK (org_id, code)).
const BASE_TABLES = [
  "users",
  "projects",
  "suppliers",
  "code_lists",
  "role_permissions",
  "custom_field_defs",
  "feature_flags",
  "alert_rules",
  "approval_flows",
  "api_keys",
  "webhooks",
  "integrations",
  "saved_reports",
  "boq_codes",
];

// Đường dẫn tương đối app/api/<key>/route.ts. Mỗi mục kèm lý do vì sao KHÔNG cần lọc org_id
// (dữ liệu không phải master data org của route này, hoặc đã cô lập bằng cách khác).
const WHITELIST: Record<string, string> = {
  // --- JOIN hiển thị tên / kiểm tra tồn tại (thực thể chính đã scope theo dự án) ---
  "admin/assignments": "admin xem phân công xuyên dự án; JOIN users chỉ để hiển thị tên",
  crews: "kiểm tra tồn tại NCC khi tạo tổ đội (SELECT id FROM suppliers WHERE id=?)",
  mobilization: "kiểm tra tồn tại người được giao (SELECT id FROM users WHERE id=?)",
  "nav-settings": "tra danh sách PM để cấu hình nav theo vai trò, không trả master data org",
  personnel: "kiểm tra tồn tại NCC khi gán nhân sự; personnel scope theo dự án",
  "personnel/[id]": "kiểm tra tồn tại NCC khi sửa nhân sự; personnel scope theo dự án",
  "punch-list": "kiểm tra người được giao; punch_list scope theo dự án",
  "punch-list/[id]": "JOIN/kiểm tra người được giao; punch_list scope theo dự án",
  "warranty-claims": "kiểm tra người được giao; claim scope theo dự án",
  "warranty-claims/[id]": "kiểm tra người được giao; claim scope theo dự án",
  "export/excel": "export theo dự án/sheet; JOIN users hiển thị người phụ trách + đọc code dự án",

  // --- Scope theo id thực thể trên đường dẫn (không liệt kê master data org) ---
  "subcontractors/[supplierId]/documents": "scope theo supplier id trên đường dẫn",
  "subcontractors/[supplierId]/evaluations": "scope theo supplier id trên đường dẫn",
  "suppliers/[id]/summary": "tổng hợp theo supplier id trên đường dẫn",

  // --- Theo user hiện tại (WHERE id = user.id) ---
  "auth/totp": "trạng thái 2FA của chính user (WHERE id = user.id)",
  subcontractors: "supplier_id của chính user đăng nhập (WHERE id = user.id)",

  // --- Cron (xác thực CRON_SECRET, quét nội bộ; integration single-tenant Giai đoạn 1) ---
  "cron/daily-report": "cron, quét user admin/pm nhận email",
  "cron/weekly-report": "cron, quét user admin/pm nhận email",
  "cron/health-check": "cron, quét user admin nhận email cảnh báo hệ thống",
  "cron/sync-integrations": "cron đồng bộ tích hợp — single-tenant Giai đoạn 1 (xem material-sync)",

  // --- Cấu hình dự án singleton (1-org meta, đọc LIMIT 1) ---
  project: "meta dự án singleton (LIMIT 1), public fallback khi DB trống",
  "ui-texts": "nhãn UI cấu hình singleton (LIMIT 1)",
  "materials/columns": "nhãn cột vật tư singleton của dự án (LIMIT 1)",

  // --- Ma trận quyền admin liệt kê dự án (org hoá ma trận là việc theo sau PR2) ---
  "admin/permissions-snapshot": "ma trận quyền liệt kê dự án cho admin — org hoá ma trận theo sau",
  "admin/role-permissions": "ma trận quyền liệt kê dự án cho admin — org hoá ma trận theo sau",
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

test("mọi route GET liệt kê bảng gốc org (FROM <bảng>) phải lọc org_id hoặc whitelist", () => {
  const routes = walkRoutes(join(process.cwd(), "app", "api"));
  const fromBase = new RegExp(`\\bFROM\\s+(${BASE_TABLES.join("|")})\\b`, "i");
  const offenders: string[] = [];
  const unusedWhitelist = new Set(Object.keys(WHITELIST));

  for (const key of routes) {
    const src = readFileSync(join(process.cwd(), "app", "api", key, "route.ts"), "utf8");
    const hasGet = /export\s+(async\s+)?function\s+GET|export\s+const\s+GET/.test(src);
    if (!hasGet || !/\bSELECT\b/i.test(src)) continue;
    if (!fromBase.test(src)) continue;
    unusedWhitelist.delete(key);
    if (/org_id|orgId/.test(src)) continue;
    if (key in WHITELIST) continue;
    offenders.push(key);
  }

  assert.deepEqual(
    offenders,
    [],
    `Route GET liệt kê bảng gốc org thiếu lọc org_id (thêm 'org_id = user.orgId' ` +
      `hoặc bổ sung vào WHITELIST kèm lý do): ${offenders.join(", ")}`,
  );

  // Whitelist khớp thực tế: mục không còn ứng với route nào → gỡ đi.
  assert.deepEqual(
    [...unusedWhitelist],
    [],
    `WHITELIST có mục thừa (route đã lọc org/đổi/xoá) — gỡ: ${[...unusedWhitelist].join(", ")}`,
  );
});

// Phủ đủ 13 bảng gốc: mỗi bảng phải được nhắc trong BASE_TABLES (chống sửa nhầm danh sách).
test("BASE_TABLES phủ đủ 13 bảng nhóm gốc PR1 + boq_codes", () => {
  for (const t of [
    "users",
    "projects",
    "suppliers",
    "code_lists",
    "role_permissions",
    "custom_field_defs",
    "feature_flags",
    "alert_rules",
    "approval_flows",
    "api_keys",
    "webhooks",
    "integrations",
    "saved_reports",
    "boq_codes",
  ]) {
    assert.ok(BASE_TABLES.includes(t), `Thiếu bảng gốc ${t} trong BASE_TABLES`);
  }
});
