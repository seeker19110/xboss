import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, run, insertId, withTransaction } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  generateParametricMepfMesh,
  calculateModelBoundingBox,
  BimElement,
} from "@/lib/ky-thuat/engineering-bim-viewer";

export const dynamic = "force-dynamic";

// Trần số phần tử cho một lần tạo mô hình (V3 — trước đây không giới hạn, client gửi
// bao nhiêu cũng chèn) và kích thước lô cho câu INSERT nhiều hàng.
const GIOI_HAN_PHAN_TU = 10_000;
const KICH_THUOC_LO = 500;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.viewEngineeringBim(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem mô hình BIM" }, { status: 403 });
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

  if (!CAN.manageEngineeringBim(user.role)) {
    return NextResponse.json({ error: "Không có quyền thao tác mô hình BIM" }, { status: 403 });
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

    if (!Array.isArray(elements)) {
      return NextResponse.json({ error: "Trường elements phải là mảng" }, { status: 422 });
    }
    if (elements.length > GIOI_HAN_PHAN_TU) {
      return NextResponse.json(
        {
          error: `Vượt giới hạn ${GIOI_HAN_PHAN_TU} phần tử cho một mô hình (đang gửi ${elements.length}) — vui lòng tách mô hình.`,
        },
        { status: 422 },
      );
    }

    const bbox = calculateModelBoundingBox(elements);

    // Tạo model + chèn phần tử trong CÙNG một transaction: lỗi giữa chừng thì không để
    // lại model mồ côi (trước đây chèn từng dòng trong vòng lặp, không transaction).
    const model = await withTransaction(async () => {
      const inserted = await query<any>(
        `INSERT INTO engineering_bim_models (project_id, name, discipline, floor_id, format, element_count, bounding_box, metadata, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
         RETURNING id, project_id, name, discipline, floor_id, format, element_count, bounding_box, created_at`,
        // Helper lib/db nhận tham số dạng biến thiên (...params) — phải trải mảng ra.
        projectId,
        name,
        discipline,
        floorId,
        format,
        elements.length,
        JSON.stringify(bbox),
        JSON.stringify(body.metadata ?? {}),
        user.id,
      );

      const row = inserted[0];

      // Chèn phần tử theo LÔ (multi-row VALUES) thay vì từng dòng một.
      for (let i = 0; i < elements.length; i += KICH_THUOC_LO) {
        const lo = elements.slice(i, i + KICH_THUOC_LO);
        const args: unknown[] = [];
        const hangs = lo.map((el: any) => {
          args.push(
            row.id,
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
          );
          return "(?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)";
        });
        await run(
          `INSERT INTO engineering_bim_elements (model_id, project_id, guid, element_type, system_type, name, geometry_data, properties, wbs_task_id)
           VALUES ${hangs.join(", ")}`,
          ...args,
        );
      }

      return row;
    });

    return NextResponse.json({ model, success: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Lỗi tạo mô hình BIM" }, { status: 500 });
  }
}
