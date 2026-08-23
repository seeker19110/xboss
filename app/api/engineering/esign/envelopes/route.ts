import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { createEsignEnvelope, listEsignEnvelopes } from "@/lib/ky-thuat/engineering-esignature";

export const dynamic = "force-dynamic";

// GET /api/engineering/esign/envelopes
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem danh sách hồ sơ trình ký" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);

  try {
    const envelopes = await listEsignEnvelopes(projectId);
    return NextResponse.json({ success: true, data: envelopes });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/esign/envelopes
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền khởi tạo hồ sơ trình ký" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (!body.title || !body.documentType || !body.documentPayload || !body.signatories?.length) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (title, documentType, documentPayload, signatories)" },
        { status: 422 },
      );
    }

    const envelope = await createEsignEnvelope({
      projectId,
      title: body.title,
      documentType: body.documentType,
      referenceId: body.referenceId ? Number(body.referenceId) : null,
      referenceCode: body.referenceCode || null,
      documentPayload: body.documentPayload,
      signatories: body.signatories,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: envelope });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
