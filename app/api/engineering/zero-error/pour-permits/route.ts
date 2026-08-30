// app/api/engineering/zero-error/pour-permits/route.ts — Quản lý lệnh đổ bê tông & Ngắt mạch công tác ngầm
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  evaluateConcealedWorkCircuitBreaker,
  type ConcealedTaskRecord,
} from "@/lib/ky-thuat/engineering-zero-error-tracker";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem danh mục lệnh đổ bê tông" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const url = new URL(req.url);
  const zone = url.searchParams.get("zone") || "Zone 1 (Tầng 12)";

  // Dữ liệu mẫu thực tế của các gói ngầm trong phân khu
  const sampleConcealedTasks: ConcealedTaskRecord[] = [
    {
      id: "TASK-SLV-01",
      name: "Sleeves xuyên dầm D110 trục 3-4",
      zone,
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
    {
      id: "TASK-ELE-02",
      name: "Ống luồn dây điện chiếu sáng âm sàn trục E-F",
      zone,
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
    {
      id: "TASK-PLB-03",
      name: "Ống thoát nước sinh hoạt uPVC D90 âm sàn",
      zone,
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
    {
      id: "TASK-EAR-04",
      name: "Mối hàn tiếp địa chống sét dầm biên",
      zone,
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
  ];

  const circuitStatus = evaluateConcealedWorkCircuitBreaker(sampleConcealedTasks);

  return NextResponse.json({
    projectId,
    zone,
    circuitBreaker: circuitStatus,
    tasks: sampleConcealedTasks,
    summary: {
      totalTasks: sampleConcealedTasks.length,
      unpassedCount: circuitStatus.unpassedCount,
      permitReady: circuitStatus.status === "PERMIT_ACTIVE",
    },
  });
}
