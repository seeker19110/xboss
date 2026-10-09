import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { createEsignEnvelope, listEsignEnvelopes } from "@/lib/ky-thuat/engineering-esignature";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/esign/envelopes
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem danh sách hồ sơ trình ký" },
      { status: 403 },
    );
  }

  // projectId lấy từ phiên, KHÔNG nhận từ query — nhận từ client là IDOR đọc chéo dự án.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  try {
    const envelopes = await listEsignEnvelopes(projectId);
    return NextResponse.json({ success: true, data: envelopes });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/esign/envelopes
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền khởi tạo hồ sơ trình ký" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Chốt projectId theo phiên; chỉ chấp nhận dự án client chỉ định nếu nằm trong
    // danh sách dự án người dùng được phép thấy (chặn ghi chéo dự án).
    const chot = await chotProjectIdChoGhi(user, body.projectId, await getCurrentProjectId(user));
    if (!chot.ok) {
      return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    }
    const projectId = chot.projectId;

    if (!body.title || !body.documentType || !body.documentPayload || !body.signatories?.length) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (title, documentType, documentPayload, signatories)" },
        { status: 422 },
      );
    }

    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageEngineeringGraph(user.role),
      () =>
        createEsignEnvelope({
          projectId,
          title: body.title,
          documentType: body.documentType,
          referenceId: body.referenceId ? Number(body.referenceId) : null,
          referenceCode: body.referenceCode || null,
          documentPayload: body.documentPayload,
          signatories: body.signatories,
          createdBy: user.id,
        }),
    );
    if (!kq.ok)
      return NextResponse.json(
        { error: "Không có quyền khởi tạo hồ sơ trình ký" },
        { status: 403 },
      );
    const envelope = kq.value;

    return NextResponse.json({ success: true, data: envelope });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
