import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { recomputePackage } from "@/lib/recompute";
import { requiredInspectionMissing } from "@/lib/qaqc";
import { decideNext, getActiveFlow, openApproval, advanceApproval } from "@/lib/approvals";
import { emitWebhook } from "@/lib/webhooks";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// GET /api/approvals → danh sách tầng theo hệ: chờ nghiệm thu + đã nghiệm thu.
// Mỗi nhóm (sheet_type × floor_label) là 1 dòng với số task, số đã hoàn thành, trạng thái duyệt.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const groups = await query<{
      sheetTypeId: number;
      sheetType: string;
      floorLabel: string;
      wpName: string | null;
      totalTasks: number;
      doneTasks: number;
      approvalId: number | null;
      isApproved: boolean;
      approvedByName: string | null;
      approvedAt: string | null;
      docCount: number;
    }>(`
    SELECT
      st.id AS "sheetTypeId",
      st.code AS "sheetType",
      wp.floor_label AS "floorLabel",
      MIN(wp.name) AS "wpName",
      COUNT(DISTINCT t.id)::int AS "totalTasks",
      COUNT(DISTINCT CASE WHEN t.progress_percent >= 1 THEN t.id END)::int AS "doneTasks",
      fa.id AS "approvalId",
      COALESCE(fa.is_approved, FALSE) AS "isApproved",
      fa.approved_by_name AS "approvedByName",
      fa.approved_at AS "approvedAt",
      (SELECT COUNT(*) FROM task_documents d WHERE d.floor_approval_id = fa.id)::int AS "docCount"
    FROM work_packages wp
    JOIN sheet_types st ON wp.sheet_type_id = st.id
    JOIN tasks t ON t.package_id = wp.id
    LEFT JOIN floor_approvals fa ON fa.sheet_type_id = st.id AND fa.floor_label = wp.floor_label
    WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
    GROUP BY st.id, st.code, wp.floor_label, fa.id, fa.is_approved, fa.approved_by_name, fa.approved_at
    ORDER BY st.id, wp.floor_label
  `);

    const pending = groups.filter((g) => !g.isApproved);
    const approved = groups.filter((g) => g.isApproved);

    return NextResponse.json({ pending, approved, canApprove: CAN.approve(user.role) });
  } catch (err) {
    log.error("GET /api/approvals lỗi", {
      route: "GET /api/approvals",
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Lỗi tải danh sách nghiệm thu" }, { status: 500 });
  }
}

// POST /api/approvals { sheetTypeId, floorLabel } → duyệt nghiệm thu toàn bộ tầng (Admin/PM).
// Điều kiện: tất cả task trong tầng đó phải đạt 100%.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt nghiệm thu" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const sheetTypeId = parseInt(String(body?.sheetTypeId ?? ""));
  const floorLabel = String(body?.floorLabel ?? "").trim();
  if (isNaN(sheetTypeId) || !floorLabel)
    return NextResponse.json({ error: "Thiếu sheetTypeId hoặc floorLabel" }, { status: 400 });

  // M46 PR3: flow chỉ dùng để CHỌN flow áp dụng (bảng floor_approvals/tasks vốn không
  // scope theo dự án — whitelist "nhóm nghiệm thu theo sheet × tầng" trong
  // tests/project-scope-invariant.test.ts), không dùng để lọc dữ liệu tầng.
  const projectId = await getCurrentProjectId(user);

  let approvalId: number;
  let taskCount: number;

  try {
    const result = await withTransaction(async () => {
      // Khoá và kiểm tra lại trạng thái nghiệm thu bên trong transaction
      const existing = await queryOne<{ id: number; is_approved: boolean }>(
        `SELECT id, is_approved FROM floor_approvals WHERE sheet_type_id = ? AND floor_label = ? FOR UPDATE`,
        sheetTypeId,
        floorLabel,
      );
      if (existing?.is_approved)
        throw Object.assign(new Error("Tầng này đã được nghiệm thu rồi"), { status: 409 });

      // Khoá và đọc lại tiến độ task trong transaction để tránh TOCTOU
      const tasks = await query<{
        id: number;
        package_id: number;
        progress_percent: number;
        code: string;
        boq_code: string | null;
        name: string;
      }>(
        `SELECT t.id, t.package_id, t.progress_percent, t.code, t.boq_code, t.name
           FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
          WHERE wp.sheet_type_id = ? AND wp.floor_label = ?
          FOR UPDATE OF t`,
        sheetTypeId,
        floorLabel,
      );

      if (tasks.length === 0)
        throw Object.assign(new Error("Không tìm thấy task nào trong tầng này"), { status: 404 });

      const notDone = tasks.filter((t) => (t.progress_percent ?? 0) < 1);
      if (notDone.length > 0)
        throw Object.assign(
          new Error(`Còn ${notDone.length} task chưa đạt 100% — không thể nghiệm thu tầng`),
          { status: 422 },
        );

      // Gate M3: mọi task trong tầng phải qua checklist bắt buộc (nếu có) trước khi nghiệm thu lô.
      for (const t of tasks) {
        if (await requiredInspectionMissing(t.id))
          throw Object.assign(
            new Error(
              "Còn task chưa có phiếu kiểm tra chất lượng Đạt (checklist bắt buộc) — không thể nghiệm thu tầng",
            ),
            { status: 409 },
          );
      }

      // M46 PR3: có flow 'task_acceptance' active → mở + duyệt 1 request/task qua engine.
      // Duyệt CẢ TẦNG trong 1 lượt chỉ hợp lý khi flow có ĐÚNG 1 bước hiệu lực (mọi task
      // amount NULL) và caller đúng vai trò bước đó — nếu không dừng lại, hướng dẫn duyệt
      // từng task qua hộp thư "Chờ tôi duyệt" (engine hỗ trợ multi-step ở mức từng task,
      // không phải ở mức thao tác hàng loạt này). Không có flow → hành vi y hệt trước đây.
      const flow =
        projectId != null ? await getActiveFlow("task_acceptance", projectId) : undefined;
      if (flow) {
        const firstStep = decideNext(flow.steps, null, 0);
        if (firstStep) {
          if (decideNext(flow.steps, null, firstStep.seq))
            throw Object.assign(
              new Error(
                'Hệ đang cấu hình duyệt nghiệm thu nhiều bước — hãy duyệt từng task qua hộp thư "Chờ tôi duyệt" (/approvals) thay vì duyệt cả tầng.',
              ),
              { status: 409 },
            );
          if (firstStep.role !== user.role && user.role !== "admin")
            throw Object.assign(new Error(`Chỉ vai trò ${firstStep.role} được duyệt bước này`), {
              status: 403,
            });
        }
        for (const t of tasks) {
          const opened = await openApproval({
            entityType: "task_acceptance",
            entityId: t.id,
            projectId: projectId!,
            amount: null,
            user,
          });
          if (opened && opened.status === "pending")
            await advanceApproval({
              entityType: "task_acceptance",
              entityId: t.id,
              user,
              decision: "approve",
            });
        }
      }

      // Tạo hoặc cập nhật floor_approval thành chính thức
      let aid: number;
      if (existing) {
        await run(
          `UPDATE floor_approvals SET is_approved = TRUE, approved_by = ?, approved_by_name = ?, approved_at = NOW()
           WHERE id = ?`,
          user.id,
          user.name,
          existing.id,
        );
        aid = existing.id;
      } else {
        aid = await insertId(
          `INSERT INTO floor_approvals (sheet_type_id, floor_label, is_approved, approved_by, approved_by_name, approved_at)
           VALUES (?, ?, TRUE, ?, ?, NOW())`,
          sheetTypeId,
          floorLabel,
          user.id,
          user.name,
        );
      }

      // Đặt toàn bộ task thành nghiem_thu — bulk UPDATE để tránh N+1 sequential queries.
      const taskIds = tasks.map((t) => t.id);
      await run(
        `UPDATE tasks SET status = 'nghiem_thu', updated_at = CURRENT_TIMESTAMP WHERE id = ANY(?)`,
        taskIds,
      );

      // Bulk INSERT audit history trong 1 câu lệnh.
      const note = `Nghiệm thu tầng ${floorLabel} bởi ${user.name}`;
      const ph = tasks.map(() => "(?, ?, ?, 'nghiem_thu', ?, ?)").join(", ");
      const vals = tasks.flatMap((t) => [
        t.id,
        t.progress_percent,
        t.progress_percent,
        note,
        user.name,
      ]);
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by) VALUES ${ph}`,
        ...vals,
      );

      return { aid, tasks };
    });

    approvalId = result.aid;
    taskCount = result.tasks.length;

    // recomputePackage chạy ngoài transaction, song song để giảm latency.
    const packageIds = new Set(result.tasks.map((t) => t.package_id));
    await Promise.all([...packageIds].map((pid) => recomputePackage(pid)));

    // Mỗi task trong tầng vừa CHUYỂN sang nghiem_thu THẬT (bulk UPDATE trong transaction đã
    // commit) → 1 emit/task. Tầng đã nghiệm thu bị chặn 409 ở trên nên không phát trùng.
    for (const t of result.tasks) {
      await emitWebhook("task.approved", projectId, {
        taskId: t.id,
        code: t.code,
        boqCode: t.boq_code,
        name: t.name,
      });
    }
  } catch (err: unknown) {
    // Race hiếm: 2 request duyệt cùng 1 tầng lần đầu gần như đồng thời cùng vượt qua kiểm tra
    // "existing" (chưa có bản ghi) rồi cùng INSERT — UNIQUE(sheet_type_id, floor_label) chặn
    // đúng, chỉ cần trả 409 thân thiện thay vì để lộ lỗi Postgres thô.
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: "Tầng này vừa được nghiệm thu bởi người khác" },
        { status: 409 },
      );
    const e = err as { message?: string; status?: number };
    const status = e.status ?? 500;
    return NextResponse.json({ error: e.message ?? "Lỗi duyệt nghiệm thu" }, { status });
  }

  return NextResponse.json({ approvalId, taskCount });
}
