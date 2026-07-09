import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { packagesWithQcBlock } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

// GET /api/workpackages/qc-status?sheetTypeId= — nhóm nào đang bị hold-point chuyển bước QC
// (M3), chỉ để hiện icon cảnh báo trên lưới tracking. Mọi vai trò đăng nhập đều xem được
// (khớp /api/work-fronts).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const raw = sp.get("sheetTypeId");
  const sheetTypeId = raw ? Number(raw) : NaN;
  if (!raw || !Number.isFinite(sheetTypeId)) {
    return NextResponse.json({ error: "sheetTypeId không hợp lệ" }, { status: 422 });
  }

  const blocked = await packagesWithQcBlock(sheetTypeId);
  return NextResponse.json({ blocked });
}
