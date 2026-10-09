import { laLoiKhoaNgoai, phanHoiXungDotPhuThuoc } from "@/lib/nen/loi";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { deleteAlertRule } from "@/lib/van-hanh/alerts";
import { queryOne } from "@/lib/db";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// DELETE /api/admin/alert-rules/:id — chỉ Admin. Xoá xong metric quay lại default cũ.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  try {
    const params = await paramsP;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (!CAN.manageAlertRules(user.role))
      return NextResponse.json(
        { error: "Chỉ Admin được cấu hình ngưỡng cảnh báo" },
        { status: 403 },
      );

    const id = parseInt(params.id);
    if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

    // S02: chỉ xoá rule thuộc tổ chức người gọi; id của org khác → 404.
    const rule = await queryOne(
      `SELECT 1 FROM alert_rules WHERE id = ? AND org_id = ?`,
      id,
      user.orgId,
    );
    if (!rule)
      return NextResponse.json({ error: "Không tìm thấy ngưỡng cảnh báo" }, { status: 404 });

    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageAlertRules(user.role),
      () => deleteAlertRule(id, user.orgId),
    );
    if (!kq.ok)
      return NextResponse.json(
        { error: "Chỉ Admin được cấu hình ngưỡng cảnh báo" },
        { status: 403 },
      );
    return NextResponse.json({ deleted: id });
  } catch (err) {
    if (laLoiKhoaNgoai(err)) return phanHoiXungDotPhuThuoc();
    throw err;
  }
}
