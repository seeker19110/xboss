import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  BimElement,
  WbsTaskSnapshot,
  compute4DSimulationState,
  SimulationTimeStepResult,
} from "@/lib/ky-thuat/engineering-bim-viewer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringBim(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thao tác mô phỏng 4D mô hình BIM" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const { id: modelId } = await context.params;

  try {
    const body = await req.json();
    const { targetDate, startDate, endDate, stepDays = 7, showGhost = true } = body;

    // Lấy toàn bộ thực thể BIM của model
    const rawElements = await query<any>(
      `SELECT id, model_id, project_id, guid, element_type, system_type, name,
              geometry_data, properties, wbs_task_id
       FROM engineering_bim_elements
       WHERE model_id = ? AND project_id = ?`,
      modelId,
      projectId,
    );

    const elements: BimElement[] = rawElements.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      projectId: Number(row.project_id),
      guid: row.guid,
      elementType: row.element_type,
      systemType: row.system_type,
      name: row.name,
      geometryData:
        typeof row.geometry_data === "string" ? JSON.parse(row.geometry_data) : row.geometry_data,
      properties: typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties,
      wbsTaskId: row.wbs_task_id ? Number(row.wbs_task_id) : null,
    }));

    // Lấy thông tin các task WBS liên quan
    const taskIds = elements.map((e) => e.wbsTaskId).filter((id): id is number => Boolean(id));
    const wbsMap = new Map<number, WbsTaskSnapshot>();

    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => "?").join(",");
      const tasks = await query<any>(
        // Cột thật trong schema là `progress_percent`; `tasks` KHÔNG có cột thời điểm nghiệm
        // thu — mốc đó nằm ở nhật ký `task_history` (status = 'nghiem_thu'), lấy lần ghi sớm
        // nhất làm ngày nghiệm thu. `tasks` cũng KHÔNG có `project_id`: lọc theo dự án phải đi
        // qua chuỗi work_packages → sheet_types → towers (cùng cách lib/tien-do/report.ts).
        `SELECT t.id, t.start_date, t.end_date, t.progress_percent AS progress, t.status,
                (SELECT MIN(h.changed_at) FROM task_history h
                  WHERE h.task_id = t.id AND h.status = 'nghiem_thu') AS approved_at
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         JOIN towers tw ON tw.id = st.tower_id
         WHERE t.id IN (${placeholders}) AND tw.project_id = ?`,
        ...taskIds,
        projectId,
      );

      for (const t of tasks) {
        wbsMap.set(Number(t.id), {
          id: Number(t.id),
          startDate: t.start_date ?? "2026-08-01",
          endDate: t.end_date ?? "2026-08-30",
          progress: Number(t.progress ?? 0),
          status: t.status ?? "chuan_bi",
          approvedDate: t.approved_at ? new Date(t.approved_at).toISOString().split("T")[0] : null,
        });
      }
    }

    if (targetDate) {
      // Tính cho 1 mốc ngày đơn lẻ
      const singleResult = compute4DSimulationState(elements, targetDate, wbsMap, {
        showGhostNotStarted: showGhost,
      });
      return NextResponse.json({
        modelId,
        mode: "single",
        result: singleResult,
      });
    }

    // Tính cho cả chuỗi thời gian (Time-Lapse Series)
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 86400000);
    const series: SimulationTimeStepResult[] = [];

    const curr = new Date(start);
    while (curr <= end) {
      const dateISO = curr.toISOString().split("T")[0];
      const stepRes = compute4DSimulationState(elements, dateISO, wbsMap, {
        showGhostNotStarted: showGhost,
      });
      series.push(stepRes);
      curr.setDate(curr.getDate() + Math.max(1, stepDays));
    }

    return NextResponse.json({
      modelId,
      mode: "series",
      totalSteps: series.length,
      series,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Lỗi chạy mô phỏng 4D" }, { status: 500 });
  }
}
