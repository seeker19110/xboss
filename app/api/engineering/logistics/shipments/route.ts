import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { createMaterialShipment, listMaterialShipments } from "@/lib/engineering-qr-logistics";

export const dynamic = "force-dynamic";

// GET /api/engineering/logistics/shipments
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập logistics" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);
  const status = searchParams.get("status") || undefined;

  try {
    const shipments = await listMaterialShipments(projectId, status);
    return NextResponse.json({ success: true, data: shipments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/logistics/shipments
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo lô hàng" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (
      !body.shipmentCode ||
      !body.doNumber ||
      !body.poNumber ||
      !body.supplierName ||
      !Array.isArray(body.manifest)
    ) {
      return NextResponse.json(
        {
          error:
            "Thiếu các trường bắt buộc (shipmentCode, doNumber, poNumber, supplierName, manifest)",
        },
        { status: 422 },
      );
    }

    const shipment = await createMaterialShipment({
      projectId,
      shipmentCode: body.shipmentCode,
      doNumber: body.doNumber,
      poNumber: body.poNumber,
      supplierName: body.supplierName,
      manifest: body.manifest,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: shipment });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
