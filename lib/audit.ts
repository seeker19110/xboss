// Helper lọc audit_log dùng chung giữa route xem phân trang (/api/admin/audit-log) và
// route xuất Excel (/api/admin/audit-log/export) — M43 PR2. Dữ liệu bản thân audit_log
// được ghi tự động bằng trigger Postgres (migrations/0049_audit_log.sql), 2 route này chỉ
// đọc/lọc/phân trang, không ghi.

// Danh mục entity_type (= tên bảng thật) đang gắn trigger đợt 1 (migrations/0049_audit_log.sql).
// Dùng cho dropdown lọc ở trang /admin/audit-log — hard-code vì danh sách bảng cố định,
// đổi phải qua migration mới nên không cần lấy động.
export const AUDIT_ENTITY_TYPES = [
  "contracts",
  "variation_orders",
  "payment_certs",
  "invoices",
  "cash_transactions",
  "advances",
  "payroll",
  "purchase_orders",
  "task_documents",
  "baselines",
  "insurance_bonds",
  "claims",
] as const;

export type AuditFilter = { where: string; params: unknown[] };

// Dựng mệnh đề WHERE + mảng params (placeholder `?`) từ query params của request —
// chỉ áp điều kiện cho param thực sự có mặt. projectId != null → giới hạn theo dự án
// đang chọn + bản ghi toàn cục (project_id IS NULL, vd đổi role_permissions xuyên dự án),
// nhất quán với cách scope của M22; projectId = null → không lọc (tương thích ngược).
export function buildAuditFilter(
  searchParams: URLSearchParams,
  projectId?: number | null,
): AuditFilter {
  const wheres: string[] = [];
  const params: unknown[] = [];

  if (projectId != null) {
    wheres.push(`(al.project_id = ? OR al.project_id IS NULL)`);
    params.push(projectId);
  }

  const entity = searchParams.get("entity");
  if (entity) {
    wheres.push(`al.entity_type = ?`);
    params.push(entity);
  }
  const entityId = searchParams.get("entityId");
  if (entityId && !isNaN(Number(entityId))) {
    wheres.push(`al.entity_id = ?`);
    params.push(Number(entityId));
  }
  const actorId = searchParams.get("actorId");
  if (actorId && !isNaN(Number(actorId))) {
    wheres.push(`al.actor_id = ?`);
    params.push(Number(actorId));
  }
  const from = searchParams.get("from");
  if (from) {
    wheres.push(`al.at::date >= ?`);
    params.push(from);
  }
  const to = searchParams.get("to");
  if (to) {
    wheres.push(`al.at::date <= ?`);
    params.push(to);
  }

  return { where: wheres.length ? `WHERE ${wheres.join(" AND ")}` : "", params };
}
