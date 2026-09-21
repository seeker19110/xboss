import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  auditMaterialMassBalance,
  saveMassBalanceAudit,
  listMassBalanceAudits,
  calculateJitReorderPoint,
  evaluatePhantomInstallationBreaker,
  MassBalanceInput,
} from "@/lib/ky-thuat/engineering-pipe-stash-hunter";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/pipe-mass-balance — Lịch sử các đợt đối soát Mass-Balance
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringWorkflows(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu Mass-Balance" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const audits = await listMassBalanceAudits(projectId);
    return NextResponse.json({ audits, totalCount: audits.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/pipe-mass-balance — Chạy đối soát cân bằng vật chất 5 chiều
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực thi đối soát Mass-Balance" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "audit_mass_balance";

    if (action === "check_phantom_breaker") {
      const claimed = parseFloat(body.claimedInstallM) || 0;
      const issued = parseFloat(body.totalStockIssuedToSubconM) || 0;
      const result = evaluatePhantomInstallationBreaker(claimed, issued);
      return NextResponse.json({ success: true, result });
    }

    if (action === "calc_jit_reorder") {
      const installRate = parseFloat(body.installRateMPerDay) || 20;
      const leadDays = parseFloat(body.supplierLeadDays) || 14;
      const available = parseFloat(body.currentAvailableStockM) || 150;
      const result = calculateJitReorderPoint(installRate, leadDays, available);
      return NextResponse.json({ success: true, result });
    }

    const input: MassBalanceInput = {
      auditCode: body.auditCode || `MBA-${Date.now().toString(36).toUpperCase()}`,
      systemCode: body.systemCode || "PLUMBING_DRAINAGE",
      nominalDiaMm: parseFloat(body.nominalDiaMm) || 110.0,
      totalBimDesignM: parseFloat(body.totalBimDesignM) || 1200.0,
      totalPoOrderedM: parseFloat(body.totalPoOrderedM) || 1200.0,
      totalGrnReceivedM: parseFloat(body.totalGrnReceivedM) || 1000.0,
      totalInstalledVerifiedM: parseFloat(body.totalInstalledVerifiedM) || 650.0,
      totalStagedOnFloorsM: parseFloat(body.totalStagedOnFloorsM) || 150.0,
      totalInCentralWarehouseM: parseFloat(body.totalInCentralWarehouseM) || 180.0,
      totalReusableRemnantsM: parseFloat(body.totalReusableRemnantsM) || 15.0,
      totalScrapLoggedM: parseFloat(body.totalScrapLoggedM) || 5.0,
      stagingBuffers: body.stagingBuffers || [
        {
          towerLabel: "Tower-A",
          floorLabel: "FL-12",
          zoneLabel: "Zone-01",
          quantityM: 80.0,
          stagedAt: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
          holdingTimeHours: 80.0, // > 72h
        },
        {
          towerLabel: "Tower-A",
          floorLabel: "FL-14",
          zoneLabel: "Zone-02",
          quantityM: 70.0,
          stagedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          holdingTimeHours: 24.0,
        },
      ],
    };

    const result = auditMaterialMassBalance(input);
    const saved = await saveMassBalanceAudit(projectId, result, user.id);

    return NextResponse.json({
      success: true,
      auditId: saved.id,
      result,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
