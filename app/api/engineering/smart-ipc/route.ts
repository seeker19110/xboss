import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  processSmartIpcRelease,
  saveSmartIpcRecord,
  listSmartIpcRecords,
  SmartIpcCalculationInput,
} from "@/lib/engineering-smart-ipc";

export const dynamic = "force-dynamic";

// GET /api/engineering/smart-ipc — Lịch sử các đợt phát hành chứng chỉ thanh toán Smart IPC
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem dữ liệu thanh toán IPC" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listSmartIpcRecords(projectId);
    return NextResponse.json({ ipcs: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/smart-ipc — Thẩm định 4 cổng và phát hành Smart IPC
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role) && !CAN.approve(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền giải ngân thanh toán Smart IPC" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const input: SmartIpcCalculationInput = {
      ipcNumber: body.ipcNumber || `IPC-AUTO-${Date.now().toString(36).toUpperCase()}`,
      periodMonth: body.periodMonth || "2026-08",
      contractorName: body.contractorName || "Tổng Thầu MEPF Chuyên Nghiệp",
      grossClaimedVnd: parseFloat(body.grossClaimedVnd) || 500000000.0,
      retentionPercent: parseFloat(body.retentionPercent) || 5.0,
      gating: {
        scanToBimMaxDevMm: parseFloat(body.gating?.scanToBimMaxDevMm ?? 12.0),
        bbntSigned3Parties: body.gating?.bbntSigned3Parties !== false,
        iotPressureDropBar: parseFloat(body.gating?.iotPressureDropBar ?? 0.0),
        iotTestDurationHours: parseFloat(body.gating?.iotTestDurationHours ?? 2.5),
        claimedQty: parseFloat(body.gating?.claimedQty ?? 100),
        approvedBoqQty: parseFloat(body.gating?.approvedBoqQty ?? 100),
        warehouseUsedQty: parseFloat(body.gating?.warehouseUsedQty ?? 120),
      },
    };

    const result = processSmartIpcRelease(input);
    const saved = await saveSmartIpcRecord(projectId, result, user.id);

    return NextResponse.json({
      success: true,
      recordId: saved.id,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
