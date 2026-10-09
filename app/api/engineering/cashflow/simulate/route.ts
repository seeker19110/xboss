import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { runAndSaveCashflowForecast } from "@/lib/ky-thuat/engineering-cashflow";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/cashflow/simulate
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền mô phỏng dòng tiền dự án" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      await getCurrentProjectId(user),
    );
    if (!chotDuAn.ok) {
      return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    }
    const projectId = chotDuAn.projectId;

    if (!body.runName || !body.totalContractValue) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (runName, totalContractValue)" },
        { status: 422 },
      );
    }

    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageEngineeringGraph(user.role),
      () =>
        runAndSaveCashflowForecast({
          projectId,
          runName: body.runName,
          totalContractValue: Number(body.totalContractValue),
          advancePercent: Number(body.advancePercent || 15),
          retentionPercent: Number(body.retentionPercent || 5),
          paymentDelayDays: Number(body.paymentDelayDays || 30),
          durationPeriods: Number(body.durationPeriods || 12),
          createdBy: user.id,
        }),
    );
    if (!kq.ok)
      return NextResponse.json(
        { error: "Không có quyền mô phỏng dòng tiền dự án" },
        { status: 403 },
      );
    const simulation = kq.value;

    return NextResponse.json({ success: true, data: simulation });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
