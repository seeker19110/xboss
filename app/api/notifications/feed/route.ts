import { NextResponse } from "next/server";
import { query, queryOne, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Prefs } from "@/app/api/notifications/prefs/route";

export const dynamic = "force-dynamic";

// Vai trò được xem TOÀN BỘ thông báo (không lọc theo task được giao).
const FULL_ACCESS_ROLES = ["admin", "pm", "engineer", "bch", "cdt"];

// GET /api/notifications/feed
// Trả về feed tổng hợp cho trang /notifications.
// Vai trò fullAccess → thấy mọi task/hoạt động.
// subcon/viewer → chỉ thấy task assigned_to = mình.
// Prefs của từng user lọc thêm loại thông báo muốn nhận.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();
  const fullAccess = FULL_ACCESS_ROLES.includes(user.role);

  // Lọc assigned cho subcon/viewer
  const assignedFilter = fullAccess ? "" : " AND t.assigned_to = ?";
  const args = (base: unknown[]) => fullAccess ? base : [...base, user.id];

  const due5   = daysFromTodayISO(5);
  const start7 = daysFromTodayISO(7);
  const ago48h = new Date(0).toISOString(); // không giới hạn thời gian

  // Prefs của user
  const prefRow = await queryOne<{ prefs: string }>(
    `SELECT prefs FROM notification_prefs WHERE user_id = ?`, user.id);
  let prefs: Prefs = {};
  try { prefs = JSON.parse(prefRow?.prefs ?? "{}") ?? {}; } catch { /* default all on */ }
  // Nếu key chưa có trong prefs → mặc định bật (true khi undefined)
  const pref = (key: keyof Prefs) => prefs[key] !== false;

  // ── OVERDUE ────────────────────────────────────────────────────────────────
  const overdue = pref("delayed") ? await query<{
    id: number; code: string; name: string; endDate: string;
    progress: number; assignedTo: string | null;
    sheetCode: string; sheetName: string; sheetSlug: string | null; packageName: string;
  }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate",
            ROUND((t.progress_percent * 100)::numeric,0)::int AS progress,
            u.name AS "assignedTo",
            st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
            wp.name AS "packageName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')${assignedFilter}
      ORDER BY t.end_date ASC, st.code ASC`,
    ...args([today])) : [];

  // ── DUE SOON (5 ngày) ─────────────────────────────────────────────────────
  const dueSoon = pref("due_soon") ? await query<{
    id: number; code: string; name: string; endDate: string;
    progress: number; assignedTo: string | null;
    sheetCode: string; sheetName: string; sheetSlug: string | null; packageName: string;
  }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate",
            ROUND((t.progress_percent * 100)::numeric,0)::int AS progress,
            u.name AS "assignedTo",
            st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
            wp.name AS "packageName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')${assignedFilter}
      ORDER BY t.end_date ASC, st.code ASC`,
    ...args([today, due5])) : [];

  // ── UPCOMING START (7 ngày) ────────────────────────────────────────────────
  const upcomingStart = pref("upcoming_start") ? await query<{
    id: number; code: string; name: string; startDate: string; endDate: string | null;
    progress: number; assignedTo: string | null;
    sheetCode: string; sheetName: string; sheetSlug: string | null; packageName: string;
  }>(
    `SELECT t.id, t.code, t.name,
            t.start_date AS "startDate", t.end_date AS "endDate",
            ROUND((t.progress_percent * 100)::numeric,0)::int AS progress,
            u.name AS "assignedTo",
            st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
            wp.name AS "packageName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.start_date > ? AND t.start_date <= ?
        AND t.progress_percent = 0
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')${assignedFilter}
      ORDER BY t.start_date ASC, st.code ASC`,
    ...args([today, start7])) : [];

  // ── RECENT ACTIVITY 48H ────────────────────────────────────────────────────
  type Event = {
    type: "progress"|"photo"|"document"|"comment";
    taskId: number; taskCode: string; taskName: string;
    detail: string; by: string|null; at: string;
    sheetSlug: string|null; meta?: Record<string,unknown>;
  };
  const bySheet = new Map<string, { sheetCode:string; sheetName:string; sheetSlug:string|null; events:Event[] }>();
  const ensureSheet = (code: string, name: string, slug: string|null) => {
    if (!bySheet.has(code)) bySheet.set(code, { sheetCode:code, sheetName:name, sheetSlug:slug, events:[] });
    return bySheet.get(code)!;
  };

  if (pref("activity_progress")) {
    const rows = await query<{
      taskId:number; taskCode:string; taskName:string;
      sheetCode:string; sheetName:string; sheetSlug:string|null;
      oldProgress:number; newProgress:number; by:string|null; at:string;
    }>(
      `SELECT t.id AS "taskId", t.code AS "taskCode", t.name AS "taskName",
              st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
              ROUND((h.old_progress*100)::numeric,0)::int AS "oldProgress",
              ROUND((h.new_progress*100)::numeric,0)::int AS "newProgress",
              h.changed_by AS by, h.changed_at AS at
         FROM task_history h
         JOIN tasks t ON h.task_id = t.id
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
        WHERE h.changed_at >= ?${assignedFilter}
        ORDER BY h.changed_at DESC LIMIT 200`,
      ...args([ago48h]));
    for (const r of rows) {
      const diff = r.newProgress - r.oldProgress;
      ensureSheet(r.sheetCode, r.sheetName, r.sheetSlug).events.push({
        type:"progress", taskId:r.taskId, taskCode:r.taskCode, taskName:r.taskName,
        sheetSlug:r.sheetSlug,
        detail: diff >= 0 ? `${r.oldProgress}% → ${r.newProgress}%` : `Bỏ CN: ${r.oldProgress}% → ${r.newProgress}%`,
        by:r.by, at:r.at, meta:{ oldProgress:r.oldProgress, newProgress:r.newProgress },
      });
    }
  }

  if (pref("activity_photo")) {
    const rows = await query<{
      taskId:number; taskCode:string; taskName:string;
      sheetCode:string; sheetName:string; sheetSlug:string|null;
      caption:string|null; by:string|null; at:string; fileId:number;
    }>(
      `SELECT t.id AS "taskId", t.code AS "taskCode", t.name AS "taskName",
              st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
              p.caption, u.name AS by, p.created_at AS at, p.id AS "fileId"
         FROM task_photos p
         JOIN tasks t ON p.task_id = t.id
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN users u ON p.uploaded_by = u.id
        WHERE p.created_at >= ?${assignedFilter}
        ORDER BY p.created_at DESC LIMIT 200`,
      ...args([ago48h]));
    for (const r of rows) {
      ensureSheet(r.sheetCode, r.sheetName, r.sheetSlug).events.push({
        type:"photo", taskId:r.taskId, taskCode:r.taskCode, taskName:r.taskName,
        sheetSlug:r.sheetSlug, detail:r.caption||"Ảnh hiện trường",
        by:r.by, at:r.at, meta:{ fileId:r.fileId },
      });
    }
  }

  if (pref("activity_document")) {
    const rows = await query<{
      taskId:number; taskCode:string; taskName:string;
      sheetCode:string; sheetName:string; sheetSlug:string|null;
      caption:string|null; origName:string|null; by:string|null; at:string; fileId:number;
    }>(
      `SELECT t.id AS "taskId", t.code AS "taskCode", t.name AS "taskName",
              st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
              d.caption, d.original_name AS "origName", u.name AS by, d.created_at AS at, d.id AS "fileId"
         FROM task_documents d
         JOIN tasks t ON d.task_id = t.id
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.created_at >= ?${assignedFilter}
        ORDER BY d.created_at DESC LIMIT 200`,
      ...args([ago48h]));
    for (const r of rows) {
      ensureSheet(r.sheetCode, r.sheetName, r.sheetSlug).events.push({
        type:"document", taskId:r.taskId, taskCode:r.taskCode, taskName:r.taskName,
        sheetSlug:r.sheetSlug, detail:r.caption||r.origName||"Bản vẽ / tài liệu",
        by:r.by, at:r.at, meta:{ fileId:r.fileId, origName:r.origName },
      });
    }
  }

  if (pref("activity_comment")) {
    const rows = await query<{
      taskId:number; taskCode:string; taskName:string;
      sheetCode:string; sheetName:string; sheetSlug:string|null;
      body:string; by:string|null; at:string;
    }>(
      `SELECT t.id AS "taskId", t.code AS "taskCode", t.name AS "taskName",
              st.code AS "sheetCode", st.name AS "sheetName", st.slug AS "sheetSlug",
              c.body, u.name AS by, c.created_at AS at
         FROM task_comments c
         JOIN tasks t ON c.task_id = t.id
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN users u ON c.user_id = u.id
        WHERE c.created_at >= ?${assignedFilter}
        ORDER BY c.created_at DESC LIMIT 200`,
      ...args([ago48h]));
    for (const r of rows) {
      ensureSheet(r.sheetCode, r.sheetName, r.sheetSlug).events.push({
        type:"comment", taskId:r.taskId, taskCode:r.taskCode, taskName:r.taskName,
        sheetSlug:r.sheetSlug, detail:r.body.length > 80 ? r.body.slice(0,80)+"…" : r.body,
        by:r.by, at:r.at,
      });
    }
  }

  const recentActivity = [...bySheet.values()].map(g => ({
    ...g,
    events: g.events
      .map(e => ({ ...e, at: typeof e.at === 'object' && e.at !== null ? (e.at as Date).toISOString() : e.at }))
      .sort((a,b) => (b.at ?? "").localeCompare(a.at ?? "")),
  })).sort((a,b) => (b.events[0]?.at ?? "").localeCompare(a.events[0]?.at ?? ""));

  // Vật tư vượt định mức — chỉ fullAccess
  const materialOver = (fullAccess && pref("material_over")) ? await query<{
    id:number; name:string; unit:string|null; qtyPlanned:number; qtyUsed:number; sheetCode:string|null;
  }>(
    `SELECT m.id, m.name, m.unit, m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed", st.code AS "sheetCode"
       FROM materials m LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
      WHERE m.qty_planned > 0 AND m.qty_used > m.qty_planned
      ORDER BY (m.qty_used - m.qty_planned) DESC`) : [];

  return NextResponse.json({
    overdue, dueSoon, upcomingStart, recentActivity, materialOver,
    fullAccess, role: user.role, prefs,
  });
}
