import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { supplierSummary } from "@/lib/procurement";

export const dynamic = "force-dynamic";

// GET /api/suppliers/:id/summary → điểm TB 3 tiêu chí + công nợ + lịch sử đánh giá.
// Cùng ranh giới quyền với GET /api/suppliers (chỉ cần đăng nhập, không riêng vai trò).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const supplier = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, id);
  if (!supplier)
    return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const summary = await supplierSummary(id);
  return NextResponse.json(summary);
}
