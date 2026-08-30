import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { bindTwinTarget, BindingType } from "@/lib/ky-thuat/engineering-twin";

export const dynamic = "force-dynamic";

// POST /api/engineering/twin/[id]/bindings — Gán liên kết Digital Twin (L1)
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền gán liên kết Digital Twin" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-twin", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const bindingType = body.bindingType as BindingType;
  const targetKey = typeof body.targetKey === "string" ? body.targetKey.trim() : "";

  if (!bindingType || !targetKey) {
    return NextResponse.json(
      {
        error: "Cần cung cấp bindingType (floor/zone/system/task/drawing/bim_element) và targetKey",
      },
      { status: 400 },
    );
  }

  try {
    const binding = await bindTwinTarget(projectId, {
      objectId: id,
      bindingType,
      targetKey,
      targetId: body.targetId ? String(body.targetId) : undefined,
      sourceRevisionId: body.sourceRevisionId ? String(body.sourceRevisionId) : undefined,
      authority: body.authority ? String(body.authority) : undefined,
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : undefined,
    });
    return NextResponse.json({ binding });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
