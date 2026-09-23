import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";

export const dynamic = "force-dynamic";

// GET /api/materials/allocation-meta → danh sách tầng/tổ đội đã dùng trước đây,
// gợi ý datalist khi cấp phát vật tư (M4) — không cần vai trò riêng, chỉ cần đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  // Lọc theo dự án đang chọn qua materials.project_id — trước đây quét toàn bảng nên gợi ý lẫn
  // tầng/tổ đội của dự án khác (lộ dữ liệu chéo dự án, M22).
  if (projectId == null) return NextResponse.json({ floors: [], crews: [] });
  const floors = await query<{ floorLabel: string }>(
    `SELECT DISTINCT t.floor_label AS "floorLabel"
       FROM material_transactions t JOIN materials m ON m.id = t.material_id
      WHERE t.floor_label IS NOT NULL AND m.project_id = ? ORDER BY 1`,
    projectId,
  );
  const crews = await query<{ crew: string }>(
    `SELECT DISTINCT t.crew
       FROM material_transactions t JOIN materials m ON m.id = t.material_id
      WHERE t.crew IS NOT NULL AND m.project_id = ? ORDER BY 1`,
    projectId,
  );
  return NextResponse.json({
    floors: floors.map((f) => f.floorLabel),
    crews: crews.map((c) => c.crew),
  });
}
