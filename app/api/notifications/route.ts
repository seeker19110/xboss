import { NextResponse } from "next/server";
import { query, run, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/notifications
// Đồng bộ task trễ → notifications cho user hiện tại, rồi trả về danh sách + số chưa đọc.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();

  // Task đang trễ mà user này chưa có thông báo → tạo mới (UNIQUE chặn trùng).
  const delayed = await query<{ id: number; code: string; name: string; endDate: string; sheetType: string }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')`, today);

  for (const t of delayed) {
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message)
       VALUES (?, ?, 'delayed', ?)
       ON CONFLICT (user_id, task_id, type) DO NOTHING`,
      user.id, t.id, `[${t.sheetType}] ${t.code} — ${t.name} đã quá hạn ${t.endDate}`);
  }

  // Task hết trễ (đã hoàn thành/nghiệm thu) → dọn thông báo cũ chưa đọc.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'delayed' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t
           WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
             AND t.status NOT IN ('hoan_thanh','nghiem_thu'))`,
    user.id, today);

  const items = await query<{
    id: number; taskId: number | null; type: string; message: string; isRead: number; createdAt: string;
  }>(
    `SELECT id, task_id AS "taskId", type, message, is_read AS "isRead", created_at AS "createdAt"
       FROM notifications WHERE user_id = ?
      ORDER BY is_read ASC, created_at DESC, id DESC LIMIT 50`, user.id);

  const unread = items.filter((n) => !n.isRead).length;
  return NextResponse.json({ notifications: items, unread });
}

// POST /api/notifications  body: { markAllRead: true } → đánh dấu tất cả đã đọc.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.markAllRead) {
    await run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, user.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Thiếu hành động" }, { status: 400 });
}
