import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { EsignSignError, executeSignEnvelope } from "@/lib/ky-thuat/engineering-esignature";

export const dynamic = "force-dynamic";

// POST /api/engineering/esign/sign
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.signEngineeringEsign(user.role)) {
    return NextResponse.json({ error: "Không có quyền ký số tài liệu" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu với danh sách dự án user được thấy.
    const chot = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chot.ok) {
      return NextResponse.json({ error: "Không có quyền ghi vào dự án này" }, { status: 403 });
    }
    const projectId = chot.projectId;

    if (!body.envelopeId || !body.signatoryId || !body.signatureData) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (envelopeId, signatoryId, signatureData)" },
        { status: 422 },
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for") || "127.0.0.1";

    const result = await executeSignEnvelope({
      projectId,
      userId: user.id,
      envelopeId: body.envelopeId,
      signatoryId: body.signatoryId,
      signatureData: body.signatureData,
      otpCode: body.otpCode,
      ipAddress,
      geoLocation: body.geoLocation,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    if (err instanceof EsignSignError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
