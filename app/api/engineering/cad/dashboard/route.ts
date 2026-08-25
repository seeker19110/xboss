import { NextResponse } from "next/server";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  layLichSuPluginUpload,
  layTomTatBlockLib,
  tomTatRulePack,
} from "@/lib/ky-thuat/cad/bang-dieu-khien";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/dashboard — bảng điều khiển plugin AutoCAD (M99 PR6):
// rule pack đang phát hành + lịch sử bản vẽ plugin tải lên kèm kết quả kiểm định server.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem bảng điều khiển CAD" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  const rulePack = tomTatRulePack();
  // Gói cài plugin do quản trị tự host (không nhúng nhị phân vào repo — plugin không build
  // trong CI, xem §9.1). Thiếu biến → UI hiện hướng dẫn build từ plugin-autocad/README.md.
  const pluginUrl = process.env.XBOSS_PLUGIN_URL || null;
  const lichSu = projectId == null ? [] : await layLichSuPluginUpload(projectId);
  // Thư viện block (M100 PR2) là tài nguyên TOÀN CỤC — không lọc theo dự án như lịch sử upload.
  // `choPhatHanh` để UI biết có hiện form phát hành không; quyền thật vẫn kiểm ở POST block-lib.
  const blockLib = { ...(await layTomTatBlockLib()), choPhatHanh: isAdminOrPm(user.role) };

  return NextResponse.json({ rulePack, pluginUrl, lichSu, blockLib });
}
