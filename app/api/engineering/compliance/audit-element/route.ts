import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { auditEngineeringElement } from "@/lib/ky-thuat/engineering-prescriptive";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/compliance/audit-element — Kiểm tra đối soát tức thì một đối tượng với quy chuẩn
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringCompliance(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện kiểm tra quy chuẩn" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    if (!body.objectId || !body.ruleId) {
      return NextResponse.json(
        { error: "Thiếu trường bắt buộc: objectId, ruleId" },
        { status: 400 },
      );
    }

    const audit = await auditEngineeringElement(projectId, body.objectId, body.ruleId);
    return NextResponse.json({ success: true, audit }, { status: 201 });
  } catch (err: unknown) {
    // Hàm lib ném LoiNghiepVu mang sẵn mã (404 khi bản ghi không tồn tại/thuộc dự án
    // khác) — không còn dò chuỗi thông điệp; lỗi hệ thống thật vẫn ra 500.
    return phanHoiLoi(err);
  }
}
