import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// DELETE /api/contracts/:id/addenda/:aid — xoá phụ lục (Admin/PM). Kiểm hợp đồng
// cha thuộc đúng dự án đang chọn (M22).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; aid: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá phụ lục (chỉ Admin/PM)" },
      { status: 403 },
    );

  const contractId = parseInt(params.id);
  const aid = parseInt(params.aid);
  if (isNaN(contractId) || isNaN(aid))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const addendum =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT a.id
             FROM contract_addenda a JOIN contracts c ON c.id = a.contract_id
            WHERE a.id = ? AND a.contract_id = ? AND c.project_id = ?`,
          aid,
          contractId,
          projectId,
        )
      : undefined;
  if (!addendum) return NextResponse.json({ error: "Không tìm thấy phụ lục" }, { status: 404 });

  await run(`DELETE FROM contract_addenda WHERE id = ?`, aid);
  return NextResponse.json({ deleted: aid });
}
