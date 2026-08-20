// app/api/engineering/zero-error/issue-certificate/route.ts — Cấp Chứng chỉ Kiểm toán Bất biến Zero-Error
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  generateZeroErrorAuditCertificate,
  type ZeroErrorAuditPayload,
} from "@/lib/engineering-zero-error-tracker";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền cấp chứng chỉ kiểm toán" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const payload: ZeroErrorAuditPayload = {
      projectId,
      zone: body.zone || "Zone 1 (Tầng 12 Tháp A)",
      taskIds: Array.isArray(body.taskIds) ? body.taskIds : ["TASK-ZE-01", "TASK-ZE-02"],
      reconciledQty: parseFloat(body.reconciledQty ?? "120"),
      inspectorUserId: user.id,
      consultantUserId: parseInt(body.consultantUserId ?? "2", 10),
      clientUserId: parseInt(body.clientUserId ?? "3", 10),
      challengeCode: String(body.challengeCode ?? "#XB-LIVE"),
      gpsCoords: {
        lat: parseFloat(body.lat ?? "10.7769"),
        lon: parseFloat(body.lon ?? "106.7009"),
      },
    };

    const certificate = generateZeroErrorAuditCertificate(payload);

    return NextResponse.json({
      success: true,
      certificate,
      auditPayload: payload,
      message: "Đã niêm phong chứng chỉ kiểm toán bất biến vào Sổ cái Merkle Tree thành công.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
