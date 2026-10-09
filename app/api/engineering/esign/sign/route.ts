import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { executeSignEnvelope } from "@/lib/ky-thuat/engineering-esignature";
import { phanHoiLoi } from "@/lib/nen/loi";

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
    const chot = await chotProjectIdChoGhi(user, body.projectId, await getCurrentProjectId(user));
    if (!chot.ok) {
      return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    }
    const projectId = chot.projectId;

    if (!body.envelopeId || !body.signatoryId || !body.signatureData) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (envelopeId, signatoryId, signatureData)" },
        { status: 422 },
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for") || "127.0.0.1";

    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.signEngineeringEsign(user.role),
      () =>
        executeSignEnvelope({
          projectId,
          userId: user.id,
          envelopeId: body.envelopeId,
          signatoryId: body.signatoryId,
          signatureData: body.signatureData,
          otpCode: body.otpCode,
          ipAddress,
          geoLocation: body.geoLocation,
        }),
    );
    if (!kq.ok)
      return NextResponse.json({ error: "Không có quyền ký số tài liệu" }, { status: 403 });
    const result = kq.value;

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    // EsignSignError kế thừa LoiNghiepVu nên phanHoiLoi giữ nguyên 403/409/422 của nó.
    return phanHoiLoi(err);
  }
}
