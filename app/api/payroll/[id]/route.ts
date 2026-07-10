import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parsePayrollBody, validatePayrollInput, type PayrollInput } from "@/lib/finance";

export const dynamic = "force-dynamic";

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<PayrollInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<PayrollInput>(
    `SELECT period, crew_id AS "crewId", personnel_id AS "personnelId", workdays, rate,
            gross, deductions, net, status
       FROM payroll WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/payroll/:id — scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem lương" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const payroll = await loadExisting(id, projectId);
  if (!payroll) return NextResponse.json({ error: "Không tìm thấy kỳ lương" }, { status: 404 });

  return NextResponse.json({ payroll: { ...payroll, id } });
}

// PATCH /api/payroll/:id — sửa số liệu hoặc đổi trạng thái draft→approved→paid
// (manageFinance: Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa kỳ lương (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy kỳ lương" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged = { ...existing, ...body };
  const input = parsePayrollBody(merged);
  const invalid = validatePayrollInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.crewId != null) {
    const crew = await queryOne(
      `SELECT id FROM crews WHERE id = ? AND project_id = ?`,
      input.crewId,
      projectId,
    );
    if (!crew) return NextResponse.json({ error: "Tổ đội không tồn tại" }, { status: 422 });
  }
  if (input.personnelId != null) {
    const person = await queryOne(
      `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
      input.personnelId,
      projectId,
    );
    if (!person) return NextResponse.json({ error: "Nhân sự không tồn tại" }, { status: 422 });
  }

  await run(
    `UPDATE payroll SET period = ?, crew_id = ?, personnel_id = ?, workdays = ?, rate = ?,
            gross = ?, deductions = ?, net = ?, status = ?
      WHERE id = ?`,
    input.period,
    input.crewId,
    input.personnelId,
    input.workdays,
    input.rate,
    input.gross,
    input.deductions,
    input.net,
    input.status,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/payroll/:id — xoá kỳ lương (manageFinance: Admin/PM). Chặn khi đã 'paid'
// để giữ dấu vết (mirror advances DELETE chặn khi đã hoàn ứng).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá kỳ lương (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy kỳ lương" }, { status: 404 });
  if (existing.status === "paid")
    return NextResponse.json(
      { error: "Kỳ lương đã trả, không thể xoá để giữ dấu vết" },
      { status: 409 },
    );

  await run(`DELETE FROM payroll WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
