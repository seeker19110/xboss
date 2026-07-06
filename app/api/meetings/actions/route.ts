import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { openMeetingActions } from "@/lib/meetings";

export const dynamic = "force-dynamic";

// GET /api/meetings/actions?open=1 — action sau họp đang mở được giao cho user
// hiện tại (mục "Việc sau họp" ở /my-tasks). Mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const actions = await openMeetingActions(user.id);
  return NextResponse.json({ actions });
}
