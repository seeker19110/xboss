import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { runBiddingAnalysis } from "@/lib/ky-thuat/engineering-bidding-matrix";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/bidding/analyze
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện phân tích đấu thầu" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

    if (!body.packageId) {
      return NextResponse.json({ error: "Thiếu tham số packageId" }, { status: 400 });
    }

    const result = await runBiddingAnalysis(projectId, body.packageId, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    // Gói thầu không tồn tại HOẶC thuộc dự án khác (`runBiddingAnalysis` đã lọc `project_id`
    // trong SELECT) phải ra 404, không phải 500: đó là kết quả nghiệp vụ bình thường.
    // Hàm lib ném LoiNghiepVu mang sẵn mã nên chỉ cần `phanHoiLoi` — không dò chuỗi thông
    // điệp như bản cũ (mục ruỗng ngay khi ai đó sửa câu chữ tiếng Việt); lỗi hệ thống thật
    // vẫn ra 500.
    return phanHoiLoi(err);
  }
}
