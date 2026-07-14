import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { normUsage } from "@/lib/norms";

export const dynamic = "force-dynamic";

// GET /api/boq/:id/norm-usage — đối chiếu expected/actual/variancePct từng định mức
// của dòng BOQ. Mọi user xem được (khớp quyền xem BOQ).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const boqItemId = parseInt(params.id);
  if (isNaN(boqItemId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const boqItem = await queryOne<{ id: number }>(
    `SELECT id FROM boq_items WHERE id = ?${projectId != null ? " AND project_id = ?" : ""}`,
    boqItemId,
    ...(projectId != null ? [projectId] : []),
  );
  if (!boqItem) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const usage = await normUsage(boqItemId);
  return NextResponse.json({ usage });
}
