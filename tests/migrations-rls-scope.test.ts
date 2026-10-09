import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ADR-0005 "Cạm bẫy #3" (S16, 0165): 18 bảng FORCE RLS không còn nhánh "GUC rỗng cho qua". Role
// migration production không phải superuser → migration ghi dữ liệu lên các bảng này mà không tự
// đặt phạm vi sẽ thấy 0 dòng và lặng lẽ không làm gì (CI không bắt vì role ci là superuser).
// Test thuần đọc file: mọi migration SAU 0165 có UPDATE/INSERT/DELETE chạm bảng trong danh sách
// phải có `set_config('app.org_id', '*', ...)` (hoặc app.project_id cho 3 bảng theo dự án).

const BANG_ORG = [
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
  "org_cost_settings",
];
const BANG_DU_AN = ["baselines", "floor_stage_fronts", "construction_stages"];
const MOC = 165;

function boComment(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function cauGhi(sql: string, bang: string): boolean {
  const re = new RegExp(`\\b(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+(public\\.)?${bang}\\b`, "i");
  return re.test(sql);
}

test("migration sau 0165 ghi dữ liệu lên bảng FORCE RLS phải tự đặt phạm vi app.org_id/app.project_id", () => {
  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 4)) > MOC)
    .sort();
  const loi: string[] = [];
  for (const f of files) {
    const sql = boComment(readFileSync(join(dir, f), "utf8"));
    const coOrg = /set_config\(\s*'app\.org_id'\s*,\s*'\*'/.test(sql);
    const coDuAn = /set_config\(\s*'app\.project_id'\s*,\s*'\*'/.test(sql);
    for (const b of BANG_ORG)
      if (cauGhi(sql, b) && !coOrg) loi.push(`${f}: ghi ${b} thiếu set_config('app.org_id','*')`);
    for (const b of BANG_DU_AN)
      if (cauGhi(sql, b) && !coDuAn)
        loi.push(`${f}: ghi ${b} thiếu set_config('app.project_id','*')`);
  }
  assert.deepEqual(loi, [], loi.join("\n"));
});

test("bộ quét nhận ra câu ghi và bỏ qua comment (tự kiểm)", () => {
  assert.equal(cauGhi("UPDATE users SET x = 1", "users"), true);
  assert.equal(cauGhi("INSERT INTO public.projects (a) VALUES (1)", "projects"), true);
  assert.equal(cauGhi("DELETE FROM feature_flags WHERE 1=1", "feature_flags"), true);
  assert.equal(cauGhi("UPDATE user_projects SET x = 1", "users"), false);
  assert.equal(cauGhi(boComment("-- UPDATE users SET x = 1\nSELECT 1"), "users"), false);
});
