import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, insertId } from "@/lib/db";
import { CUSTOM_KEY_RE, isCustomEntityType, isCustomFieldType } from "@/lib/custom-fields";

export const dynamic = "force-dynamic";

// GET /api/admin/custom-fields — mọi định nghĩa (xuyên dự án, gồm cả inactive). Admin/PM xem.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewCustomFields(user.role))
    return NextResponse.json({ error: "Không có quyền xem trường tuỳ biến" }, { status: 403 });

  const defs = await query(
    `SELECT id, project_id AS "projectId", entity_type AS "entityType", key, label, type,
            options, required, sort, active
       FROM custom_field_defs
      ORDER BY entity_type, sort, id`,
  );
  return NextResponse.json({ defs });
}

// Chuẩn hoá + validate options theo type. Trả mảng chuỗi (cho select) hoặc null.
function normalizeOptions(type: string, raw: unknown): string[] | null {
  if (type !== "select") return null;
  if (!Array.isArray(raw)) return [];
  const opts = raw.map((o) => String(o).trim()).filter((o) => o.length > 0);
  return [...new Set(opts)];
}

// POST /api/admin/custom-fields — tạo định nghĩa mới. Chỉ Admin.
// body: { projectId?, entityType, key, label, type, options?, required?, sort?, active? }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCustomFields(user.role))
    return NextResponse.json({ error: "Chỉ Admin được tạo trường tuỳ biến" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const entityType = body.entityType;
  if (!isCustomEntityType(entityType))
    return NextResponse.json({ error: "entityType không hợp lệ" }, { status: 422 });

  const type = body.type;
  if (!isCustomFieldType(type))
    return NextResponse.json({ error: "type không hợp lệ" }, { status: 422 });

  const key = String(body.key ?? "").trim();
  if (!CUSTOM_KEY_RE.test(key))
    return NextResponse.json(
      { error: "key phải snake_case (chữ thường/số/gạch dưới, bắt đầu bằng chữ)" },
      { status: 422 },
    );

  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label không được để trống" }, { status: 422 });

  const options = normalizeOptions(type, body.options);
  if (type === "select" && (!options || options.length === 0))
    return NextResponse.json(
      { error: "Trường select phải có ít nhất 1 lựa chọn" },
      { status: 422 },
    );

  const projectId = body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null;
  const required = !!body.required;
  const sort = Number.isFinite(Number(body.sort)) ? Number(body.sort) : 0;
  const active = body.active === undefined ? true : !!body.active;

  try {
    const id = await insertId(
      `INSERT INTO custom_field_defs (project_id, entity_type, key, label, type, options, required, sort, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId,
      entityType,
      key,
      label,
      type,
      options === null ? null : JSON.stringify(options),
      required,
      sort,
      active,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Key "${key}" đã tồn tại cho ${entityType} trong phạm vi dự án này` },
        { status: 409 },
      );
    throw err;
  }
}
