import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId } from "@/lib/db";
import { getCurrentUser, canTouchTask } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";
import { slugFromCode } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/comments → danh sách bình luận (mới nhất cuối — đọc như chat).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const comments = await query(
    `SELECT c.id, c.body, c.created_at AS "createdAt",
            c.user_id AS "userId", u.name AS "userName", u.role AS "userRole"
       FROM task_comments c
       LEFT JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ? ORDER BY c.id`, taskId);
  return NextResponse.json({ comments });
}

// POST /api/tasks/:id/comments  body: { body } → thêm bình luận + thông báo cho người liên quan.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number; code: string; name: string; assigned_to: number | null }>(
    `SELECT id, code, name, assigned_to FROM tasks WHERE id = ?`, taskId);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json({ error: "Bạn chỉ được bình luận task được giao cho mình" }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const body = String(payload.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "Nội dung bình luận trống" }, { status: 400 });
  if (body.length > 2000) return NextResponse.json({ error: "Bình luận quá dài (tối đa 2000 ký tự)" }, { status: 413 });

  const id = await insertId(
    `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)`, taskId, user.id, body);

  // Người nhận thông báo: người được giao task + những ai từng bình luận (trừ chính mình).
  const related = await query<{ uid: number }>(
    `SELECT DISTINCT user_id AS uid FROM task_comments WHERE task_id = ? AND user_id IS NOT NULL
     UNION SELECT assigned_to FROM tasks WHERE id = ? AND assigned_to IS NOT NULL`, taskId, taskId);
  const recipients = related.map((r) => r.uid).filter((uid) => uid && uid !== user.id);

  const preview = body.length > 80 ? body.slice(0, 77) + "..." : body;
  for (const uid of recipients) {
    // Cùng task có thể có nhiều bình luận — UNIQUE(user,task,type) nên cập nhật message + đánh dấu chưa đọc.
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message)
       VALUES (?, ?, 'comment', ?)
       ON CONFLICT (user_id, task_id, type)
       DO UPDATE SET message = EXCLUDED.message, is_read = 0, created_at = NOW()`,
      uid, taskId, `💬 ${user.name} bình luận ${task.code}: ${preview}`);
  }

  // Web Push tới điện thoại người liên quan (no-op nếu chưa cấu hình VAPID).
  if (recipients.length > 0) {
    const sheet = await queryOne<{ code: string }>(
      `SELECT st.code FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
        WHERE t.id = ?`, taskId);
    const slug = sheet ? slugFromCode(sheet.code) : null;
    await sendPushToUsers(recipients, {
      title: `💬 ${user.name} — ${task.code}`,
      body: preview,
      url: slug ? `/tracking/${slug}` : "/",
    }).catch(() => { /* push lỗi không được chặn việc lưu bình luận */ });
  }

  const comment = await queryOne(
    `SELECT c.id, c.body, c.created_at AS "createdAt",
            c.user_id AS "userId", u.name AS "userName", u.role AS "userRole"
       FROM task_comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`, id);
  return NextResponse.json({ comment }, { status: 201 });
}
