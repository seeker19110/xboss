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
  // Sub-con chỉ nhận thông báo cho task được giao.
  const subconFilter = user.role === "subcon" ? `AND t.assigned_to = ${user.id}` : "";
  const delayed = await query<{ id: number; code: string; name: string; endDate: string; sheetType: string }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu') ${subconFilter}`, today);

  for (const t of delayed) {
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message)
       VALUES (?, ?, 'delayed', ?)
       ON CONFLICT (user_id, task_id, type) DO NOTHING`,
      user.id, t.id, `[${t.sheetType}] ${t.code} — ${t.name} đã quá hạn ${t.endDate}`);
  }

  // Sắp đến hạn: deadline còn ≤3 ngày mà tiến độ < 70% → cảnh báo sớm trước khi thành trễ.
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const DUE_SOON_COND = `t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < 0.7 AND t.status NOT IN ('hoan_thanh','nghiem_thu')`;
  const dueSoon = await query<{ id: number; code: string; name: string; endDate: string; sheetType: string }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE ${DUE_SOON_COND} ${subconFilter}`, today, soon);

  for (const t of dueSoon) {
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message)
       VALUES (?, ?, 'due_soon', ?)
       ON CONFLICT (user_id, task_id, type) DO NOTHING`,
      user.id, t.id, `⏳ [${t.sheetType}] ${t.code} — ${t.name} sắp đến hạn ${t.endDate} (tiến độ < 70%)`);
  }

  // Task hết trễ (hoặc không còn được giao cho mình) → dọn thông báo cũ chưa đọc.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'delayed' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t
           WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
             AND t.status NOT IN ('hoan_thanh','nghiem_thu') ${subconFilter})`,
    user.id, today);

  // Task không còn "sắp đến hạn" (đã xong, đã qua hạn thành trễ, hoặc đổi deadline) → dọn tương tự.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'due_soon' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t WHERE ${DUE_SOON_COND} ${subconFilter})`,
    user.id, today, soon);

  // Vật tư dùng vượt định mức → cảnh báo cho Admin/PM/Kỹ sư (subcon không quản vật tư).
  if (user.role !== "subcon") {
    const overMats = await query<{ id: number; name: string; unit: string | null; qtyPlanned: number; qtyUsed: number; sheetCode: string | null }>(
      `SELECT m.id, m.name, m.unit, m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed", st.code AS "sheetCode"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
        WHERE m.qty_planned > 0 AND m.qty_used > m.qty_planned`);

    for (const m of overMats) {
      await run(
        `INSERT INTO notifications (user_id, material_id, type, message)
         VALUES (?, ?, 'material_over', ?)
         ON CONFLICT (user_id, material_id, type) WHERE material_id IS NOT NULL DO NOTHING`,
        user.id, m.id,
        `📦 Vật tư "${m.name}"${m.sheetCode ? ` [${m.sheetCode}]` : ""} vượt định mức: ${m.qtyUsed}/${m.qtyPlanned}${m.unit ? ` ${m.unit}` : ""}`);
    }

    // Đã điều chỉnh định mức/số dùng về ngưỡng an toàn (hoặc vật tư bị xoá) → dọn cảnh báo chưa đọc.
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'material_over' AND is_read = 0
          AND material_id NOT IN (
            SELECT id FROM materials WHERE qty_planned > 0 AND qty_used > qty_planned)`,
      user.id);
  }

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
