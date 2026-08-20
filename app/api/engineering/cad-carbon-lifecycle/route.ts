import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  calculate6dCarbonLca,
  evaluateAssetHealthAndRul,
  exportDigitalTwinPassport,
  saveCarbonLifecycleRecord,
  listCarbonLifecycleRecords,
  MaterialCarbonCategory,
  Asset7DLifeCycleRecord,
} from "@/lib/engineering-cad-carbon-lifecycle";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-carbon-lifecycle — Lấy danh sách Bản Ghi Carbon 6D & Tài Sản 7D MTBF/RUL
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem dữ liệu Carbon 6D / Tài sản 7D" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const records = await listCarbonLifecycleRecords(projectId);
    return NextResponse.json(records);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/cad-carbon-lifecycle — Tính toán Carbon 6D LCA, Đánh Giá Tài Sản 7D hoặc Xuất Digital Passport
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thao tác Carbon 6D / 7D Engine" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "calculate_carbon_lca";

    // 1. Tính toán phát thải carbon ẩn 6D (Embodied Carbon LCA)
    if (action === "calculate_carbon_lca") {
      const { elements, grossFloorAreaM2, saveToDb } = body;
      if (!elements || !Array.isArray(elements)) {
        return NextResponse.json(
          { error: "elements phải là mảng danh sách khối lượng vật liệu" },
          { status: 422 },
        );
      }

      const result = calculate6dCarbonLca(
        elements as Array<{ category: MaterialCarbonCategory; weightKg: number }>,
        Number(grossFloorAreaM2 || 5000),
      );

      if (saveToDb !== false) {
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          try {
            await saveCarbonLifecycleRecord(
              projectId,
              {
                recordCode: `CARB-${Date.now().toString(36).toUpperCase()}-${i + 1}`,
                elementType: "MEPF_ELEMENT",
                systemCode: "MEPF",
                materialCategory: el.category,
                weightKg: el.weightKg,
                embodiedCarbonKgCo2e: el.weightKg * 2.1,
              },
              user.id,
            );
          } catch {
            // Non-blocking
          }
        }
      }

      return NextResponse.json(result);
    }

    // 2. Đánh giá sức khỏe tài sản 7D và dự báo MTBF/RUL
    if (action === "evaluate_asset_health") {
      const {
        installedDateISO,
        expectedLifespanYears,
        mtbfHours,
        currentOperatingHours,
        incidentCount,
      } = body;

      const result = evaluateAssetHealthAndRul({
        installedDateISO: String(installedDateISO || new Date().toISOString()),
        expectedLifespanYears: Number(expectedLifespanYears || 15),
        mtbfHours: Number(mtbfHours || 20000),
        currentOperatingHours: Number(currentOperatingHours || 5000),
        incidentCount: Number(incidentCount || 0),
      });

      return NextResponse.json(result);
    }

    // 3. Đóng gói và xuất Hộ chiếu số bàn giao Living Digital Twin Passport LOD 500
    if (action === "export_passport") {
      const { projectCode, assets, totalCarbonTonCo2e } = body;
      const result = exportDigitalTwinPassport(
        String(projectCode || `PROJECT-${projectId}`),
        (assets || []) as Asset7DLifeCycleRecord[],
        Number(totalCarbonTonCo2e || 0),
      );

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
