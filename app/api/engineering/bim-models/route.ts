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

  // Nếu dự án chưa có mô hình nào, tự động seed 1 mô hình mẫu MEPF TT AVIO để trải nghiệm
  if (models.length === 0) {
    const defaultElements: Partial<BimElement>[] = [
      {
        guid: "GUID-HVAC-SUPPLY-01",
        elementType: "DUCT_STRAIGHT",
        systemType: "HVAC_SUPPLY",
        name: "Ống gió cấp AHU-01 (600x400)",
        geometryData: generateParametricMepfMesh(
          "DUCT_STRAIGHT",
          { width: 600, height: 400, length: 6000 },
          { x: 0, y: 0, z: 2800 },
        ),
        properties: {
          pset: {
            airflow: 3500,
            velocity: 4.05,
            pressureDrop: 18,
            material: "Tôn mạ kẽm Z80",
            elevation: 2800,
          },
        },
      },
      {
        guid: "GUID-HVAC-SUPPLY-02",
        elementType: "DUCT_STRAIGHT",
        systemType: "HVAC_SUPPLY",
        name: "Ống gió cấp nhánh 1 (400x300)",
        geometryData: generateParametricMepfMesh(
          "DUCT_STRAIGHT",
          { width: 400, height: 300, length: 4500 },
          { x: 0, y: 1500, z: 2800 },
        ),
        properties: {
          pset: {
            airflow: 1800,
            velocity: 4.16,
            pressureDrop: 14,
            material: "Tôn mạ kẽm Z80",
            elevation: 2800,
          },
        },
      },
      {
        guid: "GUID-HVAC-RETURN-01",
        elementType: "DUCT_STRAIGHT",
        systemType: "HVAC_RETURN",
        name: "Ống gió hồi chính (500x400)",
        geometryData: generateParametricMepfMesh(
          "DUCT_STRAIGHT",
          { width: 500, height: 400, length: 6000 },
          { x: 2000, y: 0, z: 2800 },
        ),
        properties: {
          pset: {
            airflow: 3000,
            velocity: 4.16,
            pressureDrop: 16,
            material: "Tôn mạ kẽm Z80",
            elevation: 2800,
          },
        },
      },
      {
        guid: "GUID-PIPE-CHW-SUPPLY-01",
        elementType: "PIPE_STRAIGHT",
        systemType: "PLUMBING_WATER",
        name: "Ống nước ngưng Chiller DN100",
        geometryData: generateParametricMepfMesh(
          "PIPE_STRAIGHT",
          { diameter: 114, length: 7000 },
          { x: -1500, y: 0, z: 2900 },
        ),
        properties: {
          pset: {
            airflow: 0,
            velocity: 1.5,
            pressureDrop: 45,
            material: "Thép đen Sch40",
            elevation: 2900,
            insulation: "Aeroflex 25mm",
          },
        },
      },
      {
        guid: "GUID-FIRE-SPRINKLER-01",
        elementType: "PIPE_STRAIGHT",
        systemType: "FIRE_SPRINKLER",
        name: "Tuyến ống PCCC Sprinkler DN65",
        geometryData: generateParametricMepfMesh(
          "PIPE_STRAIGHT",
          { diameter: 76, length: 8000 },
          { x: 1000, y: 0, z: 3100 },
        ),
        properties: {
          pset: { pressureDrop: 60, material: "Thép mạ kẽm tráng kẽm nhúng nóng", elevation: 3100 },
        },
      },
      {
        guid: "GUID-CABLE-TRAY-01",
        elementType: "CABLE_TRAY",
        systemType: "ELECTRICAL_POWER",
        name: "Máng cáp điện trục chính 300x100",
        geometryData: generateParametricMepfMesh(
          "CABLE_TRAY",
          { width: 300, height: 100, length: 8000 },
          { x: -2500, y: 0, z: 3000 },
        ),
        properties: { pset: { material: "Thép sơn tĩnh điện RAL 7032", elevation: 3000 } },
      },
    ];

    const bbox = calculateModelBoundingBox(defaultElements as BimElement[]);

    const modelInsert = await query<any>(
      `INSERT INTO engineering_bim_models (project_id, name, discipline, format, element_count, bounding_box, metadata, created_by)
       VALUES (?, 'Mô hình BIM MEPF Mẫu — Tháp A Tầng 5', 'combined', 'json_mesh', ?, ?::jsonb, ?::jsonb, ?)
       RETURNING id, project_id, name, discipline, floor_id, format, file_url, element_count, bounding_box, metadata, created_at`,
      [
        projectId,
        defaultElements.length,
        JSON.stringify(bbox),
        JSON.stringify({ description: "Mô hình mẫu tích hợp HVAC, PCCC, Điện, Cấp Thoát Nước" }),
        user.id,
      ],
    );

    const newModel = modelInsert[0];

    // Lấy thử 1 vài task WBS có sẵn để link
    const sampleTasks = await query<{ id: number }>(
      `SELECT id FROM tasks WHERE project_id = ? LIMIT 6`,
      [projectId],
    );

    for (let i = 0; i < defaultElements.length; i++) {
      const el = defaultElements[i];
      const assignedTaskId = sampleTasks[i]?.id ?? null;

      await run(
        `INSERT INTO engineering_bim_elements (model_id, project_id, guid, element_type, system_type, name, geometry_data, properties, wbs_task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)`,
        [
          newModel.id,
          projectId,
          el.guid,
          el.elementType,
          el.systemType,
          el.name,
          JSON.stringify(el.geometryData),
          JSON.stringify(el.properties),
          assignedTaskId,
        ],
      );
    }

    return NextResponse.json({ models: [newModel] });
  }

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
