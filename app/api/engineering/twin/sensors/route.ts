import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getSensorStreams } from "@/lib/engineering-twin-pinnacle";

export const dynamic = "force-dynamic";

// GET /api/engineering/twin/sensors — Danh sách luồng cảm biến IoT của dự án
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem cảm biến Digital Twin" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const streams = await getSensorStreams(projectId);
    return NextResponse.json(streams);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
