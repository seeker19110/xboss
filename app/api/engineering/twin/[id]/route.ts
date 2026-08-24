import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { getTwinSnapshot } from "@/lib/ky-thuat/engineering-twin";

export const dynamic = "force-dynamic";

// GET /api/engineering/twin/[id] — Lấy Snapshot Digital Twin L0–L3 của đối tượng
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem Digital Twin" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-twin", projectId);
  if (blocked) return blocked;

  try {
    const snapshot = await getTwinSnapshot(projectId, id);
    return NextResponse.json(snapshot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Không tìm thấy") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
