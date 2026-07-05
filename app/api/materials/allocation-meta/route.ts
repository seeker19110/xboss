import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/materials/allocation-meta → danh sách tầng/tổ đội đã dùng trước đây,
// gợi ý datalist khi cấp phát vật tư (M4) — không cần vai trò riêng, chỉ cần đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const floors = await query<{ floorLabel: string }>(
    `SELECT DISTINCT floor_label AS "floorLabel" FROM material_transactions
      WHERE floor_label IS NOT NULL ORDER BY 1`,
  );
  const crews = await query<{ crew: string }>(
    `SELECT DISTINCT crew FROM material_transactions
      WHERE crew IS NOT NULL ORDER BY 1`,
  );
  return NextResponse.json({
    floors: floors.map((f) => f.floorLabel),
    crews: crews.map((c) => c.crew),
  });
}
