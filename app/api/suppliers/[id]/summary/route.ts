import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { supplierSummary } from "@/lib/tai-chinh/procurement";
import { MONEY_FORMAT_HEADER, isMoneyPrecisionError, moneyWireFormat } from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  moneyFieldsToWire,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/suppliers/:id/summary → điểm TB 3 tiêu chí + công nợ + lịch sử đánh giá.
// Điểm đánh giá cùng ranh giới với GET /api/suppliers (chỉ cần đăng nhập), nhưng khối
// TIỀN (totalOrdered/totalPaid/debt) gate riêng bằng CAN.viewPayments — trước đây subcon/
// viewer/cdt đọc được công nợ NCC (audit 2026-09-05). Công nợ cũng lọc theo dự án đang chọn.
// S10c (A3-FR06): header decimal-string-v1 → khối tiền là chuỗi canonical + `moneyFormat`;
// legacy → number, ngoài biên round-trip → 422 `money_precision_unsupported`. Khối tiền bị
// bỏ (null) giữ null ở cả hai định dạng — người thiếu quyền không bao giờ nhận 422 do độ lớn.
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Lọc theo org_id (M22/multi-org) — cùng ranh giới với GET /api/suppliers. Thiếu điều
  // kiện này thì user tổ chức A đoán supplierId của tổ chức B vẫn đọc được điểm đánh
  // giá/công nợ/lịch sử của NCC tổ chức khác (BUG THẬT đã vá).
  const supplier = await queryOne(
    `SELECT id FROM suppliers WHERE id = ? AND org_id = ?`,
    id,
    user.orgId,
  );
  if (!supplier)
    return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  // Không có ngữ cảnh dự án → vẫn trả điểm đánh giá (200), chỉ bỏ khối tiền: thà thiếu số
  // còn hơn cộng gộp công nợ của dự án người xem không thuộc.
  const projectId = await getCurrentProjectId(user);
  const summary = await supplierSummary(id, projectId, !CAN.viewPayments(user.role));
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  try {
    const wire = moneyFieldsToWire(summary, ["totalOrdered", "totalPaid", "debt"], format);
    return NextResponse.json(
      { ...wire, ...nhanDinhDangTien(format) },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
}
