import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { recordTwinState, QualityLevel } from "@/lib/ky-thuat/engineering-twin";

export const dynamic = "force-dynamic";

// POST /api/engineering/twin/[id]/states — Ghi nhận snapshot trạng thái hiện trường (L3)
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền ghi nhận trạng thái Digital Twin" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-twin", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const stateType = typeof body?.stateType === "string" ? body.stateType.trim() : "";
  const observedAt =
    typeof body?.observedAt === "string" ? body.observedAt : new Date().toISOString();
  const value = body?.value;
  const source = typeof body?.source === "string" ? body.source.trim() : "field_inspection";

  if (!stateType || value === undefined) {
    return NextResponse.json({ error: "Cần cung cấp stateType và value" }, { status: 400 });
  }

  try {
    const state = await recordTwinState(projectId, {
      objectId: id,
      stateType,
      observedAt,
      value,
      unit: body.unit ? String(body.unit) : undefined,
      schemaVersion: body.schemaVersion ? String(body.schemaVersion) : "1.0",
      quality: (body.quality as QualityLevel) || "high",
      source,
      supersedesId: body.supersedesId ? String(body.supersedesId) : undefined,
    });
    return NextResponse.json({ state });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
