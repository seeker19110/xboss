import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { upsertSubcontractorProfile } from "@/lib/hien-truong/subcontractors";

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

  // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy (PM không
  // phải global như Admin, xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts). Giữ nguyên
  // ngữ nghĩa cũ: bỏ trống/null = hồ sơ không gắn dự án (không mặc định về dự án hiện tại) —
  // đọc vào biến riêng (không truy cập trường projectId trong body trần thêm lần nào ngoài
  // lời gọi chotProjectIdChoGhi) để cổng check:project-scope nhận diện đúng đây là đã chốt quyền.
  const { projectId: projectIdTuBody } = body as { projectId?: unknown };
  let projectId: number | null = null;
  if (projectIdTuBody != null && projectIdTuBody !== "") {
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      projectIdTuBody,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok)
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    projectId = chotDuAn.projectId;
  }

  await upsertSubcontractorProfile(supplierId, {
    projectId,
    orgChartNote: str(body.orgChartNote),
    siteRepName: str(body.siteRepName),
    siteRepPhone: str(body.siteRepPhone),
    capabilitySummary: str(body.capabilitySummary),
  });

  return NextResponse.json({ ok: true });
}
