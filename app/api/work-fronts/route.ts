import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { ensureWorkFronts, listWorkFronts } from "@/lib/tien-do/workfronts";

export const dynamic = "force-dynamic";

// GET /api/work-fronts?sheetTypeId= — trạng thái mặt bằng mọi tầng (hoặc 1 sheet).
// Mọi vai trò đăng nhập đều xem được (khớp lưới tracking).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  await ensureWorkFronts();

  const sp = req.nextUrl.searchParams;
  const sheetTypeId = sp.get("sheetTypeId") ? Number(sp.get("sheetTypeId")) : undefined;
  const workFronts = await listWorkFronts(sheetTypeId);
  return NextResponse.json({ workFronts });
}
