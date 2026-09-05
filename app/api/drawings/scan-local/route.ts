// app/api/drawings/scan-local/route.ts — Quét và đồng bộ bản vẽ từ thư mục cục bộ data/uploads/drawings.
// Ranh giới HTTP thuần (ADR-0008): logic quét nằm ở lib/ky-thuat/drawings-scan.ts, dùng chung với
// script CLI scripts/scan-drawings.ts.
import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { DRAWINGS_DIR, syncDrawingsFromDisk } from "@/lib/ky-thuat/drawings-scan";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role) && !CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Bạn không có quyền đồng bộ bản vẽ" }, { status: 403 });
  }

  if (!existsSync(DRAWINGS_DIR)) {
    return NextResponse.json(
      { error: "Thư mục data/uploads/drawings chưa tồn tại trên máy chủ" },
      { status: 404 },
    );
  }

  const projectId = (await getCurrentProjectId(user)) || 1;
  const res = await syncDrawingsFromDisk({ projectId, userId: user.id });

  return NextResponse.json({
    ok: true,
    totalFilesOnDisk: res.totalFilesOnDisk,
    newlySyncedRevisions: res.newlySyncedRevisions,
    message: `Đã quét và đồng bộ ${res.newlySyncedRevisions} bản vẽ mới (${res.totalFilesOnDisk} tệp trên đĩa) vào hệ thống.`,
  });
}
