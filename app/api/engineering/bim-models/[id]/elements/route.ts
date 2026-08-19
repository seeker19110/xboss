import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/projects";
import {
  BimElement,
  filterElementsPropertySet,
  compute3DSectionCut,
} from "@/lib/engineering-bim-viewer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const { id: modelId } = await context.params;

  const url = new URL(req.url);
  const systemType = url.searchParams.get("systemType") ?? undefined;
  const sectionAxis = url.searchParams.get("sectionAxis") as "x" | "y" | "z" | null;
  const sectionOffset = url.searchParams.get("sectionOffset")
    ? Number(url.searchParams.get("sectionOffset"))
    : null;

  const rawElements = await query<any>(
    `SELECT e.id, e.model_id, e.project_id, e.guid, e.element_type, e.system_type, e.name,
            e.geometry_data, e.properties, e.wbs_task_id, e.created_at,
            t.name as wbs_task_name, t.start_date as wbs_start_date, t.end_date as wbs_end_date,
            t.progress as wbs_progress, t.status as wbs_status
     FROM engineering_bim_elements e
     LEFT JOIN tasks t ON e.wbs_task_id = t.id
     WHERE e.model_id = ? AND e.project_id = ?
     ORDER BY e.created_at ASC`,
    [modelId, projectId],
  );

  let elements: BimElement[] = rawElements.map(
    (row) =>
      ({
        id: row.id,
        modelId: row.model_id,
        projectId: Number(row.project_id),
        guid: row.guid,
        elementType: row.element_type,
        systemType: row.system_type,
        name: row.name,
        geometryData:
          typeof row.geometry_data === "string" ? JSON.parse(row.geometry_data) : row.geometry_data,
        properties:
          typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties,
        wbsTaskId: row.wbs_task_id ? Number(row.wbs_task_id) : null,
        createdAt: row.created_at,
        wbsTask: row.wbs_task_id
          ? {
              id: row.wbs_task_id,
              name: row.wbs_task_name,
              startDate: row.wbs_start_date,
              endDate: row.wbs_end_date,
              progress: Number(row.wbs_progress ?? 0),
              status: row.wbs_status,
            }
          : null,
      }) as any,
  );

  if (systemType) {
    elements = filterElementsPropertySet(elements, { systemType });
  }

  if (sectionAxis && sectionOffset !== null) {
    const cutResult = compute3DSectionCut(elements, { axis: sectionAxis, offset: sectionOffset });
    elements = cutResult.visibleElements;
  }

  return NextResponse.json({
    modelId,
    totalCount: elements.length,
    elements,
  });
}
