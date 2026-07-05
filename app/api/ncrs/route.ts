import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { nextSeqCode, withUniqueRetry } from "@/lib/seqcode";

export const dynamic = "force-dynamic";

type NcrRow = {
  id: number;
  code: string;
  taskId: number | null;
  taskCode: string | null;
  description: string;
  assignedTo: number | null;
  assignedToName: string | null;
  dueDate: string | null;
  status: string;
  createdByName: string | null;
  createdAt: string;
  closedAt: string | null;
};

// GET /api/ncrs?status=&assignedTo=&taskId= — danh sách NCR (vòng đời mở → đóng).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const assignedTo = req.nextUrl.searchParams.get("assignedTo");
  const taskId = req.nextUrl.searchParams.get("taskId");

  const conds: string[] = [];
  const values: unknown[] = [];
  if (status) {
    conds.push("n.status = ?");
    values.push(status);
  }
  if (assignedTo) {
    conds.push("n.assigned_to = ?");
    values.push(parseInt(assignedTo));
  }
  if (taskId) {
    conds.push("n.task_id = ?");
    values.push(parseInt(taskId));
  }

  const rows = await query<NcrRow>(
    `SELECT n.id, n.code, n.task_id AS "taskId", t.code AS "taskCode",
            n.description, n.assigned_to AS "assignedTo", au.name AS "assignedToName",
            n.due_date AS "dueDate", n.status,
            cu.name AS "createdByName", n.created_at AS "createdAt", n.closed_at AS "closedAt"
       FROM ncrs n
       LEFT JOIN tasks t ON t.id = n.task_id
       LEFT JOIN users au ON au.id = n.assigned_to
       LEFT JOIN users cu ON cu.id = n.created_by
      ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
      ORDER BY (n.status = 'closed') ASC, n.due_date ASC NULLS LAST, n.id DESC`,
    ...values,
  );
  return NextResponse.json({ ncrs: rows });
}

// POST /api/ncrs — ghi nhận điểm không phù hợp mới (mọi vai trò thao tác).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ error: "Thiếu mô tả NCR" }, { status: 422 });

  const taskId = body?.taskId != null ? Number(body.taskId) : null;
  const inspectionId = body?.inspectionId != null ? Number(body.inspectionId) : null;
  const assignedTo = body?.assignedTo != null ? Number(body.assignedTo) : null;
  const dueDate = typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : null;

  const id = await withUniqueRetry(async () => {
    const code = await nextSeqCode("ncrs", "code", "NCR-", 4);
    return insertId(
      `INSERT INTO ncrs (code, task_id, inspection_id, description, assigned_to, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      code,
      taskId,
      inspectionId,
      description,
      assignedTo,
      dueDate,
      user.id,
    );
  });

  return NextResponse.json({ id }, { status: 201 });
}
