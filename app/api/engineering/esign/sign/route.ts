import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { executeSignEnvelope } from "@/lib/engineering-esignature";

export const dynamic = "force-dynamic";

// POST /api/engineering/esign/sign
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền ký số tài liệu" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (!body.envelopeId || !body.signatoryId || !body.signatureData) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (envelopeId, signatoryId, signatureData)" },
        { status: 422 },
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for") || "127.0.0.1";

    const result = await executeSignEnvelope({
      projectId,
      envelopeId: body.envelopeId,
      signatoryId: body.signatoryId,
      signatureData: body.signatureData,
      otpCode: body.otpCode,
      ipAddress,
      geoLocation: body.geoLocation,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
