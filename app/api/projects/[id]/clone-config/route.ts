import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { cloneProjectConfig } from "@/lib/tien-do/clone-config";

export const dynamic = "force-dynamic";

function parseProjectId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// POST /api/projects/:id/clone-config — tạo dự án mới, sao chép CẤU HÌNH từ dự án nguồn
// (:id) mà KHÔNG sao chép dữ liệu giao dịch. Chỉ Admin (CAN.manageProjects). Body:
// { name, code?, investor?, contractor?, color? } (thông tin dự án mới).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới sao chép được dự án" }, { status: 403 });
  if (!Number.isSafeInteger(user.orgId) || user.orgId < 1)
    return NextResponse.json({ error: "Không xác định được tổ chức của Admin" }, { status: 403 });

  const sourceId = parseProjectId(params.id);
  if (sourceId === null)
    return NextResponse.json({ error: "ID dự án nguồn không hợp lệ" }, { status: 400 });
  const source = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
    sourceId,
    user.orgId,
  );
  if (!source) return NextResponse.json({ error: "Không tìm thấy dự án nguồn" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Thiếu tên dự án" }, { status: 400 });
  const code = typeof body?.code === "string" && body.code.trim() ? body.code.trim() : null;
  const investor =
    typeof body?.investor === "string" && body.investor.trim() ? body.investor.trim() : null;
  const contractor =
    typeof body?.contractor === "string" && body.contractor.trim() ? body.contractor.trim() : null;
  const color = typeof body?.color === "string" && body.color.trim() ? body.color.trim() : null;

  if (
    code &&
    (await queryOne(`SELECT id FROM projects WHERE code = ? AND org_id = ?`, code, user.orgId))
  )
    return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });

  const result = await cloneProjectConfig(
    sourceId,
    { name, code, investor, contractor, color },
    user.id,
    user.orgId,
  );
  return NextResponse.json({ id: result.projectId, cloned: result }, { status: 201 });
}
