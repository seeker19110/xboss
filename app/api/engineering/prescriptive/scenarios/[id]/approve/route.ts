import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { approvePrescriptiveScenario } from "@/lib/engineering-prescriptive";

export const dynamic = "force-dynamic";

// POST /api/engineering/prescriptive/scenarios/[id]/approve — Phê duyệt kịch bản tối ưu
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringPrescriptive(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền phê duyệt kịch bản Prescriptive" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const updated = await approvePrescriptiveScenario(projectId, params.id, user.id);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy kịch bản cần phê duyệt" }, { status: 404 });
    }

    return NextResponse.json({ success: true, scenario: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
