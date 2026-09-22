import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { cacTangCuaHe, taskTheoTang } from "@/lib/khoi-luong/boq-map-tang";

export const dynamic = "force-dynamic";

// GET /api/boq/:id/tasks-theo-tang?floor=<label> — gợi ý task cùng hệ ở một tầng để thêm nhanh
// vào map của dòng BOQ (M124 việc 1). Thiếu `floor` ⇒ chỉ trả danh sách tầng để UI dựng select.
// Quyền giống PUT /api/boq/:id/map (chỉ Admin/PM) vì đây là bước soạn map, không phải xem BOQ.
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Không có quyền sửa map (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const item =
    projectId != null
      ? await queryOne<{ id: number; name: string; system_id: number | null }>(
          `SELECT id, name, system_id FROM boq_items WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!item || projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const floors = await cacTangCuaHe(projectId, item.system_id);
  const floor = req.nextUrl.searchParams.get("floor");
  if (!floor) return NextResponse.json({ floors, tasks: [] });

  const tasks = await taskTheoTang({
    projectId,
    systemId: item.system_id,
    floorLabel: floor,
    tenDongBoq: item.name,
  });
  return NextResponse.json({ floors, tasks });
}
