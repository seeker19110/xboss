// lib/alerts.ts — M47 PR4: cảnh báo cấu hình được (alert_rules).
//
// Thay hằng số hard-code trong /api/notifications (hạn sắp đến, vật tư vượt định mức)
// bằng ngưỡng đọc từ bảng `alert_rules`. Whitelist metric TĨNH — không cho tên tuỳ ý.
// Rule mức dự án không có → dùng `defaultThreshold` (hành vi cũ, không seed gì cả).
// Xem docs/nang-cap/M47-evm-bi.md mục PR4.
import { query, queryOne, run, insertId } from "@/lib/db";

export type AlertMetric =
  "due_soon_days" | "due_soon_progress" | "material_over_pct" | "spi_below" | "cpi_below";

export const ALERT_METRICS: Record<
  AlertMetric,
  { label: string; operator: "lt" | "gt"; defaultThreshold: number; unit: string }
> = {
  due_soon_days: {
    label: "Số ngày trước hạn để cảnh báo",
    operator: "lt",
    defaultThreshold: 3,
    unit: "ngày",
  },
  due_soon_progress: {
    label: "Tiến độ dưới ngưỡng mới cảnh báo sắp trễ",
    operator: "lt",
    defaultThreshold: 0.7,
    unit: "%",
  },
  material_over_pct: {
    label: "Vật tư vượt định mức bao nhiêu % thì cảnh báo",
    operator: "gt",
    defaultThreshold: 0,
    unit: "%",
  },
  spi_below: {
    label: "SPI dưới ngưỡng thì cảnh báo chậm tiến độ",
    operator: "lt",
    defaultThreshold: 1,
    unit: "",
  },
  cpi_below: {
    label: "CPI dưới ngưỡng thì cảnh báo vượt chi",
    operator: "lt",
    defaultThreshold: 1,
    unit: "",
  },
};

export const ALERT_METRIC_KEYS = Object.keys(ALERT_METRICS) as AlertMetric[];

export function isAlertMetric(v: string): v is AlertMetric {
  return v in ALERT_METRICS;
}

export type AlertRuleRow = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  metric: AlertMetric;
  operator: "lt" | "gt";
  threshold: number;
  channel: string;
  active: boolean;
  createdAt: string;
};

// Ngưỡng hiệu lực cho 1 metric + dự án: ưu tiên rule riêng dự án (active), rồi rule
// project_id NULL (áp mọi dự án, active), không có gì → defaultThreshold (hành vi cũ).
// 1 query duy nhất (không lệ thuộc project_id có null hay không) — điều kiện SQL khớp
// cả rule riêng lẫn rule chung cùng lúc, chọn ưu tiên ở JS.
export async function getAlertThreshold(
  metric: AlertMetric,
  projectId: number | null,
): Promise<number> {
  const rows = await query<{ projectId: number | null; threshold: number }>(
    `SELECT project_id AS "projectId", threshold FROM alert_rules
      WHERE metric = ? AND active AND (project_id = ? OR project_id IS NULL)`,
    metric,
    projectId,
  );
  const own = projectId != null ? rows.find((r) => r.projectId === projectId) : undefined;
  const global = rows.find((r) => r.projectId === null);
  const rule = own ?? global;
  return rule ? Number(rule.threshold) : ALERT_METRICS[metric].defaultThreshold;
}

// Danh sách mọi rule (xuyên dự án) cho trang admin — kèm tên dự án để hiển thị.
export async function listAlertRules(): Promise<AlertRuleRow[]> {
  return query<AlertRuleRow>(
    `SELECT ar.id, ar.project_id AS "projectId", p.name AS "projectName", ar.metric,
            ar.operator, ar.threshold, ar.channel, ar.active,
            ar.created_at AS "createdAt"
       FROM alert_rules ar
       LEFT JOIN projects p ON p.id = ar.project_id
      ORDER BY ar.metric, ar.project_id NULLS FIRST, ar.id`,
  );
}

// Tạo/cập nhật ngưỡng cho 1 (metric, dự án): còn rule active cùng cặp → update ngưỡng,
// chưa có → tạo mới. Validate metric trong whitelist + threshold hữu hạn (không âm với
// 2 metric tỷ lệ %/tiến độ).
export async function upsertAlertRule(input: {
  projectId: number | null;
  metric: string;
  threshold: number;
  active?: boolean;
  userId?: number | null;
}): Promise<{ id: number } | string> {
  if (!isAlertMetric(input.metric)) return "Metric không hợp lệ";
  if (!Number.isFinite(input.threshold)) return "Ngưỡng phải là số hữu hạn";
  if (
    (input.metric === "material_over_pct" || input.metric === "due_soon_progress") &&
    input.threshold < 0
  )
    return "Ngưỡng không được âm";
  if (input.projectId != null && (!Number.isInteger(input.projectId) || input.projectId <= 0))
    return "projectId không hợp lệ";

  const operator = ALERT_METRICS[input.metric].operator;
  const active = input.active ?? true;

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM alert_rules
      WHERE metric = ? AND COALESCE(project_id, 0) = COALESCE(?, 0) AND active`,
    input.metric,
    input.projectId,
  );
  if (existing) {
    await run(
      `UPDATE alert_rules SET threshold = ?, active = ?, operator = ? WHERE id = ?`,
      input.threshold,
      active,
      operator,
      existing.id,
    );
    return { id: existing.id };
  }

  const id = await insertId(
    `INSERT INTO alert_rules (project_id, metric, operator, threshold, active, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.projectId,
    input.metric,
    operator,
    input.threshold,
    active,
    input.userId ?? null,
  );
  return { id };
}

// Xoá 1 rule — quay lại default cho (metric, dự án) đó.
export async function deleteAlertRule(id: number): Promise<void> {
  await run(`DELETE FROM alert_rules WHERE id = ?`, id);
}
