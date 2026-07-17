import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import {
  checkNormMaterial,
  listNormsForBoqItem,
  parseNormBody,
  validateNormInput,
} from "@/lib/norms";

export const dynamic = "force-dynamic";

// GET /api/boq/:id/norms — định mức vật tư/nhân công/máy của 1 dòng BOQ. Mọi user xem được.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const boqItemId = parseInt(params.id);
  if (isNaN(boqItemId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const boqItem = await queryOne<{ id: number }>(
    `SELECT id FROM boq_items WHERE id = ?${projectId != null ? " AND project_id = ?" : ""}`,
    boqItemId,
    ...(projectId != null ? [projectId] : []),
  );
  if (!boqItem) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const norms = await listNormsForBoqItem(boqItemId);
  return NextResponse.json({ norms });
}

// POST /api/boq/:id/norms — thêm định mức cho dòng BOQ (Admin/PM).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageNorms(user.role))
    return NextResponse.json(
      { error: "Không có quyền tạo định mức (chỉ Admin/PM)" },
      { status: 403 },
    );

  const boqItemId = parseInt(params.id);
  if (isNaN(boqItemId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const boqItem = await queryOne<{ id: number }>(
    `SELECT id FROM boq_items WHERE id = ?${projectId != null ? " AND project_id = ?" : ""}`,
    boqItemId,
    ...(projectId != null ? [projectId] : []),
  );
  if (!boqItem) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseNormBody(body);
  const invalid = validateNormInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const matErr = await checkNormMaterial(input);
  if (matErr) return NextResponse.json({ error: matErr }, { status: 422 });

  const id = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, resource_name, qty_per_unit, unit_label, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    boqItemId,
    input.resourceType,
    input.materialId,
    input.resourceName,
    input.qtyPerUnit,
    input.unitLabel,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
