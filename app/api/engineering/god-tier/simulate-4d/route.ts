import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  calculateGodTier4DSimulation,
  GodTierElementData,
} from "@/lib/ky-thuat/engineering-god-tier";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringGodTier(user.role)) {
    return NextResponse.json({ error: "Không có quyền thao tác mô phỏng 4D God-Tier" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-god-tier-studio", projectId);
  if (blocked) return blocked;
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const targetDate = body.targetDate || new Date().toISOString().split("T")[0];

    const elements: GodTierElementData[] = Array.isArray(body.elements) ? body.elements : [];
    if (elements.length === 0) {
      return NextResponse.json({
        success: true,
        simulation: {
          targetDate,
          totalElements: 0,
          counts: { planned: 0, in_progress: 0, completed: 0, approved: 0, delayed: 0 },
          elements: [],
        },
      });
    }

    const simResult = calculateGodTier4DSimulation(elements, targetDate);
    return NextResponse.json({ success: true, simulation: simResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi tính toán mô phỏng 4D";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
