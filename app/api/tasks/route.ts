import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sheetVersion } from "@/lib/version";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Sheet = { id: number; code: string; name: string; responsible: string | null; slug: string };
type Pkg = {
  id: number;
  code: string;
  seqNo: string | null;
  floorLabel: string | null;
  name: string;
  status: string;
  progress: number;
  boqCode: string | null;
  drawingUrl: string | null;
  bbntUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  custom: Record<string, unknown>;
};
type Task = {
  id: number;
  packageId: number;
  code: string;
  name: string;
  status: string;
  endDate: string | null;
  progressPercent: number;
  boqCode: string | null;
  drawingUrl: string | null;
  assignedTo: number | null;
  assigneeName: string | null;
};

// GET /api/tasks?sheet=ogtd  → work packages (kèm sub-tasks) của 1 sheet.
// Mọi vai trò xem được cả lưới (subcon cần ngữ cảnh tầng/nhóm); quyền GHI
// mới giới hạn theo task được giao (canTouchTask ở các route PATCH).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("sheet");
  if (!slug) return NextResponse.json({ error: "Thiếu tham số sheet" }, { status: 400 });

  // Lọc theo dự án đang chọn để tránh rò rỉ chéo dự án (M22+); null = không lọc. Sheet
  // thuộc dự án khác → trả 404 "Sheet không hợp lệ" (không lộ sự tồn tại ở dự án khác).
  const projectId = await getCurrentProjectId(user);
  const st = await queryOne<Sheet>(
    `SELECT st.id, st.code, st.name, st.responsible, st.slug
       FROM sheet_types st
       LEFT JOIN towers tw ON st.tower_id = tw.id
      WHERE st.slug = ?${projectId != null ? " AND tw.project_id = ?" : ""}`,
    slug,
    ...(projectId != null ? [projectId] : []),
  );
  if (!st) return NextResponse.json({ error: "Sheet không hợp lệ" }, { status: 404 });

  // 3 câu độc lập → chạy song song thay vì tuần tự để giảm độ trễ round-trip.
  const [pkgs, tasks, version] = await Promise.all([
    query<Pkg>(
      `SELECT id, code, seq_no AS "seqNo", floor_label AS "floorLabel", name, status, progress,
              boq_code AS "boqCode", drawing_url AS "drawingUrl", bbnt_url AS "bbntUrl",
              start_date AS "startDate", end_date AS "endDate", custom
         FROM work_packages WHERE sheet_type_id = ? ORDER BY sort_order, id`,
      st.id,
    ),
    query<Task>(
      `SELECT t.id, t.package_id AS "packageId", t.code, t.name, t.status,
              t.end_date AS "endDate", t.progress_percent AS "progressPercent",
              t.boq_code AS "boqCode", t.drawing_url AS "drawingUrl",
              t.assigned_to AS "assignedTo", u.name AS "assigneeName"
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         LEFT JOIN users u ON t.assigned_to = u.id
        WHERE wp.sheet_type_id = ?
        ORDER BY t.sort_order, t.id`,
      st.id,
    ),
    sheetVersion(slug),
  ]);

  const byPkg = new Map<number, Task[]>();
  for (const t of tasks) {
    if (!byPkg.has(t.packageId)) byPkg.set(t.packageId, []);
    byPkg.get(t.packageId)!.push(t);
  }

  const packages = pkgs.map((p) => ({ ...p, tasks: byPkg.get(p.id) ?? [] }));

  return NextResponse.json({ sheet: st, packages, version });
}
