import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { DWG_UNSUPPORTED_MESSAGE } from "@/lib/ky-thuat/cad/dxf-parser";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/convert-to-dxf — Chuyển đổi tệp CAD DWG sang DXF chuẩn trước khi xử lý
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập module CAD/BIM" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.fileBase64) {
      return NextResponse.json(
        { error: "Cần cung cấp dữ liệu tệp DWG (fileBase64) để thực hiện chuyển đổi." },
        { status: 422 },
      );
    }

    // XBoss không đọc DWG bằng TypeScript (ADR-0006/M99 PR0) — bản đọc cũ bịa hình học.
    // Chuyển đổi DWG→DXF nay do người dùng thực hiện trong AutoCAD, hoặc plugin AutoCAD (M99).
    return NextResponse.json({ error: DWG_UNSUPPORTED_MESSAGE }, { status: 422 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
