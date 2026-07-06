import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureWorkFronts, listWorkFronts } from "@/lib/workfronts";

export const dynamic = "force-dynamic";

// GET /api/work-fronts?sheetTypeId= — trạng thái mặt bằng mọi tầng (hoặc 1 sheet).
// Mọi vai trò đăng nhập đều xem được (khớp lưới tracking).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await ensureWorkFronts();

  const sp = req.nextUrl.searchParams;
  const sheetTypeId = sp.get("sheetTypeId") ? Number(sp.get("sheetTypeId")) : undefined;
  const workFronts = await listWorkFronts(sheetTypeId);
  return NextResponse.json({ workFronts });
}
