import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getVariation } from "@/lib/vo";

export const dynamic = "force-dynamic";

// POST /api/variations/:id/contract-add — đưa VO đã duyệt (toàn phần/một phần)
// vào phụ lục hợp đồng (contract_addenda, M16): sinh 1 dòng phụ lục = giá trị đã
// duyệt của VO, chuyển VO sang 'contract_added'. Admin/PM (CAN.manageContracts —
// cùng quyền quản hợp đồng/phụ lục). body: { contractId, addendaCode, signedDate? }
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền đưa phát sinh vào phụ lục hợp đồng (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const contractId = Number(body?.contractId);
  const addendaCode = typeof body?.addendaCode === "string" ? body.addendaCode.trim() : "";
  const signedDate =
    typeof body?.signedDate === "string" && body.signedDate.trim() ? body.signedDate.trim() : null;
  if (!Number.isInteger(contractId))
    return NextResponse.json({ error: "Thiếu hợp đồng" }, { status: 422 });
  if (!addendaCode) return NextResponse.json({ error: "Thiếu mã phụ lục" }, { status: 422 });

  const vo = await getVariation(id);
  if (!vo) return NextResponse.json({ error: "Không tìm thấy phát sinh" }, { status: 404 });
  if (vo.status !== "approved" && vo.status !== "partially_approved")
    return NextResponse.json(
      { error: "Chỉ đưa vào phụ lục HĐ được phát sinh đã duyệt (toàn phần hoặc một phần)" },
      { status: 409 },
    );

  const contract = await queryOne<{ id: number }>(
    `SELECT id FROM contracts WHERE id = ?`,
    contractId,
  );
  if (!contract) return NextResponse.json({ error: "Hợp đồng không tồn tại" }, { status: 422 });

  try {
    const addendaId = await withTransaction(async () => {
      const addendaId = await insertId(
        `INSERT INTO contract_addenda (contract_id, code, title, value_delta, signed_date, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        contractId,
        addendaCode,
        vo.title,
        vo.approvedValue,
        signedDate,
        `Từ phát sinh ${vo.code}`,
        user.id,
      );
      await run(
        `UPDATE variation_orders SET status = 'contract_added', contract_id = ? WHERE id = ?`,
        contractId,
        id,
      );
      return addendaId;
    });
    return NextResponse.json({ addendaId, contractId }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Mã phụ lục "${addendaCode}" đã tồn tại trong hợp đồng này` },
        { status: 409 },
      );
    throw err;
  }
}
