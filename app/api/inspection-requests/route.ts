import { NextRequest, NextResponse } from "next/server";
import { query, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { nextSeqCode, withUniqueRetry } from "@/lib/seqcode";
import { emitWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: number;
  code: string;
  scheduledAt: string;
  status: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  taskCount: number;
};

// GET /api/inspection-requests?status= — danh sách phiếu YCNT (mọi vai trò xem).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const conds: string[] = [];
  const values: unknown[] = [];
  if (status) {
    conds.push("r.status = ?");
    values.push(status);
  }

  // inspection_requests không có project_id riêng — suy qua các task gắn phiếu
  // (mỗi phiếu luôn có ≥1 task) để chặn rò rỉ dữ liệu xuyên dự án (M22).
  const projectId = await getCurrentProjectId(user);
  if (projectId != null) {
    conds.push(
      `EXISTS (SELECT 1 FROM inspection_request_tasks rt2
                 JOIN tasks t2 ON t2.id = rt2.task_id
                 JOIN work_packages wp2 ON wp2.id = t2.package_id
                 JOIN sheet_types st2 ON st2.id = wp2.sheet_type_id
                 JOIN towers tw2 ON tw2.id = st2.tower_id
                WHERE rt2.request_id = r.id AND tw2.project_id = ?)`,
    );
    values.push(projectId);
  }

  const rows = await query<RequestRow>(
    `SELECT r.id, r.code, r.scheduled_at AS "scheduledAt", r.status, r.note,
            cu.name AS "createdByName", r.created_at AS "createdAt",
            COUNT(rt.task_id)::int AS "taskCount"
       FROM inspection_requests r
       LEFT JOIN users cu ON cu.id = r.created_by
       LEFT JOIN inspection_request_tasks rt ON rt.request_id = r.id
      ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
      GROUP BY r.id, cu.name
      ORDER BY r.scheduled_at DESC, r.id DESC`,
    ...values,
  );
  return NextResponse.json({ requests: rows });
}

// POST /api/inspection-requests — tạo phiếu YCNT mới (Admin/PM/Kỹ sư), gồm 1+ task đã 100%.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createInspectionRequest(user.role))
    return NextResponse.json({ error: "Không có quyền tạo phiếu YCNT" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const scheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt : "";
  if (!scheduledAt || isNaN(Date.parse(scheduledAt)))
    return NextResponse.json({ error: "Thiếu hoặc sai định dạng ngày giờ hẹn" }, { status: 422 });

  const taskIds = Array.isArray(body?.taskIds)
    ? [...new Set(body.taskIds.map((v: unknown) => Number(v)))].filter((v) => Number.isInteger(v))
    : [];
  if (taskIds.length === 0)
    return NextResponse.json({ error: "Phải chọn ít nhất 1 task" }, { status: 422 });

  const note = typeof body?.note === "string" ? body.note.trim() || null : null;

  const tasks = await query<{ id: number; progressPercent: number }>(
    `SELECT id, progress_percent AS "progressPercent" FROM tasks WHERE id = ANY(?)`,
    taskIds,
  );
  if (tasks.length !== taskIds.length)
    return NextResponse.json({ error: "Có task không tồn tại" }, { status: 404 });
  const notDone = tasks.filter((t) => (t.progressPercent ?? 0) < 1);
  if (notDone.length > 0)
    return NextResponse.json(
      { error: `${notDone.length} task chưa đạt 100% tiến độ — chỉ gửi YCNT khi đã hoàn thành` },
      { status: 422 },
    );

  // Dự án của phiếu suy từ dự án đang chọn của người tạo (cùng helper getCurrentProjectId các
  // route khác dùng, không suy lại từ nội bộ thực thể) — để lọc webhook theo dự án.
  const projectId = await getCurrentProjectId(user);

  const id = await withUniqueRetry(() =>
    withTransaction(async () => {
      const code = await nextSeqCode("inspection_requests", "code", "YCNT-", 4);
      const reqId = await insertId(
        `INSERT INTO inspection_requests (code, scheduled_at, note, created_by)
         VALUES (?, ?, ?, ?)`,
        code,
        scheduledAt,
        note,
        user.id,
      );
      for (const taskId of taskIds) {
        await run(
          `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
          reqId,
          taskId,
        );
      }
      return reqId;
    }),
  );

  // Phiếu YCNT vừa tạo thành công. taskId chỉ đưa vào khi phiếu đúng 1 task (nếu nhiều task
  // thì bỏ trường taskId — data theo đặc tả {requestId, taskId?}).
  await emitWebhook("inspection.requested", projectId, {
    requestId: id,
    ...(taskIds.length === 1 ? { taskId: taskIds[0] } : {}),
  });

  return NextResponse.json({ id }, { status: 201 });
}
