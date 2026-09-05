import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  createMaterialShipment,
  listMaterialShipments,
} from "@/lib/ky-thuat/engineering-qr-logistics";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/logistics/shipments
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập logistics" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query.
  const projectId = (await getCurrentProjectId(user)) || 1;
  const status = searchParams.get("status") || undefined;

  try {
    const shipments = await listMaterialShipments(projectId, status);
    return NextResponse.json({ success: true, data: shipments });
  } catch (err: unknown) {
    return phanHoiLoi(err);
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
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

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
    return phanHoiLoi(err);
  }
}
