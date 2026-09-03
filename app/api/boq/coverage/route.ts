import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { doPhuBoq } from "@/lib/khoi-luong/boq-coverage";

export const dynamic = "force-dynamic";

// GET /api/boq/coverage?system=<code> — độ phủ ánh xạ BOQ↔task (M122 PR1).
// Chỉ trả số đếm/tỷ lệ, không trả tiền → mở cho mọi vai trò xem được BOQ,
// cùng phạm vi dự án và cùng feature-flag với GET /api/boq.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const system = req.nextUrl.searchParams.get("system")?.trim() || null;
  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  return NextResponse.json(await doPhuBoq({ projectId, systemCode: system }));
}
