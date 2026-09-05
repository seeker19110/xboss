// app/api/engineering/zero-error/reconcile-quad/route.ts — API Đối soát định lượng 4 chiều
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  reconcileQuadQuantity,
  type QuadReconcileParams,
} from "@/lib/ky-thuat/engineering-zero-error-tracker";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực hiện kiểm tra này" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const params: QuadReconcileParams = {
      reportedQty: parseFloat(body.reportedQty ?? "0"),
      bimDesignQty: parseFloat(body.bimDesignQty ?? "0"),
      boqApprovedQty: parseFloat(body.boqApprovedQty ?? "0"),
      warehouseReceivedQty: parseFloat(body.warehouseReceivedQty ?? "0"),
      warehouseUsedQty: parseFloat(body.warehouseUsedQty ?? "0"),
    };

    const result = reconcileQuadQuantity(params);

    return NextResponse.json({
      projectId,
      inputParams: params,
      reconciliation: result,
      status: result.allowed ? "APPROVED_QUANTITY" : "REJECTED_QUANTITY_BREACH",
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
