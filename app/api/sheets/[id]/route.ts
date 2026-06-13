import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { SLUG_RE } from "@/lib/sheets";

export const dynamic = "force-dynamic";

type Sheet = { id: number; code: string; name: string; responsible: string | null; slug: string };

// PATCH /api/sheets/:id — đổi tên / mã / đường dẫn / người phụ trách (Admin/PM).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Bạn không có quyền sửa sheet (chỉ Admin/PM)" }, { status: 403 });

  const id = Number(params.id);
  const st = await queryOne<Sheet>(`SELECT id, code, name, responsible, slug FROM sheet_types WHERE id = ?`, id);
  if (!st) return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên sheet không được rỗng" }, { status: 400 });
    sets.push("name = ?"); vals.push(name);
  }
  if (body.code !== undefined) {
    const code = String(body.code).trim();
    if (!code) return NextResponse.json({ error: "Mã sheet không được rỗng" }, { status: 400 });
    if (code !== st.code && await queryOne(`SELECT id FROM sheet_types WHERE code = ? AND id <> ?`, code, id))
      return NextResponse.json({ error: `Mã sheet "${code}" đã tồn tại` }, { status: 409 });
    sets.push("code = ?"); vals.push(code);
  }
  if (body.slug !== undefined) {
    const slug = String(body.slug).trim();
    if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "Đường dẫn không hợp lệ — chỉ dùng chữ thường a-z, số và gạch nối" }, { status: 400 });
    if (slug !== st.slug && await queryOne(`SELECT id FROM sheet_types WHERE slug = ? AND id <> ?`, slug, id))
      return NextResponse.json({ error: `Đường dẫn "${slug}" đã được dùng` }, { status: 409 });
    sets.push("slug = ?"); vals.push(slug);
  }
  if (body.responsible !== undefined) {
    sets.push("responsible = ?"); vals.push(String(body.responsible).trim() || null);
  }
  if (!sets.length) return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 400 });

  await run(`UPDATE sheet_types SET ${sets.join(", ")} WHERE id = ?`, ...vals, id);
  const updated = await queryOne<Sheet>(`SELECT id, code, name, responsible, slug FROM sheet_types WHERE id = ?`, id);
  return NextResponse.json({ sheet: updated });
}

// DELETE /api/sheets/:id — xoá sheet kèm toàn bộ nhóm/task/dimension/vật tư (chỉ Admin).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Chỉ Admin được xoá sheet" }, { status: 403 });

  const id = Number(params.id);
  const st = await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, id);
  if (!st) return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

  // FK không có ON DELETE CASCADE — xoá thủ công theo thứ tự phụ thuộc.
  const taskIds = `SELECT t.id FROM tasks t JOIN work_packages wp ON t.package_id = wp.id WHERE wp.sheet_type_id = ${id}`;
  for (const tbl of ["progress_dimensions", "task_history", "task_photos", "task_comments", "task_documents", "baseline_tasks"]) {
    await run(`DELETE FROM ${tbl} WHERE task_id IN (${taskIds})`);
  }
  await run(`DELETE FROM notifications WHERE task_id IN (${taskIds})`);
  await run(`DELETE FROM notifications WHERE material_id IN (SELECT id FROM materials WHERE sheet_type_id = ?)`, id);
  await run(`DELETE FROM material_transactions WHERE material_id IN (SELECT id FROM materials WHERE sheet_type_id = ?)`, id);
  await run(`DELETE FROM materials WHERE sheet_type_id = ?`, id);
  await run(`DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id = ?)`, id);
  await run(`DELETE FROM work_packages WHERE sheet_type_id = ?`, id);
  await run(`DELETE FROM sheet_types WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
