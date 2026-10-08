import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { visibleProjectIds } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// GET /api/admin/audit?limit=50&offset=0 → lịch sử phân công (Admin/PM).
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(me.role))
    return NextResponse.json({ error: "Không có quyền xem audit" }, { status: 403 });

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset")) || 0, 0);

  // S02: chỉ log phân công của đối tượng (sheet/nhóm/task) thuộc dự án người gọi thấy
  // được — dự án suy qua cây WBS, bảng assignment_log không có cột dự án/org riêng.
  const visible = await visibleProjectIds(me);
  const scope = `al.project_id = ANY(?)`;
  const from = `FROM (
      SELECT a.*, tw.project_id
        FROM assignment_log a
        LEFT JOIN tasks t ON a.level = 'task' AND t.id = a.target_id
        LEFT JOIN work_packages wp
          ON wp.id = CASE WHEN a.level = 'package' THEN a.target_id
                          WHEN a.level = 'task' THEN t.package_id END
        LEFT JOIN sheet_types st
          ON st.id = CASE WHEN a.level = 'sheet' THEN a.target_id ELSE wp.sheet_type_id END
        LEFT JOIN towers tw ON tw.id = st.tower_id
    ) al`;

  const rows = await query(
    `SELECT al.id, al.level, al.target_label AS "targetLabel",
            al.is_manual AS "isManual", al.changed_at AS "changedAt",
            p.name AS "prevUser", n.name AS "newUser", cb.name AS "changedBy"
       ${from}
       LEFT JOIN users p ON al.prev_user_id = p.id
       LEFT JOIN users n ON al.new_user_id = n.id
       LEFT JOIN users cb ON al.changed_by = cb.id
      WHERE ${scope}
      ORDER BY al.changed_at DESC
      LIMIT ? OFFSET ?`,
    visible,
    limit,
    offset,
  );

  const total = await query<{ n: number }>(`SELECT COUNT(*) AS n ${from} WHERE ${scope}`, visible);

  return NextResponse.json({ rows, total: Number((total[0] as { n: number })?.n ?? 0) });
}
