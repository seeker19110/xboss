import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { layThongTinGoiCai } from "@/lib/ky-thuat/cad/plugin-package";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/plugin-package — version + sha256 của gói cài plugin AutoCAD (§13
// P8), cho trang /engineering/cai-dat-plugin hiện được để kỹ sư tự đối chiếu gói đã tải về.
// version đọc từ plugin-autocad/Directory.Build.props (nguồn sự thật duy nhất, dong-goi.ps1
// dùng chính thẻ này lúc đóng gói); sha256 chỉ có khi quản trị khai biến môi trường
// XBOSS_PLUGIN_SHA256. Thiếu bất kỳ nguồn nào → trả null, KHÔNG bịa số (fail mềm).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem thông tin gói cài plugin" },
      { status: 403 },
    );
  }

  const thongTin = await layThongTinGoiCai();
  return NextResponse.json(thongTin);
}
