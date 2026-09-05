import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  calculateEmbodiedCarbonLCA,
  saveCarbonLcaReport,
  listCarbonLcaReports,
  MaterialLcaItem,
} from "@/lib/ky-thuat/engineering-carbon-lca";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/carbon-lca — Lịch sử các báo cáo Vết Carbon LCA
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem báo cáo Carbon" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listCarbonLcaReports(projectId);
    return NextResponse.json({ reports: list, totalCount: list.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/carbon-lca — Tính toán phát thải Carbon & Đánh giá LEED
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực thi LCA" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const reportCode = body.reportCode || `LCA-${Date.now().toString(36).toUpperCase()}`;
    const grossFloorAreaM2 = parseFloat(body.grossFloorAreaM2) || 25000;
    const materials: MaterialLcaItem[] = body.materials || [
      {
        materialType: "steel_pipe",
        description: "Ống thép SCH40 cứu hỏa & Chiller",
        weightKg: 45000,
      },
      {
        materialType: "galvanized_duct",
        description: "Tôn tráng kẽm ống gió ACMV",
        weightKg: 28000,
      },
      { materialType: "copper_cable", description: "Cáp đồng điện lực XLPE/PVC", weightKg: 12500 },
      { materialType: "plastic_ppr", description: "Ống nước sạch PPR PN16", weightKg: 6800 },
    ];

    const result = calculateEmbodiedCarbonLCA(reportCode, materials, grossFloorAreaM2);
    const saved = await saveCarbonLcaReport(projectId, result);

    return NextResponse.json({
      success: true,
      reportId: saved.id,
      result,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
