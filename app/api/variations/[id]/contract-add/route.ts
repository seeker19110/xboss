import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { isValidDateISO } from "@/lib/nen/date";

export const dynamic = "force-dynamic";

class ContractAddError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// POST /api/variations/:id/contract-add — đưa VO đã duyệt (toàn phần/một phần)
// vào phụ lục hợp đồng (contract_addenda, M16): sinh 1 dòng phụ lục = giá trị đã
// duyệt của VO, chuyển VO sang 'contract_added'. Admin/PM (CAN.manageContracts —
// cùng quyền quản hợp đồng/phụ lục). body: { contractId, addendaCode, signedDate? }
// Cả VO và hợp đồng đích đều phải thuộc đúng dự án đang chọn (M22).
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
  if (signedDate && !isValidDateISO(signedDate))
    return NextResponse.json({ error: "Ngày ký không đúng định dạng YYYY-MM-DD" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  try {
    const addendaId = await withTransaction(async () => {
      // Lock order is always VO → target contract. Concurrent requests for one VO
      // serialize here even when they target different contracts.
      const vo = await queryOne<{
        id: number;
        code: string;
        title: string;
        status: string;
        contractId: number | null;
      }>(
        `SELECT id, code, title, status, contract_id AS "contractId" FROM variation_orders
          WHERE id = ? AND project_id = ? FOR UPDATE`,
        id,
        projectId,
      );
      if (!vo) throw new ContractAddError("Không tìm thấy phát sinh", 404);
      if (vo.status === "contract_added")
        throw new ContractAddError(
          "Phát sinh này đã được đưa vào phụ lục hợp đồng",
          409,
        );
      if (vo.status !== "approved" && vo.status !== "partially_approved")
        throw new ContractAddError(
          "Chỉ đưa vào phụ lục HĐ được phát sinh đã duyệt (toàn phần hoặc một phần)",
          409,
        );
      if (vo.contractId != null && vo.contractId !== contractId)
        throw new ContractAddError("Phát sinh đã được liên kết với hợp đồng khác", 409);

      const contract = await queryOne<{ id: number }>(
        `SELECT id FROM contracts WHERE id = ? AND project_id = ? FOR UPDATE`,
        contractId,
        projectId,
      );
      if (!contract) throw new ContractAddError("Hợp đồng không tồn tại", 422);

      // Legacy schema has no source-VO FK on contract_addenda. The exact generated
      // note is the existing provenance marker; reject a pre-existing link rather
      // than silently writing a second addendum if VO status was repaired manually.
      const sourceNote = `Từ phát sinh ${vo.code}`;
      const existingAddendum = await queryOne<{ id: number }>(
        `SELECT id FROM contract_addenda WHERE note = ? LIMIT 1`,
        sourceNote,
      );
      if (existingAddendum)
        throw new ContractAddError("Phát sinh này đã có phụ lục hợp đồng", 409);

      const value = await queryOne<{ approvedValue: number }>(
        `SELECT COALESCE(SUM(COALESCE(qty_approved, 0) * unit_price), 0) AS "approvedValue"
           FROM boq_items WHERE vo_id = ?`,
        id,
      );
      const addendaId = await insertId(
        `INSERT INTO contract_addenda (contract_id, code, title, value_delta, signed_date, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        contractId,
        addendaCode,
        vo.title,
        value?.approvedValue ?? 0,
        signedDate,
        sourceNote,
        user.id,
      );
      const transition = await run(
        `UPDATE variation_orders SET status = 'contract_added', contract_id = ?
          WHERE id = ? AND project_id = ? AND status IN ('approved', 'partially_approved')`,
        contractId,
        id,
        projectId,
      );
      if (transition.changes !== 1)
        throw new ContractAddError("Phát sinh đã thay đổi; hãy tải lại trước khi thử lại", 409);
      return addendaId;
    });
    return NextResponse.json({ addendaId, contractId }, { status: 201 });
  } catch (err) {
    if (err instanceof ContractAddError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Mã phụ lục "${addendaCode}" đã tồn tại trong hợp đồng này` },
        { status: 409 },
      );
    throw err;
  }
}
