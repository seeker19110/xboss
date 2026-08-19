import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  solve1dCuttingStock,
  saveNestingPlan,
  listNestingPlans,
  RequiredPiece,
} from "@/lib/engineering-mepf-nesting";

export const dynamic = "force-dynamic";

// GET /api/engineering/mepf-nesting — Tra cứu danh sách kế hoạch cắt phôi Spool
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem kế hoạch cắt phôi" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const plans = await listNestingPlans(projectId);
    return NextResponse.json({ plans, totalCount: plans.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/mepf-nesting — Chạy thuật toán tối ưu hóa cắt phôi 1D/2D
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện tối ưu cắt phôi" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const materialType = body.materialType || "Ống Thép DN100 SCH40 (Cây 6m)";
    const stockLengthM = parseFloat(body.stockLengthM) || 6.0;
    const requiredPieces: RequiredPiece[] = body.requiredPieces || [
      { id: "P1", spoolCode: "SP-FP-01", lengthM: 3.4, quantity: 4 },
      { id: "P2", spoolCode: "SP-FP-02", lengthM: 2.5, quantity: 6 },
      { id: "P3", spoolCode: "SP-FP-03", lengthM: 1.8, quantity: 5 },
      { id: "P4", spoolCode: "SP-FP-04", lengthM: 0.9, quantity: 8 },
    ];
    const planCode = body.planCode || `NEST-${Date.now().toString(36).toUpperCase()}`;

    const plan = solve1dCuttingStock(planCode, materialType, requiredPieces, stockLengthM);
    const saved = await saveNestingPlan(projectId, plan);

    return NextResponse.json({
      success: true,
      planId: saved.id,
      plan,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
