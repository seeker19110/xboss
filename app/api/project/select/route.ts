import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PROJECT_COOKIE, visibleProjectIds } from "@/lib/projects";

export const dynamic = "force-dynamic";

// POST /api/project/select — đặt cookie xboss_project sau khi đối chiếu quyền thấy
// (visibleProjectIds); 403 nếu user không được thấy dự án yêu cầu. Body: { projectId }.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const projectId = Number(body?.projectId);
  if (!Number.isFinite(projectId))
    return NextResponse.json({ error: "Thiếu dự án" }, { status: 400 });

  const visible = await visibleProjectIds(user);
  if (!visible.includes(projectId))
    return NextResponse.json({ error: "Bạn không có quyền xem dự án này" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PROJECT_COOKIE, String(projectId), {
    httpOnly: false, // client cũng cần đọc để đồng bộ UI, không mang thông tin nhạy cảm
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
