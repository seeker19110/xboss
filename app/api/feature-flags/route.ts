import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getModuleFlags } from "@/lib/ha-tang/feature-flags";

export const dynamic = "force-dynamic";

// GET /api/feature-flags — mọi user đăng nhập: bản đồ module → bật/tắt cho dự án đang
// chọn (M22), dùng để AppHeader ẩn nav của module tắt. Chưa chọn được dự án (DB trống)
// → coi mọi module bật (tương thích ngược).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const flags = projectId != null ? await getModuleFlags(projectId) : new Map<string, boolean>();
  return NextResponse.json(
    { flags: Object.fromEntries(flags) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
