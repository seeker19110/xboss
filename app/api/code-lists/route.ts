import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getList } from "@/lib/code-lists";

export const dynamic = "force-dynamic";

// GET /api/code-lists?domain=delay_reason — đọc danh mục mềm (mọi vai trò đã đăng nhập).
// Mặc định chỉ trả mục đang bật; thêm &all=1 để lấy cả mục đã tắt.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "Thiếu tham số domain" }, { status: 400 });

  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  const items = await getList(domain, { includeInactive });
  return NextResponse.json({ items });
}
