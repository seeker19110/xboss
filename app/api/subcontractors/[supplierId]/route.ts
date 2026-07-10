import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canViewSubcontractor } from "@/lib/auth";
import { getSubcontractor } from "@/lib/subcontractors";

export const dynamic = "force-dynamic";

// GET /api/subcontractors/:supplierId — hồ sơ đầy đủ + công nợ + đánh giá. Mọi vai trò
// đăng nhập xem được; subcon chỉ xem đúng NTP của mình (403 nếu khác).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  if (!(await canViewSubcontractor(user, supplierId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem hồ sơ nhà thầu phụ của mình" },
      { status: 403 },
    );

  const detail = await getSubcontractor(supplierId);
  if (!detail) return NextResponse.json({ error: "Không tìm thấy nhà thầu phụ" }, { status: 404 });

  return NextResponse.json({ item: detail });
}
