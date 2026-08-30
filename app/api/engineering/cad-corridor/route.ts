import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  planMultiTierCorridor,
  calculateTrapezeHangerStructure,
  saveCorridorLayout,
  listCorridorLayouts,
  saveTrapezeHanger,
  listTrapezeHangers,
  CorridorLayoutInput,
} from "@/lib/ky-thuat/engineering-cad-corridor";
import {
  solveHydraulicNetwork,
  saveHydraulicNetwork,
  listHydraulicNetworks,
} from "@/lib/ky-thuat/engineering-cad-hydraulic-network";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-corridor — Danh sách Layout Hành Lang, Giá Đỡ Trapeze & Mạng Thủy Lực
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu CAD Corridor" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "layouts";

  try {
    if (type === "hangers") {
      const hangers = await listTrapezeHangers(projectId);
      return NextResponse.json(hangers);
    }
    if (type === "hydraulic_networks") {
      const networks = await listHydraulicNetworks(projectId);
      return NextResponse.json(networks);
    }

    const layouts = await listCorridorLayouts(projectId);
    return NextResponse.json(layouts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/cad-corridor — Quy hoạch Hành lang, Tính toán Giá đỡ Trapeze hoặc Cân bằng Mạng Thủy lực
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực thi Corridor Engine" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "plan_corridor";

    // 1. Quy hoạch ma trận cao độ hành lang kỹ thuật đa tầng
    if (action === "plan_corridor") {
      const result = planMultiTierCorridor(body as CorridorLayoutInput);

      if (body.saveToDb !== false) {
        try {
          await saveCorridorLayout(projectId, result, user.id);
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(result);
    }

    // 2. Tính toán kết cấu tải trọng / ứng suất giá đỡ Trapeze
    if (action === "calc_trapeze") {
      const {
        hangerCode,
        spanWidthMm,
        dropLengthMm,
        hangerSpacingM,
        systemsOnHanger,
        preferredUnistrutCode,
        corridorLayoutId,
        saveToDb,
      } = body;

      if (!hangerCode || !spanWidthMm || !systemsOnHanger) {
        return NextResponse.json(
          {
            error:
              "Thiếu thông số đầu vào cho giá đỡ Trapeze (hangerCode, spanWidthMm, systemsOnHanger)",
          },
          { status: 422 },
        );
      }

      const result = calculateTrapezeHangerStructure({
        hangerCode: String(hangerCode),
        spanWidthMm: Number(spanWidthMm),
        dropLengthMm: Number(dropLengthMm || 600),
        hangerSpacingM: Number(hangerSpacingM || 1.5),
        systemsOnHanger: systemsOnHanger as Array<{ weightKgPerM: number; systemCode?: string }>,
        preferredUnistrutCode,
      });

      if (saveToDb !== false) {
        try {
          await saveTrapezeHanger(projectId, result, corridorLayoutId, user.id);
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(result);
    }

    // 3. Cân bằng đồ thị mạng lưới thủy lực (Hydraulic Loop Balancing)
    if (action === "solve_hydraulic_network") {
      const { networkCode, systemType, nodes, edges, saveToDb } = body;

      if (!networkCode || !nodes || !edges) {
        return NextResponse.json(
          { error: "Thiếu thông số mạng lưới thủy lực (networkCode, nodes, edges)" },
          { status: 422 },
        );
      }

      const result = solveHydraulicNetwork(
        String(networkCode),
        systemType || "chilled_water",
        nodes,
        edges,
      );

      if (saveToDb !== false) {
        try {
          await saveHydraulicNetwork(projectId, result, user.id);
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
