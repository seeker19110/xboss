import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/contracts/:id/addenda/:aid — xoá phụ lục (Admin/PM).
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

  const addendum = await queryOne<{ id: number }>(
    `SELECT id FROM contract_addenda WHERE id = ? AND contract_id = ?`,
    aid,
    contractId,
  );
  if (!addendum) return NextResponse.json({ error: "Không tìm thấy phụ lục" }, { status: 404 });

  await run(`DELETE FROM contract_addenda WHERE id = ?`, aid);
  return NextResponse.json({ deleted: aid });
}
