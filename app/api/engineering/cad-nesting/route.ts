import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  nestPipeSegments1D,
  nestDuctSheets2D,
  generateSpoolQrPayload,
  calcHazenWilliams,
  calcDarcyWeisbach,
  validateVelocityLimit,
  sizeDuctByVelocity,
  saveNestingRun,
  listNestingRuns,
  saveHydraulicCheck,
  listHydraulicChecks,
  PipeSegmentInput,
  DuctSheetRectInput,
  SystemVelocityCategory,
} from "@/lib/engineering-cad-nesting";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-nesting — Lấy lịch sử các phiên Nesting & Kiểm tra Thủy lực
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu CAD Nesting" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "nesting";

  try {
    if (type === "hydraulic") {
      const checks = await listHydraulicChecks(projectId);
      return NextResponse.json(checks);
    }

    const runs = await listNestingRuns(projectId);
    return NextResponse.json(runs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/cad-nesting — Chạy thuật toán Nesting 1D/2D hoặc Tính toán Thủy lực
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực thi Nesting" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "nest_1d";

    // 1. Chạy 1D Pipe Nesting FFD
    if (action === "nest_1d") {
      const { segments, stockLengthMm, kerfMm, discipline, saveToDb } = body;
      if (!segments || !Array.isArray(segments)) {
        return NextResponse.json(
          { error: "segments phải là mảng danh sách đoạn ống" },
          { status: 422 },
        );
      }

      const result = nestPipeSegments1D(
        segments as PipeSegmentInput[],
        Number(stockLengthMm || 6000),
        Number(kerfMm || 2),
      );

      if (saveToDb !== false) {
        try {
          await saveNestingRun(projectId, discipline || "hvac", result, user.id);
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(result);
    }

    // 2. Chạy 2D Duct Sheet Metal Nesting
    if (action === "nest_2d") {
      const { rects, sheetWidthMm, sheetHeightMm, marginMm } = body;
      if (!rects || !Array.isArray(rects)) {
        return NextResponse.json(
          { error: "rects phải là mảng danh sách phôi tấm" },
          { status: 422 },
        );
      }

      const result = nestDuctSheets2D(
        rects as DuctSheetRectInput[],
        Number(sheetWidthMm || 1200),
        Number(sheetHeightMm || 2400),
        Number(marginMm || 10),
      );

      return NextResponse.json(result);
    }

    // 3. Tính toán Thủy lực / Khí động MEPF
    if (action === "hydraulic_calc") {
      const {
        formula,
        systemType,
        flowRateLps,
        pipeDiameterMm,
        pipeLengthM,
        roughnessMm,
        fluidTempC,
        cFactor,
        saveToDb,
      } = body;

      const sys = (systemType as SystemVelocityCategory) || "domestic_water";
      const qLps = Number(flowRateLps || 2.0);
      const dMm = Number(pipeDiameterMm || 100);
      const lM = Number(pipeLengthM || 10.0);

      let calcRes: {
        velocityMs: number;
        headLossPerMeterPa: number;
        totalHeadLossPa: number;
        pressureDropBar: number;
        reynoldsNumber?: number;
        frictionFactor?: number;
      };

      if (formula === "darcy_weisbach") {
        calcRes = calcDarcyWeisbach(
          qLps,
          dMm,
          Number(roughnessMm || 0.046),
          lM,
          Number(fluidTempC || 25),
        );
      } else {
        calcRes = calcHazenWilliams(qLps, dMm, lM, Number(cFactor || 120));
      }

      const validation = validateVelocityLimit(calcRes.velocityMs, sys);

      const responsePayload = {
        ...calcRes,
        systemType: sys,
        formulaUsed: formula || "hazen_williams",
        validation,
        status: validation.status,
      };

      if (saveToDb !== false) {
        try {
          await saveHydraulicCheck(
            projectId,
            {
              systemType: sys,
              formulaUsed: formula || "hazen_williams",
              flowRateLps: qLps,
              pipeDiameterMm: dMm,
              pipeLengthM: lM,
              roughnessMm: Number(roughnessMm || 0.046),
              fluidTempC: Number(fluidTempC || 25),
            },
            {
              velocityMs: calcRes.velocityMs,
              reynoldsNumber: calcRes.reynoldsNumber,
              frictionFactor: calcRes.frictionFactor,
              headLossPerMPa: calcRes.headLossPerMeterPa,
              totalHeadLossPa: calcRes.totalHeadLossPa,
              pressureDropBar: calcRes.pressureDropBar,
              velocityLimitMs: validation.limitMs,
              velocityOk: validation.ok,
              warnings: [validation.message],
              status: validation.status,
            },
            user.id,
          );
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(responsePayload);
    }

    // 4. Tính toán kích thước ống gió (Duct Sizing)
    if (action === "size_duct") {
      const { airflowCfm, targetVelocityMs, aspectRatio } = body;
      const result = sizeDuctByVelocity(
        Number(airflowCfm || 1000),
        Number(targetVelocityMs || 6.0),
        Number(aspectRatio || 1.5),
      );
      return NextResponse.json(result);
    }

    // 5. Sinh QR code Spool
    if (action === "generate_qr") {
      const { spoolCode, discipline, systemCode, dimensionSpec, floorLabel } = body;
      const result = generateSpoolQrPayload({
        projectId,
        spoolCode: String(spoolCode || "SPOOL-001"),
        discipline,
        systemCode,
        dimensionSpec,
        floorLabel,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
