import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { updateDeviationRemediation, RemediationStatus } from "@/lib/engineering-twin-pinnacle";

export const dynamic = "force-dynamic";

// POST /api/engineering/twin/deviations/[id]/remediate — Cập nhật trạng thái khắc phục sai lệch
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền cập nhật xử lý sai lệch" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const validStatuses: RemediationStatus[] = [
      "open",
      "acknowledged",
      "remediated",
      "accepted_as_built",
      "rejected",
    ];
    if (!body.status || !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Trạng thái không hợp lệ. Phải là một trong: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    const updated = await updateDeviationRemediation(projectId, id, body.status, body.suggestionId);
    if (!updated) {
      return NextResponse.json({ error: "Không tìm thấy bản ghi sai lệch" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deviation: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
