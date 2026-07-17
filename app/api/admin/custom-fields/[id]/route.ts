import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import {
  isCustomFieldType,
  keyInUse,
  type CustomEntityType,
  type CustomFieldType,
} from "@/lib/custom-fields";

export const dynamic = "force-dynamic";

// PATCH /api/admin/custom-fields/:id — sửa định nghĩa. Chỉ Admin.
// key BẤT BIẾN (không nhận trong body); đổi type khi đã có entity dùng key → 409.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCustomFields(user.role))
    return NextResponse.json({ error: "Chỉ Admin được sửa trường tuỳ biến" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const def = await queryOne<{
    entity_type: CustomEntityType;
    key: string;
    type: CustomFieldType;
  }>(`SELECT entity_type, key, type FROM custom_field_defs WHERE id = ?`, id);
  if (!def) return NextResponse.json({ error: "Không tìm thấy định nghĩa" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];

  // Đổi type: chặn khi đã có ≥1 entity lưu giá trị cho key này (tránh dữ liệu lệch type).
  if (body.type !== undefined && body.type !== def.type) {
    if (!isCustomFieldType(body.type))
      return NextResponse.json({ error: "type không hợp lệ" }, { status: 422 });
    if (await keyInUse(def.entity_type, def.key))
      return NextResponse.json(
        { error: "Không thể đổi kiểu: đã có dữ liệu tham chiếu trường này" },
        { status: 409 },
      );
    sets.push("type = ?");
    vals.push(body.type);
  }

  if (body.label !== undefined) {
    const label = String(body.label ?? "").trim();
    if (!label) return NextResponse.json({ error: "label không được để trống" }, { status: 422 });
    sets.push("label = ?");
    vals.push(label);
  }

  if (body.options !== undefined) {
    // Type sau khi (có thể) đổi trong PATCH này; nếu không đổi type dùng type cũ.
    const finalType = body.type !== undefined ? body.type : def.type;
    if (finalType === "select") {
      const opts = Array.isArray(body.options)
        ? [...new Set(body.options.map((o: unknown) => String(o).trim()).filter(Boolean))]
        : [];
      if (opts.length === 0)
        return NextResponse.json(
          { error: "Trường select phải có ít nhất 1 lựa chọn" },
          { status: 422 },
        );
      sets.push("options = ?");
      vals.push(JSON.stringify(opts));
    } else {
      sets.push("options = ?");
      vals.push(null);
    }
  }

  if (body.required !== undefined) {
    sets.push("required = ?");
    vals.push(!!body.required);
  }
  if (body.sort !== undefined) {
    sets.push("sort = ?");
    vals.push(Number.isFinite(Number(body.sort)) ? Number(body.sort) : 0);
  }
  if (body.active !== undefined) {
    sets.push("active = ?");
    vals.push(!!body.active);
  }

  if (!sets.length)
    return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  await run(`UPDATE custom_field_defs SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  return NextResponse.json({ updated: id });
}

// DELETE /api/admin/custom-fields/:id — xoá định nghĩa. Chỉ Admin. (Giá trị đã lưu trong
// cột custom của entity giữ nguyên — không tự dọn, tránh mất dữ liệu ngoài ý muốn.)
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCustomFields(user.role))
    return NextResponse.json({ error: "Chỉ Admin được xoá trường tuỳ biến" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const r = await run(`DELETE FROM custom_field_defs WHERE id = ?`, id);
  if (r.changes === 0)
    return NextResponse.json({ error: "Không tìm thấy định nghĩa" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
