import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp schema `bi` (M55 PR1) — cần Postgres riêng qua TEST_DATABASE_URL =====
// Kiểm 3 điều:
//   (1) role xboss_bi SELECT được mọi view bi.* (SET ROLE — không cần biết mật khẩu role);
//       role tạo TAY lúc deploy nên trên DB test sạch thường CHƯA có → tự SKIP có log.
//   (2) BẤT BIẾN (không skip): không view bi.* nào ngoài view `_fin` chứa cột tiền/đơn giá/
//       tỷ lệ; KHÔNG view nào (kể cả _fin) chứa password_hash/email. Đỏ ngay khi ai thêm
//       view quên luật (cùng triết lý project-scope-invariant).
//   (3) view lấy từ bảng có soft-delete (contracts/variation_orders/payment_certs) phải có
//       điều kiện `deleted_at IS NULL` trong định nghĩa.

// Cột PII cấm khỏi MỌI view (kể cả _fin) — đối chiếu users(email/password_hash) lib/sensitive-fields.ts §3.
const PII_FORBIDDEN = ["password_hash", "email"];

// Cột tiền/đơn giá/tỷ lệ nhạy cảm — cấm khỏi view KHÔNG có hậu tố `_fin`. Tên cột gốc DB đối
// chiếu lib/sensitive-fields.ts (value/advance_pct/retention_pct/unit_price/amount/rate/gross/
// deductions/net/labor/contract_value/value_delta...) + tên cột tính tiền các view _fin
// (proposed_value/approved_value/period_value/cumulative_value/committed/actual).
const MONEY_FORBIDDEN = [
  "value",
  "unit_price",
  "sub_unit_price",
  "advance_pct",
  "retention_pct",
  "contract_value",
  "value_delta",
  "amount",
  "labor",
  "rate",
  "gross",
  "deductions",
  "net",
  "proposed_value",
  "approved_value",
  "period_value",
  "cumulative_value",
  "committed",
  "actual",
];

// View lấy từ bảng có cột deleted_at (M44 soft-delete) → phải lọc deleted_at IS NULL.
const SOFT_DELETE_VIEWS = ["contracts_fin", "variations_fin", "payment_certs_fin"];

test(
  "bi: role xboss_bi SELECT được mọi view bi.* (skip nếu role chưa tạo tay)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query } = await import("@/lib/db");
    // Query bất kỳ để ensureSchema() áp migration 0073 lên DB test trước khi kiểm.
    await query("SELECT 1");

    const roleRows = await query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xboss_bi') AS exists`,
    );
    if (!roleRows[0]?.exists) {
      // Role tạo TAY lúc deploy (CREATE ROLE xboss_bi ... — không trong migration, xem
      // DEPLOY.md). DB test sạch chưa có role → không thể kiểm quyền thật. SKIP có log,
      // KHÔNG fail cứng: bất biến cột (test dưới) mới là lớp chặn chạy mãi trong CI.
      console.log(
        "[bi-schema] SKIP kiểm quyền: role xboss_bi chưa tồn tại trên DB test (tạo tay lúc deploy).",
      );
      return;
    }

    const views = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'bi' ORDER BY table_name`,
    );
    assert.ok(views.length > 0, "schema bi phải có ít nhất 1 view");

    // SET ROLE (không cần mật khẩu; owner/superuser đổi sang role bất kỳ) rồi SELECT từng view
    // trên CÙNG connection để kiểm GRANT USAGE + SELECT thực sự hiệu lực với xboss_bi.
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("SET ROLE xboss_bi");
      for (const v of views) {
        await client.query(`SELECT * FROM bi.${v.table_name} LIMIT 0`);
      }
      // Không được đọc bảng public (không cấp quyền) — kỳ vọng lỗi permission denied.
      await assert.rejects(
        () => client.query(`SELECT * FROM public.users LIMIT 0`),
        /permission denied/i,
        "xboss_bi KHÔNG được đọc trực tiếp bảng public",
      );
    } finally {
      await client.query("RESET ROLE").catch(() => {});
      client.release();
      await pool.end();
    }
  },
);

test(
  "bi: BẤT BIẾN — không cột PII/tiền lộ sai view (không skip)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query } = await import("@/lib/db");
    await query("SELECT 1"); // ensureSchema() áp migration 0073.

    const cols = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'bi'`,
    );
    assert.ok(cols.length > 0, "schema bi phải có cột (migration 0073 đã áp?)");

    const piiLeaks: string[] = [];
    const moneyLeaks: string[] = [];
    for (const { table_name, column_name } of cols) {
      if (PII_FORBIDDEN.includes(column_name)) piiLeaks.push(`bi.${table_name}.${column_name}`);
      const isFin = table_name.endsWith("_fin");
      if (!isFin && MONEY_FORBIDDEN.includes(column_name)) {
        moneyLeaks.push(`bi.${table_name}.${column_name}`);
      }
    }

    assert.deepEqual(
      piiLeaks,
      [],
      `View bi.* KHÔNG được lộ PII (password_hash/email): ${piiLeaks.join(", ")}`,
    );
    assert.deepEqual(
      moneyLeaks,
      [],
      `Cột tiền/đơn giá/tỷ lệ chỉ được ở view có hậu tố _fin — vi phạm: ${moneyLeaks.join(", ")}`,
    );
  },
);

test(
  "bi: view từ bảng soft-delete phải lọc deleted_at IS NULL",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query, queryOne } = await import("@/lib/db");
    await query("SELECT 1"); // ensureSchema() áp migration 0073.

    for (const view of SOFT_DELETE_VIEWS) {
      const row = await queryOne<{ def: string }>(
        `SELECT pg_get_viewdef('bi.${view}'::regclass, true) AS def`,
      );
      assert.ok(row, `phải lấy được định nghĩa bi.${view}`);
      assert.match(
        row.def.replace(/\s+/g, " "),
        /deleted_at IS NULL/i,
        `bi.${view} phải có điều kiện deleted_at IS NULL (tôn trọng soft-delete M44)`,
      );
    }
  },
);
