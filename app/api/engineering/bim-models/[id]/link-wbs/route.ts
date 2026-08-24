import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { run, queryOne } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringBim(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thao tác liên kết WBS của mô hình BIM" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const { id: modelId } = await context.params;

  try {
    const body = await req.json();
    const { links } = body; // Array of { elementId?: string, guid?: string, wbsTaskId: number | null }

    if (!Array.isArray(links) || links.length === 0) {
      return NextResponse.json(
        { error: "Danh sách liên kết 'links' là bắt buộc" },
        { status: 422 },
      );
    }

    let updatedCount = 0;
    for (const link of links) {
      if (link.elementId) {
        const res = await run(
          `UPDATE engineering_bim_elements
           SET wbs_task_id = ?
           WHERE id = ? AND model_id = ? AND project_id = ?`,
          link.wbsTaskId,
          link.elementId,
          modelId,
          projectId,
        );
        updatedCount += res.changes;
      } else if (link.guid) {
        const res = await run(
          `UPDATE engineering_bim_elements
           SET wbs_task_id = ?
           WHERE guid = ? AND model_id = ? AND project_id = ?`,
          link.wbsTaskId,
          link.guid,
          modelId,
          projectId,
        );
        updatedCount += res.changes;
      }
    }

    return NextResponse.json({
      success: true,
      modelId,
      updatedCount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Lỗi cập nhật liên kết WBS" },
      { status: 500 },
    );
  }
}
