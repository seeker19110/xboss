import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { PROJECT_COOKIE, chotProjectIdChoDoc } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// Cùng chính sách đọc: vừa được thấy dự án, vừa phải cùng tổ chức hiện tại.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rawProjectId = body?.projectId;
  const projectId = Number(rawProjectId);
  if (
    (typeof rawProjectId !== "number" && typeof rawProjectId !== "string") ||
    !Number.isSafeInteger(projectId) ||
    projectId <= 0
  )
    return NextResponse.json({ error: "Thiếu dự án hợp lệ" }, { status: 400 });

  const scope = await chotProjectIdChoDoc(user, projectId);
  if (!scope.ok)
    return NextResponse.json({ error: "Bạn không có quyền xem dự án này" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PROJECT_COOKIE, String(scope.projectId), {
    httpOnly: false, // Chỉ là lựa chọn UI; server luôn kiểm lại quyền và tổ chức.
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
