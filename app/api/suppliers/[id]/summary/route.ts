import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { supplierSummary } from "@/lib/tai-chinh/procurement";

export const dynamic = "force-dynamic";

// GET /api/suppliers/:id/summary → điểm TB 3 tiêu chí + công nợ + lịch sử đánh giá.
// Điểm đánh giá cùng ranh giới với GET /api/suppliers (chỉ cần đăng nhập), nhưng khối
// TIỀN (totalOrdered/totalPaid/debt) gate riêng bằng CAN.viewPayments — trước đây subcon/
// viewer/cdt đọc được công nợ NCC (audit 2026-09-05). Công nợ cũng lọc theo dự án đang chọn.
export async function GET(
  _req: NextRequest,
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

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const summary = await supplierSummary(id, projectId, !CAN.viewPayments(user.role));
  return NextResponse.json(summary);
}
