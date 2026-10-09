import { NextRequest, NextResponse } from "next/server";
import { moneyInputErrorBody } from "@/lib/nen/money";
import { insertId, query, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  ADVANCE_STATUSES,
  parseAdvanceBody,
  validateAdvanceInput,
  type AdvanceInput,
  type AdvanceStatus,
} from "@/lib/tai-chinh/finance";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

export type AdvanceRow = AdvanceInput & {
  id: number;
  settledAmount: number;
  /** amount − settled_amount, tính trong SQL. */
  remaining: number;
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
  const advances = await withProjectScope(projectId, () =>
    query<AdvanceRow>(
      `SELECT a.id, a.code, a.advance_date AS "advanceDate", a.amount, a.recipient, a.reason,
              a.settled_amount AS "settledAmount",
              (a.amount - a.settled_amount) AS "remaining", a.status, a.proposal_id AS "proposalId",
              a.created_by AS "createdBy", u.name AS "createdByName", a.created_at AS "createdAt"
         FROM advances a
         LEFT JOIN users u ON u.id = a.created_by
        WHERE ${conds.join(" AND ")}
        ORDER BY a.advance_date DESC NULLS LAST, a.id DESC`,
      ...args,
    ),
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

  // S10: tiền đọc exact — "1.234.567" kiểu vi-VN → 400, vượt NUMERIC(15,2) → 422.
  let input: AdvanceInput;
  try {
    input = parseAdvanceBody(body);
  } catch (err) {
    const loi = moneyInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  const invalid = validateAdvanceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await ghiNeuConQuyen(
    () => CAN.manageFinance(user.role),
    () =>
      insertId(
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
      ),
  );
  if (!kq.ok)
    return NextResponse.json(
      { error: "Bạn không có quyền tạo tạm ứng (Admin/PM)" },
      { status: 403 },
    );

  return NextResponse.json({ id: kq.value }, { status: 201 });
}
