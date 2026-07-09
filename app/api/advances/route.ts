import { NextRequest, NextResponse } from "next/server";
import { insertId, query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ADVANCE_STATUSES,
  parseAdvanceBody,
  validateAdvanceInput,
  type AdvanceInput,
  type AdvanceStatus,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

export type AdvanceRow = AdvanceInput & {
  id: number;
  settledAmount: number;
  status: AdvanceStatus;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// GET /api/advances?status= — tạm ứng & hoàn ứng, scoped theo dự án đang chọn (M22).
// Xem: CAN.viewPayments (admin/pm/bch).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem tạm ứng" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  if (status && !ADVANCE_STATUSES.includes(status as AdvanceStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ advances: [] });

  const conds = ["a.project_id = ?"];
  const args: unknown[] = [projectId];
  if (status) {
    conds.push("a.status = ?");
    args.push(status);
  }
  const advances = await query<AdvanceRow>(
    `SELECT a.id, a.code, a.advance_date AS "advanceDate", a.amount, a.recipient, a.reason,
            a.settled_amount AS "settledAmount", a.status, a.proposal_id AS "proposalId",
            a.created_by AS "createdBy", u.name AS "createdByName", a.created_at AS "createdAt"
       FROM advances a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE ${conds.join(" AND ")}
      ORDER BY a.advance_date DESC NULLS LAST, a.id DESC`,
    ...args,
  );
  return NextResponse.json({ advances });
}

// POST /api/advances — tạo tạm ứng (manageFinance: Admin/PM). project_id gán = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo tạm ứng (Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo tạm ứng" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseAdvanceBody(body);
  const invalid = validateAdvanceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO advances (project_id, code, advance_date, amount, recipient, reason,
                            proposal_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.code,
    input.advanceDate,
    input.amount,
    input.recipient,
    input.reason,
    input.proposalId,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
