import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { lichSuBoq } from "@/lib/khoi-luong/boq-history";

export const dynamic = "force-dynamic";

// GET /api/boq/:id/history — lịch sử thay đổi 1 dòng BOQ (M124 việc 3). Mọi vai trò đăng
// nhập xem được BOQ (không cần quyền sửa) đều xem được lịch sử, tối đa 100 dòng gần nhất.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const existing =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM boq_items WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const rows = await lichSuBoq(id);
  return NextResponse.json({ rows });
}
