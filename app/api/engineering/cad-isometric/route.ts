import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  generateSpoolIsometricDrawing,
  optimizeGeneticNestingWithRemnants,
  saveSpoolIsometric,
  listSpoolIsometrics,
  saveModularSkid,
  listModularSkids,
  SpoolIsometricInput,
  RemnantItem,
} from "@/lib/ky-thuat/engineering-cad-dfma-isometric";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-isometric — Lấy danh sách Bản Vẽ Isometric Spool & Modular Skids
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem dữ liệu CAD Isometric" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "isometrics";

  try {
    if (type === "skids") {
      const skids = await listModularSkids(projectId);
      return NextResponse.json(skids);
    }

    const isometrics = await listSpoolIsometrics(projectId);
    return NextResponse.json(isometrics);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/cad-isometric — Sinh Bản Vẽ Isometric DfMA Spool hoặc Tối Ưu Phôi Genetic
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thao tác CAD Isometric DfMA" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "generate_isometric";

    // 1. Sinh bản vẽ Isometric 3D-to-2D cho từng đoạn Spool gia công xưởng
    if (action === "generate_isometric") {
      const result = generateSpoolIsometricDrawing(body as SpoolIsometricInput);

      if (body.saveToDb !== false) {
        try {
          await saveSpoolIsometric(projectId, result, user.id);
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(result);
    }

    // 2. Tối ưu cắt phôi di truyền kết hợp kho phôi thừa (Remnant-First Genetic Nesting)
    if (action === "genetic_nesting") {
      const { demandCuts, remnants, standardBarLengthMm, kerfMm } = body;
      if (!demandCuts || !Array.isArray(demandCuts)) {
        return NextResponse.json(
          { error: "demandCuts phải là mảng danh sách đoạn cắt" },
          { status: 422 },
        );
      }

      const result = optimizeGeneticNestingWithRemnants(
        demandCuts as Array<{ spoolCode: string; lengthMm: number }>,
        (remnants || []) as RemnantItem[],
        Number(standardBarLengthMm || 6000),
        Number(kerfMm || 2),
      );

      return NextResponse.json(result);
    }

    // 3. Lưu trữ Module Skid đúc sẵn
    if (action === "save_modular_skid") {
      const {
        skidCode,
        skidType,
        title,
        frameDimensionsMm,
        weightKg,
        equipment,
        spools,
        kwRating,
      } = body;
      if (!skidCode || !skidType) {
        return NextResponse.json({ error: "Thiếu skidCode hoặc skidType" }, { status: 422 });
      }

      const saved = await saveModularSkid(
        projectId,
        {
          skidCode,
          skidType,
          title: title || `Module ${skidCode}`,
          frameDimensionsMm: frameDimensionsMm || [1200, 2400, 1800],
          weightKg: Number(weightKg || 0),
          equipment: equipment || [],
          spools: spools || [],
          kwRating: Number(kwRating || 0),
        },
        user.id,
      );

      return NextResponse.json(saved);
    }

    return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
