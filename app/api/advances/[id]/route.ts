import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  parseAdvanceBody,
  validateAdvanceInput,
  type AdvanceInput,
  type AdvanceStatus,
} from "@/lib/tai-chinh/finance";

export const dynamic = "force-dynamic";

type ExistingRow = AdvanceInput & { settledAmount: number; status: AdvanceStatus };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT code, advance_date AS "advanceDate", amount, recipient, reason,
            proposal_id AS "proposalId", settled_amount AS "settledAmount", status
       FROM advances WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/advances/:id — scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem tạm ứng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const advance = await withProjectScope(projectId ?? "*", () => loadExisting(id, projectId));
  if (!advance) return NextResponse.json({ error: "Không tìm thấy tạm ứng" }, { status: 404 });

  return NextResponse.json({ advance: { ...advance, id } });
}

// PATCH /api/advances/:id  body: { action: 'settle', settleAmount } để hoàn ứng từng
// phần/toàn phần (cộng dồn settled_amount, tự suy status), hoặc các field thường để
// sửa thông tin tạm ứng. manageFinance: Admin/PM.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa tạm ứng (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tạm ứng" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (body.action === "settle") {
    const settleAmount = Number(body.settleAmount);
    if (!Number.isFinite(settleAmount) || settleAmount <= 0)
      return NextResponse.json({ error: "Số tiền hoàn ứng phải > 0" }, { status: 422 });

    // Cộng dồn + suy status NGAY TRONG SQL, điều kiện nằm trong WHERE của cùng câu UPDATE:
    //   - không cộng tiền trên float JS (NUMERIC → parseFloat, quy ước M45);
    //   - atomic: 2 lượt hoàn ứng đồng thời không thể cùng vượt số tạm ứng (trước đây
    //     đọc settled_amount ở JS rồi ghi đè → lượt sau có thể vượt hoặc ghi đè lượt trước).
    // Luật status giữ đúng deriveAdvanceStatus (lib/tai-chinh/finance.ts).
    const updated = await queryOne<{ settledAmount: number; status: AdvanceStatus }>(
      `UPDATE advances
          SET settled_amount = settled_amount + ?::numeric,
              status = CASE WHEN settled_amount + ?::numeric >= amount THEN 'settled'
                            ELSE 'partially_settled' END
        WHERE id = ? AND project_id = ? AND status <> 'settled'
          AND settled_amount + ?::numeric <= amount
        RETURNING settled_amount AS "settledAmount", status`,
      settleAmount,
      settleAmount,
      id,
      projectId,
      settleAmount,
    );
    if (!updated) {
      // Không ghi được: đọc lại để báo đúng lý do (đã hoàn tất hay vượt số còn lại).
      const now = await loadExisting(id, projectId);
      if (!now) return NextResponse.json({ error: "Không tìm thấy tạm ứng" }, { status: 404 });
      if (now.status === "settled")
        return NextResponse.json(
          { error: "Tạm ứng đã hoàn tất, không thể hoàn thêm" },
          { status: 409 },
        );
      return NextResponse.json(
        { error: "Số tiền hoàn ứng vượt quá số tiền đã tạm ứng còn lại" },
        { status: 422 },
      );
    }
    return NextResponse.json({ updated: id, ...updated });
  }

  const merged = { ...existing, ...body };
  const input = parseAdvanceBody(merged);
  const invalid = validateAdvanceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  // Số tiền mới không được nhỏ hơn số đã hoàn; status suy lại theo số tiền mới (vd tạm ứng
  // đã hoàn hết mà tăng số tiền thì trở lại "hoàn một phần"). So sánh/suy trong SQL để không
  // so tiền trên float JS (M45) và atomic với lượt hoàn ứng chạy song song.
  const updated = await queryOne<{ id: number }>(
    `UPDATE advances SET code = ?, advance_date = ?, amount = ?::numeric, recipient = ?,
            reason = ?, proposal_id = ?,
            status = CASE WHEN settled_amount >= ?::numeric THEN 'settled'
                          WHEN settled_amount > 0 THEN 'partially_settled'
                          ELSE 'open' END
      WHERE id = ? AND project_id = ? AND settled_amount <= ?::numeric
      RETURNING id`,
    input.code,
    input.advanceDate,
    input.amount,
    input.recipient,
    input.reason,
    input.proposalId,
    input.amount,
    id,
    projectId,
    input.amount,
  );
  if (!updated)
    return NextResponse.json(
      { error: "Số tiền tạm ứng không được nhỏ hơn số đã hoàn ứng" },
      { status: 422 },
    );

  return NextResponse.json({ updated: id });
}

// DELETE /api/advances/:id — xoá tạm ứng (manageFinance: Admin/PM). Chặn khi đã hoàn
// ứng một phần/toàn phần để không mất dấu vết tiền đã hoàn.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá tạm ứng (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tạm ứng" }, { status: 404 });
  if (existing.status !== "open")
    return NextResponse.json(
      { error: "Tạm ứng đã hoàn ứng (một phần/toàn phần), không thể xoá" },
      { status: 409 },
    );

  await run(`DELETE FROM advances WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
