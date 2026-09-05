import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { visibleProjectIds } from "@/lib/ha-tang/projects";
import { packagesWithQcBlock } from "@/lib/ky-thuat/qaqc";

export const dynamic = "force-dynamic";

// Dự án của 1 sheet — suy qua sheet_types.tower_id → towers.project_id (vá W0).
async function sheetTypeProjectId(id: number): Promise<number | null> {
  const row = await queryOne<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM sheet_types st
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE st.id = ?`,
    id,
  );
  return row?.projectId ?? null;
}

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

  // Chống dò thông tin QC xuyên dự án (vá W0).
  const visible = await visibleProjectIds(user);
  const pid = await sheetTypeProjectId(sheetTypeId);
  if (pid == null || !visible.includes(pid))
    return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

  const blocked = await packagesWithQcBlock(sheetTypeId);
  return NextResponse.json({ blocked });
}
