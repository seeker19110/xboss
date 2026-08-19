import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { scanReceiveQrTag, reconcileShipmentReceiving } from "@/lib/engineering-qr-logistics";

export const dynamic = "force-dynamic";

// POST /api/engineering/logistics/scan-receive
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền quét nhận vật tư" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);
    const { qrCode, locationNote, manifest = [] } = body;

    if (!qrCode) {
      return NextResponse.json({ error: "Thiếu mã QR" }, { status: 422 });
    }

    const tagRecord = await scanReceiveQrTag({
      projectId,
      qrCode,
      userId: user.id,
      locationNote,
    });

    let reconciliation = null;
    if (manifest.length > 0) {
      reconciliation = reconcileShipmentReceiving(manifest, [
        { itemCode: tagRecord.itemCode, quantity: Number(tagRecord.quantity) },
      ]);
    }

    return NextResponse.json({
      success: true,
      data: {
        tagRecord,
        reconciliation,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
