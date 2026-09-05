import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, canTouchPackage } from "@/lib/bao-mat/auth";
import { visibleProjectIds } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// Dự án của 1 nhóm việc — suy qua sheet_type_id → towers.project_id (vá W0). canTouchPackage
// chỉ kiểm subcon có được GÁN nhóm không, không kiểm dự án — Admin/PM vẫn cần chặn riêng.
async function packageProjectId(id: number): Promise<number | null> {
  const row = await queryOne<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE wp.id = ?`,
    id,
  );
  return row?.projectId ?? null;
}

type TaskRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  progressPercent: number;
  boqCode: string | null;
  drawingUrl: string | null;
  assignedTo: number | null;
  assigneeName: string | null;
  photoCount: number;
  commentCount: number;
  delayReason: string | null;
  startDate: string | null;
  endDate: string | null;
  custom: Record<string, unknown>;
  // Ngày thực tế (M120) — suy tự động từ chuỗi tick, chỉ đọc ở UI. NULL với task chưa bắt
  // đầu và với task đã xong TRƯỚC khi M120 triển khai (không có nguồn để backfill).
  actualStartDate: string | null;
  actualEndDate: string | null;
};
type DimRow = {
  id: number;
  taskId: number;
  label: string;
  installed: number;
  // Dữ liệu sự kiện theo ô (M120) — NULL với ô chưa tick và với ô đã tick TRƯỚC khi M120
  // triển khai (không backfill được: không có nguồn dữ liệu nào cho ai/lúc nào).
  installedAt: string | null;
  installedBy: number | null;
  installedByName: string | null;
  note: string | null;
};

// GET /api/workpackages/:id/dimensions → ma trận sub-task × dimension (kiểu lưới Excel).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const visible = await visibleProjectIds(user);
  const pid = await packageProjectId(pkgId);
  if (pid == null || !visible.includes(pid))
    return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  if (!(await canTouchPackage(user, pkgId)))
    return NextResponse.json({ error: "Không có quyền xem nhóm công việc này" }, { status: 403 });

  const tasks = await query<TaskRow>(
    `SELECT t.id, t.code, t.name, t.status, t.progress_percent AS "progressPercent",
            t.boq_code AS "boqCode", t.drawing_url AS "drawingUrl",
            t.assigned_to AS "assignedTo", u.name AS "assigneeName", t.delay_reason AS "delayReason",
            t.start_date AS "startDate", t.end_date AS "endDate", t.custom,
            t.actual_start_date AS "actualStartDate", t.actual_end_date AS "actualEndDate",
            COALESCE(pc.cnt, 0) AS "photoCount",
            COALESCE(cc.cnt, 0) AS "commentCount"
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN (SELECT task_id, COUNT(*) AS cnt FROM task_photos GROUP BY task_id) pc ON pc.task_id = t.id
       LEFT JOIN (SELECT task_id, COUNT(*) AS cnt FROM task_comments GROUP BY task_id) cc ON cc.task_id = t.id
      WHERE t.package_id = ? ORDER BY t.sort_order, t.id`,
    pkgId,
  );

  // LEFT JOIN users: tên người tick để hiện tooltip ngay trên lưới, không phải gọi thêm
  // route lẻ mỗi lần rê chuột. LEFT (không INNER) vì `installed_by` NULL với ô chưa tick,
  // ô tick trước M120, và ô do import/seed ghi khi không có người dùng.
  const dims = await query<DimRow>(
    `SELECT pd.id, pd.task_id AS "taskId", pd.dimension_label AS label, pd.installed,
            pd.installed_at AS "installedAt", pd.installed_by AS "installedBy",
            u.name AS "installedByName", pd.note
       FROM progress_dimensions pd
       JOIN tasks t ON pd.task_id = t.id
       LEFT JOIN users u ON u.id = pd.installed_by
      WHERE t.package_id = ?
      ORDER BY pd.sort_order, pd.id`,
    pkgId,
  );

  // Cột = nhãn dimension theo thứ tự xuất hiện đầu tiên.
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const d of dims)
    if (!seen.has(d.label)) {
      seen.add(d.label);
      columns.push(d.label);
    }

  type Cell = {
    id: number;
    installed: boolean;
    installedAt: string | null;
    installedByName: string | null;
    note: string | null;
  };
  const byTask = new Map<number, Record<string, Cell>>();
  for (const d of dims) {
    if (!byTask.has(d.taskId)) byTask.set(d.taskId, {});
    // Không trả `installedBy` (id) ra lưới: UI chỉ cần TÊN để hiện tooltip, id không dùng
    // tới và là dữ liệu người dùng thừa trên đường truyền (M120 §12 privacy).
    byTask.get(d.taskId)![d.label] = {
      id: d.id,
      installed: !!d.installed,
      installedAt: d.installedAt,
      installedByName: d.installedByName,
      note: d.note,
    };
  }

  const rows = tasks.map((t) => ({ ...t, cells: byTask.get(t.id) ?? {} }));

  return NextResponse.json({ columns, tasks: rows });
}
