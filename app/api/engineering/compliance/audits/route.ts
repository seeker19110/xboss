import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getComplianceAudits } from "@/lib/engineering-prescriptive";

export const dynamic = "force-dynamic";

// GET /api/engineering/compliance/audits — Truy vấn danh sách biên bản kiểm định & hồ sơ NCR
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringCompliance(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem biên bản kiểm định quy chuẩn" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const domain = searchParams.get("domain") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;

    const audits = await getComplianceAudits(projectId, { status, domain, limit });
    return NextResponse.json(audits);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
