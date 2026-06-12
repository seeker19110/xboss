import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type SearchHit = {
  kind: "task" | "package";
  id: number; code: string; name: string; boqCode: string | null;
  status: string | null; progress: number;
  floorLabel: string | null; sheetType: string;
};

// GET /api/search?q= → tìm task + nhóm theo mã Excel / BOQCODE / tên (ILIKE).
// Subcon chỉ tìm thấy task được giao cho mình.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const pattern = `%${q}%`;

  const subconFilter = user.role === "subcon" ? " AND t.assigned_to = ?" : "";
  const tasks = await query<SearchHit>(
    `SELECT 'task' AS kind, t.id, t.code, t.name, t.boq_code AS "boqCode",
            t.status, t.progress_percent AS progress,
            wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE (t.code ILIKE ? OR t.name ILIKE ? OR t.boq_code ILIKE ?)${subconFilter}
      ORDER BY st.id, t.code LIMIT 15`,
    ...(user.role === "subcon" ? [pattern, pattern, pattern, user.id] : [pattern, pattern, pattern]));

  // Subcon không cần kết quả nhóm (không thao tác được mức nhóm).
  const packages = user.role === "subcon" ? [] : await query<SearchHit>(
    `SELECT 'package' AS kind, wp.id, wp.code, wp.name, wp.boq_code AS "boqCode",
            wp.status, wp.progress, wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE wp.code ILIKE ? OR wp.name ILIKE ? OR wp.boq_code ILIKE ?
      ORDER BY st.id, wp.code LIMIT 10`, pattern, pattern, pattern);

  return NextResponse.json({ hits: [...packages, ...tasks] });
}
