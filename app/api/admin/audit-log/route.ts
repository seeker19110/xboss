import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { buildAuditFilter } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// GET /api/admin/audit-log?entity=&entityId=&actorId=&from=&to=&page= — sổ audit trail
// toàn hệ (M43 PR2), chỉ Admin xem. Dữ liệu ghi tự động bằng trigger Postgres (xem
// migrations/0049_audit_log.sql) — route này chỉ đọc, lọc và phân trang 50 dòng/trang.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAudit(me.role))
    return NextResponse.json({ error: "Không có quyền xem audit trail" }, { status: 403 });

  const projectId = await getCurrentProjectId(me);
  const { where, params } = buildAuditFilter(req.nextUrl.searchParams, projectId);
  const page = Math.max(Number(req.nextUrl.searchParams.get("page")) || 0, 0);
  const offset = page * PAGE_SIZE;

  const rows = await query(
    `SELECT al.id, al.at, al.actor_id AS "actorId", u.name AS "actorName",
            al.actor_role AS "actorRole", al.entity_type AS "entityType",
            al.entity_id AS "entityId", al.action, al.changes,
            al.project_id AS "projectId", al.request_id AS "requestId"
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
      ORDER BY al.id DESC
      LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    offset,
  );

  const totalRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_log al ${where}`,
    ...params,
  );

  return NextResponse.json({ rows, total: Number(totalRow?.n ?? 0) });
}
