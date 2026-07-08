import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PROJECT_COOKIE, visibleProjectIds } from "@/lib/projects";

export const dynamic = "force-dynamic";

// POST /api/project/select  body: { projectId } — đặt cookie xboss_project sau khi đối
// chiếu quyền (project switcher, M22 PR2). 403 nếu user không thấy được dự án đó —
// không tin client, luôn đối chiếu visibleProjectIds.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.projectId);
  if (!Number.isFinite(projectId))
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 422 });

  const visible = await visibleProjectIds(user);
  if (!visible.includes(projectId))
    return NextResponse.json({ error: "Bạn không có quyền xem dự án này" }, { status: 403 });

  const res = NextResponse.json({ ok: true, projectId });
  res.cookies.set(PROJECT_COOKIE, String(projectId), {
    httpOnly: true,
    path: "/",
    maxAge: 400 * 86400, // ~lâu dài, không gắn với phiên đăng nhập (chỉ đổi khi user tự chọn lại)
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
