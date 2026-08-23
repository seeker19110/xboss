import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
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
      [modelId, projectId],
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
        `SELECT id, start_date, end_date, progress, status, approved_at
         FROM tasks
         WHERE id IN (${placeholders}) AND project_id = ?`,
        [...taskIds, projectId],
      );

      for (const t of tasks) {
        wbsMap.set(Number(t.id), {
          id: Number(t.id),
          startDate: t.start_date ?? "2026-08-01",
          endDate: t.end_date ?? "2026-08-30",
          progress: Number(t.progress ?? 0),
          status: t.status ?? "chuan_bi",
          approvedDate: t.approved_at ? t.approved_at.split("T")[0] : null,
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
