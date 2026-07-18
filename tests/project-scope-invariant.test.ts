import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// M45 PR5 — Test bất biến chống bỏ sót scope đa dự án.
//
// Scoping `project_id` làm thủ công từng route → đã lộ lỗi thật 2 lần
// (payment-certs, costs). Heuristic TĨNH (đọc source, không cần DB): mọi route
// có `GET` chứa `SELECT` PHẢI hoặc tham chiếu `getCurrentProjectId`/`project_id`/
// `projectId`, hoặc nằm trong WHITELIST dưới (mỗi mục 1 lý do). Route MỚI quên
// scope mà không whitelist → test đỏ, buộc người viết scope hoặc giải trình.
//
// Chấp nhận false-negative (route trong whitelist có thể vẫn cần rà tay) — mục
// tiêu là CHẶN route mới thêm mà quên, không phải chứng minh mọi route đã đúng.

// Đường dẫn tương đối app/api/<key>/route.ts. Mỗi mục kèm lý do vì sao KHÔNG cần
// scope theo project_id.
const WHITELIST: Record<string, string> = {
  // --- Cross-project / master data / admin (cố ý không giới hạn 1 dự án) ---
  "admin/assignments": "trang admin xem lịch sử phân công xuyên dự án",
  "admin/audit": "audit assignment_log — admin xem toàn hệ",
  "admin/audit-log/export": "xuất audit trail toàn hệ (chỉ admin)",
  project: "thông tin dự án hiện hành (public, tự trả dự án mặc định)",
  projects: "danh sách dự án — bản thân là nguồn của project_id",
  users: "danh bạ người dùng dùng chung mọi dự án",
  "auth/totp": "trạng thái 2FA của user hiện tại (theo user_id, không theo dự án)",
  suppliers: "danh mục NCC dùng chung mọi dự án",
  "ui-texts": "nhãn UI cấu hình toàn hệ",
  "notifications/prefs": "tuỳ chọn thông báo theo người dùng, không theo dự án",

  // --- Cron (xác thực CRON_SECRET; tự lặp theo từng dự án trong logic) ---
  "cron/daily-report": "cron báo cáo ngày, quét mọi dự án nội bộ",
  "cron/weekly-report": "cron báo cáo tuần, quét mọi dự án nội bộ",

  // --- Static/meta (không đọc dữ liệu nghiệp vụ của dự án cụ thể) ---
  "materials/template": "mẫu import vật tư tĩnh",
  "materials/allocation-meta": "metadata cấu hình phân bổ, không theo dự án",

  // --- Scope qua thực thể CHA theo id (không có cột project_id trực tiếp) ---
  "tasks/[id]/comments": "scope theo task id ràng buộc ở đường dẫn",
  "tasks/[id]/dimensions": "scope theo task id",
  "tasks/[id]/documents": "scope theo task id",
  "tasks/[id]/history": "scope theo task id",
  "tasks/[id]/photos": "scope theo task id",
  "workpackages/[id]/bbnt": "scope theo work_package id",
  "workpackages/[id]/dimensions": "scope theo work_package id",
  "workpackages/[id]/drawing": "scope theo work_package id",
  "packages/[id]/dependencies": "scope theo work_package id",
  "documents/[id]": "stream 1 tài liệu theo id",
  "photos/[id]": "stream 1 ảnh theo id",
  "vo-documents/[id]": "stream tài liệu VO theo id",
  "subcon-documents/[id]": "stream tài liệu NTP theo id",
  "work-front-documents/[id]": "stream tài liệu mặt trận theo id",
  "floor-stage-front-documents/[id]": "stream tài liệu mặt trận tầng theo id",
  "floor-approvals/[id]/documents": "scope theo floor-approval id",
  "floor-stage-fronts/[id]/documents": "scope theo floor-stage-front id",
  "subcontractors/[supplierId]/documents": "scope theo supplier id",
  "subcontractors/[supplierId]/evaluations": "scope theo supplier id",
  "suppliers/[id]/summary": "tổng hợp theo supplier id",
  "work-fronts/[id]/documents": "scope theo work-front id",

  // --- Dữ liệu tracking gắn sheet_types (chưa tách project_id — nợ đa dự án đã biết) ---
  tasks: "lưới tracking scope theo sheet (?sheet=slug), nợ đa dự án đã biết",
  baselines: "baseline gắn theo sheet/tracking, nợ đa dự án đã biết",
  approvals: "nhóm nghiệm thu theo sheet × tầng",
  lookahead: "kế hoạch ngắn hạn theo sheet/tracking",
  "my-tasks": "task theo assigned_to của người dùng hiện tại",
  timeline: "dòng thời gian theo sheet/tracking",
  payments: "tổng hợp thanh toán theo sheet/hệ",
  "payments/bills": "phiếu chi theo sheet/hệ",
  "payments/floors": "thanh toán theo tầng của sheet",
  "floor-stage-fronts": "mặt trận theo tầng/giai đoạn của sheet",
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

test("mọi route GET+SELECT phải scope project_id hoặc nằm trong whitelist", () => {
  const routes = walkRoutes(join(process.cwd(), "app", "api"));
  const offenders: string[] = [];
  const unusedWhitelist = new Set(Object.keys(WHITELIST));

  for (const key of routes) {
    const src = readFileSync(join(process.cwd(), "app", "api", key, "route.ts"), "utf8");
    const hasGet = /export\s+(async\s+)?function\s+GET|export\s+const\s+GET/.test(src);
    if (!hasGet || !/\bSELECT\b/i.test(src)) continue;
    unusedWhitelist.delete(key);
    if (/getCurrentProjectId|project_id|projectId/.test(src)) continue;
    if (key in WHITELIST) continue;
    offenders.push(key);
  }

  assert.deepEqual(
    offenders,
    [],
    `Route GET+SELECT thiếu scope project_id (thêm getCurrentProjectId/project_id ` +
      `hoặc bổ sung vào WHITELIST kèm lý do): ${offenders.join(", ")}`,
  );

  // Whitelist khớp thực tế: mục không còn ứng với route GET+SELECT nào → gỡ đi.
  assert.deepEqual(
    [...unusedWhitelist],
    [],
    `WHITELIST có mục thừa (route đã scope/đổi/xoá) — gỡ: ${[...unusedWhitelist].join(", ")}`,
  );
});
