import { NextRequest, NextResponse } from "next/server";
import { todayISO } from "@/lib/nen/date";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  analyzeFidicTiaClaim,
  saveFidicTiaClaim,
  listFidicTiaClaims,
  FidicTiaInput,
} from "@/lib/ky-thuat/engineering-fidic-claim";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/fidic-tia — Lấy danh sách hồ sơ khiếu nại FIDIC TIA
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewClaims(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem hồ sơ khiếu nại TIA" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-nextgen-apex", projectId);
  if (blocked) return blocked;

  try {
    const claims = await listFidicTiaClaims(projectId);
    return NextResponse.json({ claims, totalCount: claims.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/fidic-tia — Phân tích TIA và lập thông báo khiếu nại FIDIC
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageClaims(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo khiếu nại FIDIC TIA" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-nextgen-apex", projectId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const input: FidicTiaInput = {
      claimCode: body.claimCode || `CLAIM-TIA-${Date.now().toString(36).toUpperCase()}`,
      delayEventTitle: body.delayEventTitle || "Chậm bàn giao mặt bằng Tầng 12 từ CĐT",
      eventCategory: body.eventCategory || "EMPLOYER_DELAY",
      delayStartDate: body.delayStartDate || todayISO(),
      delayEndDate:
        body.delayEndDate ||
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      dailyOverheadCostVnd: parseFloat(body.dailyOverheadCostVnd) || 15000000.0,
      impactedTasks: body.impactedTasks || [
        {
          taskId: 101,
          taskName: "Lắp đặt ống Chiller Trục đứng Zone A",
          originalDurationDays: 20,
          delayDays: 14,
        },
        {
          taskId: 102,
          taskName: "Kéo cáp ngầm trung thế hạ thế",
          originalDurationDays: 15,
          delayDays: 10,
        },
      ],
    };

    const result = analyzeFidicTiaClaim(input);
    const saved = await saveFidicTiaClaim(projectId, result, user.id);

    return NextResponse.json({
      success: true,
      claimId: saved.id,
      result,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
