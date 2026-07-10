import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { upsertSubcontractorProfile } from "@/lib/subcontractors";

export const dynamic = "force-dynamic";

// PATCH /api/subcontractors/:supplierId/profile — upsert hồ sơ mở rộng (sơ đồ tổ chức,
// người đại diện công trường, năng lực). Chỉ Admin/PM (CAN.manageSuppliers).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageSuppliers(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được sửa hồ sơ nhà thầu phụ" },
      { status: 403 },
    );

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const supplier = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierId);
  if (!supplier)
    return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  await upsertSubcontractorProfile(supplierId, {
    projectId: body.projectId != null ? Number(body.projectId) : null,
    orgChartNote: str(body.orgChartNote),
    siteRepName: str(body.siteRepName),
    siteRepPhone: str(body.siteRepPhone),
    capabilitySummary: str(body.capabilitySummary),
  });

  return NextResponse.json({ ok: true });
}
