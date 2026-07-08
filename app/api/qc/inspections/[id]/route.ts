import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN, canTouchTask, canTouchPackage } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { taskInProject, validateInspectionResults, workPackageInProject } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

type InspectionRow = {
  id: number;
  taskId: number | null;
  workPackageId: number | null;
  status: string;
};

// PATCH /api/qc/inspections/:id — cập nhật kết quả kiểm tra / đổi trạng thái.
// Chuyển sang passed/failed cần CAN.approve (Admin/PM); các thay đổi khác (draft→submitted,
// sửa results) theo quyền canTouchTask/canTouchPackage như lúc tạo (subcon tự kiểm task mình).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const nextStatus =
    typeof body?.status === "string" &&
    ["draft", "submitted", "passed", "failed"].includes(body.status)
      ? body.status
      : undefined;
  if (body?.results !== undefined && !validateInspectionResults(body.results))
    return NextResponse.json({ error: "Kết quả kiểm tra không hợp lệ" }, { status: 422 });

  try {
    await withTransaction(async () => {
      const inspection = await queryOne<InspectionRow>(
        `SELECT id, task_id AS "taskId", work_package_id AS "workPackageId", status
           FROM qc_inspections WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!inspection)
        throw Object.assign(new Error("Không tìm thấy lần kiểm tra"), { status: 404 });

      // qc_inspections không có project_id riêng (ADR-0004) — suy qua task/work_package (M22).
      const projectId = await getCurrentProjectId(user);
      const inProject =
        projectId != null &&
        (inspection.taskId
          ? await taskInProject(inspection.taskId, projectId)
          : inspection.workPackageId
            ? await workPackageInProject(inspection.workPackageId, projectId)
            : false);
      if (!inProject)
        throw Object.assign(new Error("Không tìm thấy lần kiểm tra"), { status: 404 });

      const isApproval = nextStatus === "passed" || nextStatus === "failed";
      if (isApproval) {
        if (!CAN.approve(user.role))
          throw Object.assign(new Error("Chỉ Admin/PM được duyệt kết quả kiểm tra"), {
            status: 403,
          });
      } else {
        const ok = inspection.taskId
          ? await canTouchTask(user, inspection.taskId)
          : inspection.workPackageId
            ? await canTouchPackage(user, inspection.workPackageId)
            : true;
        if (!ok)
          throw Object.assign(new Error("Bạn không được sửa lần kiểm tra này"), { status: 403 });
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      if (body?.results !== undefined) {
        sets.push("results = ?::jsonb");
        values.push(JSON.stringify(body.results));
      }
      if (nextStatus) {
        sets.push("status = ?");
        values.push(nextStatus);
      }
      if (isApproval) {
        sets.push("approved_by = ?");
        values.push(user.id);
      }
      if (sets.length === 0) return;

      await run(`UPDATE qc_inspections SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ ok: true });
}
