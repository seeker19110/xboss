import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  deriveAdvanceStatus,
  parseAdvanceBody,
  validateAdvanceInput,
  type AdvanceInput,
  type AdvanceStatus,
} from "@/lib/finance";

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
    if (existing.status === "settled")
      return NextResponse.json(
        { error: "Tạm ứng đã hoàn tất, không thể hoàn thêm" },
        { status: 409 },
      );

    const newSettled = existing.settledAmount + settleAmount;
    if (newSettled > existing.amount)
      return NextResponse.json(
        { error: "Số tiền hoàn ứng vượt quá số tiền đã tạm ứng còn lại" },
        { status: 422 },
      );
    const newStatus = deriveAdvanceStatus(existing.amount, newSettled);

    await run(
      `UPDATE advances SET settled_amount = ?, status = ? WHERE id = ?`,
      newSettled,
      newStatus,
      id,
    );
    return NextResponse.json({ updated: id, settledAmount: newSettled, status: newStatus });
  }

  const merged = { ...existing, ...body };
  const input = parseAdvanceBody(merged);
  const invalid = validateAdvanceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE advances SET code = ?, advance_date = ?, amount = ?, recipient = ?, reason = ?,
            proposal_id = ?
      WHERE id = ?`,
    input.code,
    input.advanceDate,
    input.amount,
    input.recipient,
    input.reason,
    input.proposalId,
    id,
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
