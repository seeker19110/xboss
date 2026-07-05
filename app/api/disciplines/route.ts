import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listDisciplines } from "@/lib/disciplines";

export const dynamic = "force-dynamic";

// GET /api/disciplines — danh mục hệ + số sheet + % tiến độ tổng (mọi user đăng nhập
// xem được — dùng cho sidebar "Hệ thi công" + card hệ trên dashboard).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const disciplines = await listDisciplines();
  return NextResponse.json({ disciplines });
}
