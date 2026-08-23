import { NextResponse } from "next/server";
import { run, withProjectScope } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { syncAndListNotifications } from "@/lib/dich-vu/thong-bao";

export const dynamic = "force-dynamic";

// GET /api/notifications?limit=<n>
// Đồng bộ task trễ → notifications cho user hiện tại, rồi trả về danh sách + số chưa đọc.
// `limit` mặc định 50 (đủ cho dropdown chuông); trang `/notifications/all` truyền limit lớn
// hơn để không bị cắt bớt trong lúc lọc/tìm kiếm/phân trang phía client.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 50;

  // Dự án đang chọn — lọc mọi cảnh báo theo dự án để tránh rò rỉ chéo dự án (đa dự án, M22+).
  // null = DB chưa có project nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);

  // Bọc toàn bộ phần đọc-ghi trong 1 transaction có GUC app.project_id đúng (M62 PR1) —
  // policy RLS trên 11 bảng tài chính chỉ lọc đúng khi có GUC. readOnly:false vì route này
  // xen kẽ INSERT/DELETE trên notifications (bảng không-RLS) sau mỗi khối đọc. projectId
  // null (DB chưa có project) → GUC '*' (hành vi y hệt trước — không lọc gì).
  const data = await withProjectScope(
    projectId ?? "*",
    () => syncAndListNotifications(user, projectId, limit),
    { readOnly: false },
  );
  return NextResponse.json(data);
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
