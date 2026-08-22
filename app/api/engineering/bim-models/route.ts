import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, run, insertId } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/projects";
import {
  generateParametricMepfMesh,
  calculateModelBoundingBox,
  BimElement,
} from "@/lib/engineering-bim-viewer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const models = await query<any>(
    `SELECT id, project_id, name, discipline, floor_id, format, file_url, element_count, bounding_box, metadata, created_at
     FROM engineering_bim_models
     WHERE project_id = ?
     ORDER BY created_at DESC`,
    [projectId],
  );

  return NextResponse.json({ models });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, discipline = "mepf", floorId = null, format = "json_mesh", elements = [] } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Tên mô hình là bắt buộc" }, { status: 422 });
    }

    const bbox = calculateModelBoundingBox(elements);

    const inserted = await query<any>(
      `INSERT INTO engineering_bim_models (project_id, name, discipline, floor_id, format, element_count, bounding_box, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
       RETURNING id, project_id, name, discipline, floor_id, format, element_count, bounding_box, created_at`,
      [
        projectId,
        name,
        discipline,
        floorId,
        format,
        elements.length,
        JSON.stringify(bbox),
        JSON.stringify(body.metadata ?? {}),
        user.id,
      ],
    );

    const model = inserted[0];

    // Chèn các phần tử nếu có
    for (const el of elements) {
      await run(
        `INSERT INTO engineering_bim_elements (model_id, project_id, guid, element_type, system_type, name, geometry_data, properties, wbs_task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)`,
        [
          model.id,
          projectId,
          el.guid ?? `GUID-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          el.elementType ?? "DUCT_STRAIGHT",
          el.systemType ?? "HVAC_SUPPLY",
          el.name ?? "Phần tử MEPF",
          JSON.stringify(
            el.geometryData ?? generateParametricMepfMesh(el.elementType ?? "DUCT_STRAIGHT", {}),
          ),
          JSON.stringify(el.properties ?? {}),
          el.wbsTaskId ?? null,
        ],
      );
    }

    return NextResponse.json({ model, success: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Lỗi tạo mô hình BIM" }, { status: 500 });
  }
}
