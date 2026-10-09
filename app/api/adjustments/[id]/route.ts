import { NextRequest, NextResponse } from "next/server";
import { withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { laLoiKhoaNgoai, phanHoiLoiCoStatus, phanHoiXungDotPhuThuoc } from "@/lib/nen/loi";
import { isMoneyPrecisionError, moneyWireFormat, MONEY_FORMAT_HEADER } from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";
import { docDauVaoSua, suaDieuChinh, xoaDieuChinh } from "@/lib/tai-chinh/ipc-dieu-chinh";
import { dieuChinhToWire, getDieuChinh } from "@/lib/tai-chinh/ipc-dieu-chinh-doc";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS_API_TIEN });
const KHONG_THAY = "Không tìm thấy chứng từ điều chỉnh";
const LOI_QUYEN = "Chỉ Admin/PM được sửa/xoá chứng từ điều chỉnh";

function docId(s: string): number | null {
  const id = parseInt(s, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// PATCH /api/adjustments/:id — M128: sửa chứng từ NHÁP — CHỈ người lập (Admin/PM); người khác,
// kể cả Admin, → 403 (SoD: người duyệt chỉ bị so với người lập nên sửa nháp người khác = lách).
// body: { reason?, items?: [{ boqItemId, qtyDelta, note? }] } — reversal chỉ sửa được reason
// (items → 422 reversal_items_fixed). 200 chứng từ | 403 | 404 | 409 adjustment_not_draft | 422.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  if (!CAN.manageContracts(user.role)) return json({ error: LOI_QUYEN }, 403);
  const id = docId((await params).id);
  if (id == null) return json({ error: "ID không hợp lệ" }, 400);

  const input = docDauVaoSua(await req.json().catch(() => null));
  if ("error" in input) return json({ error: input.error, code: input.code }, input.status);
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null) return json({ error: KHONG_THAY }, 404);
  try {
    const row = await withProjectScope(
      projectId,
      async () => {
        await suaDieuChinh({ id, projectId, orgId: user.orgId, user, input });
        return getDieuChinh(id, projectId);
      },
      { readOnly: false },
    );
    return json({ ...dieuChinhToWire([row!], user, format)[0], ...nhanDinhDangTien(format) });
  } catch (err) {
    if (isMoneyPrecisionError(err)) return json(LOI_TIEN_VUOT_DINH_DANG_CU, 422);
    return phanHoiLoiCoStatus(err, "Lỗi máy chủ khi sửa chứng từ điều chỉnh");
  }
}

// DELETE /api/adjustments/:id — xoá chứng từ NHÁP (người lập hoặc Admin). Đã trình/duyệt/từ chối
// → 409 adjustment_not_draft (không xoá lịch sử). 200 { deleted } | 403 | 404.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  if (!CAN.manageContracts(user.role)) return json({ error: LOI_QUYEN }, 403);
  const id = docId((await params).id);
  if (id == null) return json({ error: "ID không hợp lệ" }, 400);

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null) return json({ error: KHONG_THAY }, 404);
  try {
    await withProjectScope(
      projectId,
      () => xoaDieuChinh({ id, projectId, orgId: user.orgId, user }),
      { readOnly: false },
    );
    return json({ deleted: id });
  } catch (err) {
    if (laLoiKhoaNgoai(err)) return phanHoiXungDotPhuThuoc();
    return phanHoiLoiCoStatus(err, "Lỗi máy chủ khi xoá chứng từ điều chỉnh");
  }
}
