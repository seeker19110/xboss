import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/audit?limit=50&offset=0 → lịch sử phân công (Admin/PM).
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(me.role))
    return NextResponse.json({ error: "Không có quyền xem audit" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");

  const rows = await query(
    `SELECT al.id, al.level, al.target_label AS "targetLabel",
            al.is_manual AS "isManual", al.changed_at AS "changedAt",
            p.name AS "prevUser", n.name AS "newUser", cb.name AS "changedBy"
       FROM assignment_log al
       LEFT JOIN users p ON al.prev_user_id = p.id
       LEFT JOIN users n ON al.new_user_id = n.id
       LEFT JOIN users cb ON al.changed_by = cb.id
      ORDER BY al.changed_at DESC
      LIMIT ? OFFSET ?`, limit, offset);

  const total = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM assignment_log`);

  return NextResponse.json({ rows, total: Number((total[0] as { n: number })?.n ?? 0) });
}
