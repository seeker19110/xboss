import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { updateSpoolProgressStage, SpoolStatus } from "@/lib/engineering-cad-qto";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad-qto/progress — Cập nhật mốc tiến độ phân đoạn Spool
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền cập nhật tiến độ Spool" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const { spoolId, newStatus } = body;

    if (!spoolId || !newStatus) {
      return NextResponse.json({ error: "Cần cung cấp spoolId và newStatus" }, { status: 422 });
    }

    const updated = await updateSpoolProgressStage(projectId, spoolId, newStatus as SpoolStatus);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy Spool" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      spool: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
