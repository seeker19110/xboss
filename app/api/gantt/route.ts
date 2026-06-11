import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/gantt → work packages có ngày bắt đầu/kết thúc, cho timeline.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const bars = await query(
    `SELECT wp.id, wp.code, wp.name, wp.floor_label AS "floorLabel",
            wp.start_date AS "startDate", wp.end_date AS "endDate",
            wp.progress, wp.status, st.code AS "sheetType"
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE wp.start_date IS NOT NULL AND wp.end_date IS NOT NULL
      ORDER BY st.id, wp.start_date, wp.id`);

  return NextResponse.json({ bars });
}
