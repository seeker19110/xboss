import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { pendingForUserDisplay } from "@/lib/tien-do/approvals";
import { withProjectScope } from "@/lib/db";
import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { ENTITY_DIEU_CHINH, hopThuDieuChinh } from "@/lib/dich-vu/dieu-chinh-ipc";

export const dynamic = "force-dynamic";

// GET /api/approvals/inbox — hộp thư "chờ tôi duyệt" hợp nhất (M46 PR3): mọi entity_type
// (variation/payment_cert/proposal/task_acceptance) có approval_request đang chờ bước
// thuộc vai trò user hiện tại (admin thấy mọi bước, SoD loại request do chính user tạo).
// M128: + chứng từ điều chỉnh IPC 'submitted' user quyết định được (qua engine hoặc trực tiếp
// Admin/PM) — cùng khuôn phần tử, thêm `kind: 'adjustment'`, `adjustmentKind`
// ('adjustment'|'reversal'), `entityId` = id chứng từ, `id` âm (không trùng id request); UI gọi
// POST /api/adjustments/:entityId/decide. Giá trị vượt độ chính xác wire number → 422 có mã.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  if (projectId == null) return NextResponse.json({ items: [] });
  // Request engine của chứng từ điều chỉnh do hopThuDieuChinh dựng (nhãn/link/tiền đúng) — bỏ bản
  // nhãn chung của pendingForUserDisplay để không lặp.
  const engine = (await pendingForUserDisplay(user, projectId)).filter(
    (it) => it.entityType !== ENTITY_DIEU_CHINH,
  );
  // Bảng chứng từ điều chỉnh FORCE RLS theo dự án → đọc trong phạm vi dự án.
  let dieuChinh;
  try {
    dieuChinh = await withProjectScope(projectId, () => hopThuDieuChinh(user, projectId));
  } catch (err) {
    return phanHoiLoiCoStatus(err, "Lỗi máy chủ khi tải hộp thư duyệt");
  }
  return NextResponse.json({ items: [...engine, ...dieuChinh] });
}
