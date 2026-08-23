import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  updateAnnotationStatus,
  linkAnnotationToEntity,
} from "@/lib/ky-thuat/engineering-spatial-pinning";
import { query, withProjectScope } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/engineering/spatial/annotations/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền cập nhật điểm ghim không gian" },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "ID điểm ghim không hợp lệ" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (body.status) {
      await updateAnnotationStatus(projectId, id, body.status, body.resolutionNote);
    }

    if (body.entityRefType && body.entityRefId) {
      await linkAnnotationToEntity(projectId, id, body.entityRefType, body.entityRefId);
    }

    return NextResponse.json({
      success: true,
      id,
      updated: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/engineering/spatial/annotations/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xoá điểm ghim không gian" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);

  try {
    await withProjectScope(projectId, async () => {
      await query(
        `DELETE FROM engineering_spatial_annotations WHERE id = ? AND project_id = ?`,
        id,
        projectId,
      );
    });

    return NextResponse.json({
      success: true,
      id,
      deleted: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
