import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { heartbeat, getOnlineUsers } from "@/lib/presence";

export const dynamic = "force-dynamic";

// POST /api/presence — heartbeat của user đang mở app
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  heartbeat(user);
  return NextResponse.json({ ok: true });
}

// GET /api/presence — chỉ admin
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ users: getOnlineUsers() });
}
