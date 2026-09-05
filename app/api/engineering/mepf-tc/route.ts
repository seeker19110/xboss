import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  createTcMatrix,
  addTcLog,
  listTcMatrices,
  listTcLogs,
  evaluatePressureHoldTest,
  evaluateFireInterlockMatrix,
  TcTestType,
} from "@/lib/ky-thuat/engineering-mepf-tc";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/mepf-tc — Danh sách gói ma trận T&C hoặc logs chi tiết
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem MEPF T&C" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const matrixId = searchParams.get("matrixId");

    if (matrixId) {
      const logs = await listTcLogs(projectId, matrixId);
      return NextResponse.json({ logs, totalCount: logs.length });
    }

    const matrices = await listTcMatrices(projectId);
    return NextResponse.json({ matrices, totalCount: matrices.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/mepf-tc — Tạo gói ma trận T&C mới, log số liệu hoặc đánh giá kết quả
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực hiện MEPF T&C" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "create_matrix";

    if (action === "create_matrix") {
      const saved = await createTcMatrix(projectId, user.id, {
        matrixCode: body.matrixCode || `TC-${Date.now().toString(36).toUpperCase()}`,
        title: body.title || "Gói thử nghiệm T&C",
        testType: (body.testType as TcTestType) || "hydrostatic_pipe",
        systemCode: body.systemCode || "FP",
        floorLabel: body.floorLabel || "Tầng 5",
        zoneLabel: body.zoneLabel || "Zone A",
        testPackageName: body.testPackageName || "Test Package 01",
        designPressureBar: body.designPressureBar,
        testPressureBar: body.testPressureBar,
        holdingDurationMinutes: body.holdingDurationMinutes,
        allowableDropBar: body.allowableDropBar,
        interlockLogic: body.interlockLogic,
      });
      return NextResponse.json({ success: true, matrixId: saved.id });
    }

    if (action === "add_log") {
      if (!body.matrixId) {
        return NextResponse.json({ error: "Thiếu matrixId" }, { status: 400 });
      }
      const log = await addTcLog(projectId, user.id, body.matrixId, {
        recordedValue: body.recordedValue,
        unit: body.unit || "Bar",
        sensorCode: body.sensorCode,
        ambientTempC: body.ambientTempC,
        notes: body.notes,
        isAnomaly: body.isAnomaly,
      });
      return NextResponse.json({ success: true, logId: log.id });
    }

    if (action === "evaluate_hydrostatic") {
      const evaluation = evaluatePressureHoldTest(
        body.initialPressureBar || 0,
        body.finalPressureBar || 0,
        body.durationMinutes || 0,
        body.requiredDurationMinutes || 120,
        body.allowableDropBar || 0.2,
      );
      return NextResponse.json({ success: true, evaluation });
    }

    if (action === "evaluate_interlock") {
      const evaluation = evaluateFireInterlockMatrix(body.scenarios || []);
      return NextResponse.json({ success: true, evaluation });
    }

    return NextResponse.json({ error: `Hành động ${action} không hợp lệ` }, { status: 400 });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
