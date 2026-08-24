import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { toggleKillSwitch } from "@/lib/ky-thuat/engineering-autonomy";

export const dynamic = "force-dynamic";

// POST /api/engineering/autonomy/kill-switch
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringAutonomy(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền can thiệp công tắc ngắt khẩn cấp" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-autonomy", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const isActive = Boolean(body?.isActive);
  const reason =
    typeof body?.reason === "string" ? body.reason.trim() : "Thao tác từ giao diện quản trị";
  const capabilityKey = typeof body?.capabilityKey === "string" ? body.capabilityKey.trim() : null;

  try {
    const res = await toggleKillSwitch(projectId, capabilityKey, isActive, reason, user.id);
    return NextResponse.json({ killSwitch: res });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
