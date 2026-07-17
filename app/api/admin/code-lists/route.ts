import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getList,
  getById,
  createItem,
  updateItem,
  deleteItem,
  countReferences,
} from "@/lib/code-lists";

export const dynamic = "force-dynamic";

// Toàn bộ CRUD danh mục mềm chỉ dành cho Admin.
function requireAdmin(role?: string) {
  return role === "admin";
}

// GET /api/admin/code-lists?domain= — liệt kê mọi mục (kể cả đã tắt) của 1 domain.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!requireAdmin(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý danh mục" }, { status: 403 });

  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "Thiếu tham số domain" }, { status: 400 });

  const items = await getList(domain, { includeInactive: true });
  return NextResponse.json({ items });
}

// POST /api/admin/code-lists { domain, code, label, sort?, active?, meta? } — tạo mục mới.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!requireAdmin(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý danh mục" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const domain = String(body.domain ?? "").trim();
  const code = String(body.code ?? "").trim();
  const label = String(body.label ?? "").trim();
  if (!domain || !code || !label)
    return NextResponse.json({ error: "Thiếu domain, code hoặc label" }, { status: 400 });

  const sort = body.sort != null ? Number(body.sort) : undefined;
  const active = typeof body.active === "boolean" ? body.active : undefined;
  const meta =
    body.meta && typeof body.meta === "object" ? (body.meta as Record<string, unknown>) : undefined;

  const result = await createItem({ domain, code, label, sort, active, meta });
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 409 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}

// PATCH /api/admin/code-lists { id, label?, sort?, active?, meta? } — sửa mục (không đổi domain/code).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!requireAdmin(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý danh mục" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

  const current = await getById(id);
  if (!current) return NextResponse.json({ error: "Không tìm thấy mục" }, { status: 404 });

  const patch: {
    label?: string;
    sort?: number;
    active?: boolean;
    meta?: Record<string, unknown>;
  } = {};
  if (body.label !== undefined) patch.label = String(body.label).trim();
  if (body.sort !== undefined) patch.sort = Number(body.sort);
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.meta !== undefined && body.meta && typeof body.meta === "object")
    patch.meta = body.meta as Record<string, unknown>;

  await updateItem(id, patch);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/code-lists?id= — xoá mục; chặn 409 khi đang được tham chiếu.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!requireAdmin(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý danh mục" }, { status: 403 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

  const current = await getById(id);
  if (!current) return NextResponse.json({ error: "Không tìm thấy mục" }, { status: 404 });

  const refs = await countReferences(current.domain, current.code);
  if (refs > 0)
    return NextResponse.json(
      { error: `Mã đang được ${refs} bản ghi tham chiếu, không thể xoá`, references: refs },
      { status: 409 },
    );

  await deleteItem(id);
  return NextResponse.json({ ok: true });
}
