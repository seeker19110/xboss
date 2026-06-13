import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sheetVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

// GET /api/tasks/version?sheet=ogtd → watermark thay đổi của sheet (poll nhẹ cho đồng bộ đa user).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("sheet");
  if (!slug) return NextResponse.json({ error: "Sheet không hợp lệ" }, { status: 400 });

  return NextResponse.json({ v: await sheetVersion(slug) });
}
