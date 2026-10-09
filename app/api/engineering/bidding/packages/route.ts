import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  createBiddingPackage,
  listBiddingPackages,
} from "@/lib/ky-thuat/engineering-bidding-matrix";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/bidding/packages
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập đấu thầu" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  const discipline = searchParams.get("discipline") || undefined;
  const status = searchParams.get("status") || undefined;

  try {
    const packages = await listBiddingPackages(projectId, { discipline, status });
    return NextResponse.json({ success: true, data: packages });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/bidding/packages
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo gói thầu" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      await getCurrentProjectId(user),
    );
    if (!chotDuAn.ok) {
      return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    }
    const projectId = chotDuAn.projectId;

    if (!body.packageCode || !body.title || !body.discipline || body.targetBudgetVnd == null) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (packageCode, title, discipline, targetBudgetVnd)" },
        { status: 422 },
      );
    }

    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageEngineeringGraph(user.role),
      () =>
        createBiddingPackage({
          projectId,
          packageCode: body.packageCode,
          title: body.title,
          discipline: body.discipline,
          targetBudgetVnd: Number(body.targetBudgetVnd),
          rfqSpecs: body.rfqSpecs || {},
          createdBy: user.id,
        }),
    );
    if (!kq.ok) return NextResponse.json({ error: "Không có quyền tạo gói thầu" }, { status: 403 });
    const pkg = kq.value;

    return NextResponse.json({ success: true, data: pkg });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
