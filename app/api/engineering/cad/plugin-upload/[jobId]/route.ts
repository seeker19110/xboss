import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/plugin-upload/:jobId — plugin poll kết quả kiểm định (M99 §10):
// { status, validation, revisionId? }. Chỉ NGƯỜI TẠO job xem được (plugin poll job của chính
// nó); giám sát chung dùng /api/engineering/queue/tasks sẵn có.
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ jobId: string }> },
) {
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem kết quả tải lên" }, { status: 403 });
  }

  const jobId = (await paramsP).jobId;
  if (!/^[0-9a-f-]{10,64}$/i.test(jobId)) {
    return NextResponse.json({ error: "jobId không hợp lệ" }, { status: 400 });
  }

  const job = await queryOne<{
    id: string;
    status: string;
    result: Record<string, unknown> | null;
    error_message: string | null;
  }>(
    `SELECT id, status, result, error_message
       FROM engineering_async_tasks
      WHERE id = ?::uuid AND task_type = 'cad.plugin-upload' AND created_by = ?`,
    jobId,
    user.id,
  );
  if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

  return NextResponse.json({
    status: job.status,
    validation:
      job.result?.validation ??
      (job.error_message ? { ok: false, errors: [job.error_message] } : null),
    revisionId: job.result?.revisionId ?? null,
    idempotent: job.result?.idempotent ?? false,
  });
}
