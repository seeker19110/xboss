import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RequestDetail = {
  id: number;
  code: string;
  scheduledAt: string;
  status: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};
type TaskRow = { id: number; code: string; name: string; sheetType: string | null };

// GET /api/inspection-requests/:id — chi tiết phiếu YCNT kèm danh sách task.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const requestRow = await queryOne<RequestDetail>(
    `SELECT r.id, r.code, r.scheduled_at AS "scheduledAt", r.status, r.note,
            cu.name AS "createdByName", r.created_at AS "createdAt"
       FROM inspection_requests r
       LEFT JOIN users cu ON cu.id = r.created_by
      WHERE r.id = ?`,
    id,
  );
  if (!requestRow)
    return NextResponse.json({ error: "Không tìm thấy phiếu YCNT" }, { status: 404 });

  const tasks = await query<TaskRow>(
    `SELECT t.id, t.code, t.name, st.code AS "sheetType"
       FROM inspection_request_tasks rt
       JOIN tasks t ON t.id = rt.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
      WHERE rt.request_id = ? ORDER BY t.code`,
    id,
  );

  return NextResponse.json({ request: requestRow, tasks });
}

// PATCH /api/inspection-requests/:id — đổi trạng thái (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được đổi trạng thái phiếu YCNT" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!["sent", "confirmed", "passed", "failed", "cancelled"].includes(status))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  try {
    await withTransaction(async () => {
      const existing = await queryOne<{ id: number }>(
        `SELECT id FROM inspection_requests WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!existing) throw Object.assign(new Error("Không tìm thấy phiếu YCNT"), { status: 404 });
      await run(`UPDATE inspection_requests SET status = ? WHERE id = ?`, status, id);
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ ok: true });
}
