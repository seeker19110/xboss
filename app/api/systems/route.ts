import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listSystems } from "@/lib/systems";

export const dynamic = "force-dynamic";

// GET /api/systems — danh mục hệ + số sheet + % tiến độ tổng (mọi user đăng nhập
// xem được — dùng cho sidebar "Hệ thi công" + card hệ trên dashboard).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const systems = await listSystems();
  return NextResponse.json({ systems });
}
