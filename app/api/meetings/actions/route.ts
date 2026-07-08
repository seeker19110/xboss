import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { openMeetingActions } from "@/lib/meetings";

export const dynamic = "force-dynamic";

// GET /api/meetings/actions?open=1 — action sau họp đang mở được giao cho user
// hiện tại (mục "Việc sau họp" ở /my-tasks), scoped theo dự án đang chọn (M22).
// Mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const actions = projectId != null ? await openMeetingActions(user.id, projectId) : [];
  return NextResponse.json({ actions });
}
