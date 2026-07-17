import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { deriveStatus, recomputePackage } from "@/lib/recompute";
import { requiredInspectionMissing } from "@/lib/qaqc";
import { getActiveFlow, openApproval, advanceApproval } from "@/lib/approvals";
import { emitWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: number;
  package_id: number;
  status: string;
  progress_percent: number;
  end_date: string | null;
  name: string;
  code: string;
  boq_code: string | null;
};

type StepResult =
  | { kind: "pending"; currentSeq: number; nextRole: string }
  | { kind: "rejected" }
  | { kind: "final"; packageId: number; code: string; boqCode: string | null; name: string };

// Workflow nghiệm thu 2 bước: thi công xong (100%) → Admin/PM duyệt nghiệm thu.
// Trạng thái nghiem_thu chỉ đặt được qua endpoint này — có audit trong task_history.
// M46 PR3: nếu có flow 'task_acceptance' active (Admin cấu hình — PR4) → click đầu tiên
// mở approval_request (mỗi task 1 request, amount NULL) rồi lập tức ghi nhận quyết định
// của người gọi làm bước hiện tại; bước sau (người khác vai trò) gọi lại CHÍNH endpoint
// này để quyết bước tiếp (route tự thấy request đã pending, không mở request mới — idempotent
// giống pattern VO/IPC). Chưa tới bước cuối → CHƯA đổi status/task_history, chỉ trả
// {pending:true}. Không có flow → hành vi y hệt trước đây (CAN.approve, 1 bước).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const decision: "approve" | "reject" = body?.decision === "reject" ? "reject" : "approve";
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  if (decision === "reject" && !note)
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);

  // FOR UPDATE để tránh 2 PM approve đồng thời tạo duplicate audit record.
  let result: StepResult;
  try {
    result = await withTransaction(async () => {
      const task = await queryOne<TaskRow>(
        `SELECT id, package_id, status, progress_percent, end_date, name, code, boq_code FROM tasks WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!task) throw Object.assign(new Error("Không tìm thấy task"), { status: 404 });
      if (task.status === "nghiem_thu")
        throw Object.assign(new Error("Task đã được nghiệm thu rồi"), { status: 409 });
      if ((task.progress_percent ?? 0) < 1)
        throw Object.assign(new Error("Task chưa hoàn thành 100% — không thể nghiệm thu"), {
          status: 422,
        });
      // Gate M3: mẫu checklist nào bật `required` (áp cho hệ của task) mà chưa có inspection
      // đạt cho task này → chặn nghiệm thu.
      if (await requiredInspectionMissing(id))
        throw Object.assign(
          new Error(
            "Cần có phiếu kiểm tra chất lượng Đạt (checklist bắt buộc) trước khi nghiệm thu",
          ),
          { status: 409 },
        );

      if (projectId != null) {
        const liveRequest = await queryOne<{ id: number }>(
          `SELECT id FROM approval_requests WHERE entity_type = 'task_acceptance' AND entity_id = ? AND status = 'pending'`,
          id,
        );
        let advance: Awaited<ReturnType<typeof advanceApproval>> | undefined;
        if (liveRequest) {
          advance = await advanceApproval({
            entityType: "task_acceptance",
            entityId: id,
            user,
            decision,
            note,
          });
        } else {
          const flow = await getActiveFlow("task_acceptance", projectId);
          if (flow) {
            if (decision === "reject")
              throw Object.assign(new Error("Chưa có yêu cầu duyệt đang chờ để từ chối"), {
                status: 409,
              });
            const opened = await openApproval({
              entityType: "task_acceptance",
              entityId: id,
              projectId,
              amount: null,
              user,
            });
            if (opened && opened.status === "pending")
              advance = await advanceApproval({
                entityType: "task_acceptance",
                entityId: id,
                user,
                decision: "approve",
              });
            // opened.status === 'approved' (flow không có bước hiệu lực nào) → rơi thẳng
            // xuống domain logic bên dưới, coi như đã qua engine.
          } else if (decision === "reject") {
            throw Object.assign(new Error("Không có yêu cầu duyệt đang chờ để từ chối"), {
              status: 409,
            });
          }
        }
        if (advance) {
          if (advance.status === "pending")
            return { kind: "pending", currentSeq: advance.currentSeq, nextRole: advance.nextRole };
          if (advance.status === "rejected") return { kind: "rejected" };
          // advance.status === "approved" → rơi xuống domain logic bên dưới.
        }
      } else if (decision === "reject") {
        throw Object.assign(new Error("Không có yêu cầu duyệt đang chờ để từ chối"), {
          status: 409,
        });
      }

      await run(
        `UPDATE tasks SET status = 'nghiem_thu', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        id,
      );
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
           VALUES (?, ?, ?, 'nghiem_thu', ?, ?)`,
        id,
        task.progress_percent,
        task.progress_percent,
        `Nghiệm thu bởi ${user.name}`,
        user.name,
      );
      return {
        kind: "final",
        packageId: task.package_id,
        code: task.code,
        boqCode: task.boq_code,
        name: task.name,
      };
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  if (result.kind === "pending")
    return NextResponse.json({
      id,
      pending: true,
      currentSeq: result.currentSeq,
      nextRole: result.nextRole,
    });
  if (result.kind === "rejected") return NextResponse.json({ id, rejected: true });

  await recomputePackage(result.packageId);
  // Task vừa CHUYỂN sang nghiem_thu THẬT trong request này (kind 'final' gồm cả nhánh legacy
  // 1 bước lẫn bước cuối của engine M46). Không phát ở nhánh 'pending' (bước giữa) hay
  // 'rejected'; task đã nghiệm thu từ trước bị chặn 409 ở trên nên không tới đây → 1 emit/1
  // lần chuyển approved.
  await emitWebhook("task.approved", projectId, {
    taskId: id,
    code: result.code,
    boqCode: result.boqCode,
    name: result.name,
  });
  return NextResponse.json({ id, status: "nghiem_thu" });
}

// DELETE /api/tasks/:id/approve → huỷ nghiệm thu (Admin/PM) — trạng thái quay về suy ra từ tiến độ.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được huỷ nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // FOR UPDATE để tránh 2 người cùng huỷ nghiệm thu đồng thời tạo duplicate audit record
  // (đối xứng với POST — cùng nguy cơ TOCTOU nếu bỏ transaction/lock).
  let packageId: number;
  let status: string;
  try {
    ({ packageId, status } = await withTransaction(async () => {
      const task = await queryOne<TaskRow>(
        `SELECT id, package_id, status, progress_percent, end_date, name FROM tasks WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!task) throw Object.assign(new Error("Không tìm thấy task"), { status: 404 });
      if (task.status !== "nghiem_thu")
        throw Object.assign(new Error("Task chưa ở trạng thái nghiệm thu"), { status: 409 });

      // Truyền current = null để deriveStatus không giữ lại nghiem_thu.
      const newStatus = deriveStatus(task.progress_percent ?? 0, task.end_date, null);
      await run(
        `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        newStatus,
        id,
      );
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        task.progress_percent,
        task.progress_percent,
        newStatus,
        `Huỷ nghiệm thu bởi ${user.name}`,
        user.name,
      );
      return { packageId: task.package_id, status: newStatus };
    }));
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  await recomputePackage(packageId);

  return NextResponse.json({ id, status });
}
