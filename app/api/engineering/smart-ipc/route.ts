import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  processSmartIpcRelease,
  fetchSmartIpcGatingContext,
  saveSmartIpcRecord,
  listSmartIpcRecords,
  validateSmartIpcPostBody,
} from "@/lib/ky-thuat/engineering-smart-ipc";

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

// POST /api/engineering/smart-ipc — Thẩm định 4 cổng (đọc dữ liệu thật) và phát hành Smart IPC
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

    // Validate + chuẩn hoá toàn bộ body (kể cả retentionPercent/iotWindowHours/claimedQty —
    // trước đây `Number(...)` không kiểm biên nên chuỗi rác ra NaN, chảy thẳng vào tính tiền/
    // khoảng thời gian) — hàm thuần trong lib, route chỉ đọc kết quả và trả 422.
    const validated = validateSmartIpcPostBody(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 422 });
    }
    const input = validated.value;

    // Mọi cổng gating đọc từ nguồn thật (esign envelope, log IoT, BOQ/kho) — client chỉ khai
    // định danh tham chiếu, không tự khai kết quả đạt/không đạt. Thiếu tham chiếu → cổng đó
    // trả `khong_du_du_lieu` và chặn giải ngân (xem evaluateSmartIpcGates).
    const gateCtx = await fetchSmartIpcGatingContext(projectId, input.refs);
    const result = processSmartIpcRelease(input, gateCtx);
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
