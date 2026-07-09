import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { systemStatus } from "@/lib/tech";

export const dynamic = "force-dynamic";

// GET /api/tech/system-status — dung lượng lưu trữ, trạng thái sao lưu, phiên bản
// cache SW. Chỉ Admin xem (nhạy cảm hơn PM — panel "Hệ thống" trên /tech).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin xem được trạng thái hệ thống" }, { status: 403 });

  const status = await systemStatus();
  return NextResponse.json(status);
}
