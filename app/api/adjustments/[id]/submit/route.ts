import { NextRequest, NextResponse } from "next/server";
import { withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { gioiHanGhiTaiChinh } from "@/lib/bao-mat/ratelimit";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { trinhDieuChinh } from "@/lib/dich-vu/dieu-chinh-ipc";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// POST /api/adjustments/:id/submit — M128: trình chứng từ nháp (CHỈ người lập, Admin/PM).
// Chốt lại giá trị dưới khoá HĐ → đợt → chứng từ; đợt gốc đã đi engine + còn flow 'payment_cert'
// active → mở yêu cầu duyệt engine (lib/dich-vu/dieu-chinh-ipc.ts).
// 200 { submitted } | 403 | 404 | 409 adjustment_not_draft | 422 items_required.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const gioiHan = await gioiHanGhiTaiChinh("dc-trinh", user.id);
  if (gioiHan)
    return NextResponse.json(
      { error: gioiHan.error },
      { status: 429, headers: { "Retry-After": gioiHan.retryAfter } },
    );
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được trình chứng từ điều chỉnh" },
      { status: 403 },
    );
  const id = parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Không tìm thấy chứng từ điều chỉnh" },
      { status: 404, headers: NO_STORE },
    );
  try {
    await withProjectScope(
      projectId,
      () => trinhDieuChinh({ id, projectId, orgId: user.orgId, user }),
      { readOnly: false },
    );
  } catch (err) {
    return phanHoiLoiCoStatus(err, "Lỗi máy chủ khi trình chứng từ điều chỉnh");
  }
  return NextResponse.json({ submitted: id }, { headers: NO_STORE });
}
