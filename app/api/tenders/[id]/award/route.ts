import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { awardTender } from "@/lib/tai-chinh/tender";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// POST /api/tenders/:id/award { bidId } — trao thầu (CAN.approve): chốt báo giá
// thắng, sinh 1 hợp đồng giao thầu (contracts, M16) cho NCC trúng thầu, khoá sửa.
// Gói thầu phải thuộc dự án đang chọn (M22); hợp đồng sinh ra gán cùng project_id.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được trao thầu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const bidId = Number(body?.bidId);
  if (!Number.isInteger(bidId))
    return NextResponse.json({ error: "Thiếu báo giá được chọn" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy gói thầu" }, { status: 404 });

  try {
    // D01: tái kiểm quyền với dữ liệu có hiệu lực trong cùng transaction với awardTender (reentrant).
    const kq = await ghiNeuConQuyen(
      () => CAN.approve(user.role),
      () => awardTender(id, bidId, user.id, projectId),
    );
    if (!kq.ok) return NextResponse.json({ error: "Chỉ Admin/PM được trao thầu" }, { status: 403 });
    const { contractId } = kq.value;
    return NextResponse.json({ awarded: id, contractId });
  } catch (err: unknown) {
    return phanHoiLoiCoStatus(err);
  }
}
