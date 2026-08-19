import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { auditEngineeringElement } from "@/lib/engineering-prescriptive";

export const dynamic = "force-dynamic";

// POST /api/engineering/compliance/audit-element — Kiểm tra đối soát tức thì một đối tượng với quy chuẩn
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringCompliance(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện kiểm tra quy chuẩn" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    if (!body.objectId || !body.ruleId) {
      return NextResponse.json(
        { error: "Thiếu trường bắt buộc: objectId, ruleId" },
        { status: 400 },
      );
    }

    const audit = await auditEngineeringElement(projectId, body.objectId, body.ruleId);
    return NextResponse.json({ success: true, audit }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
