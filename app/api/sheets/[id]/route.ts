import { laLoiKhoaNgoai, phanHoiXungDotPhuThuoc } from "@/lib/nen/loi";
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { khoaNhatKyCuaAnhTask } from "@/lib/hien-truong/diary";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { SLUG_RE } from "@/lib/nen/sheets";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

type Sheet = {
  id: number;
  code: string;
  name: string;
  responsible: string | null;
  slug: string;
  managerId: number | null;
};

// PATCH /api/sheets/:id — đổi tên / mã / đường dẫn / người phụ trách (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa sheet (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = Number(params.id);
  const st = await queryOne<Sheet>(
    `SELECT id, code, name, responsible, slug, manager_id AS "managerId" FROM sheet_types WHERE id = ?`,
    id,
  );
  if (!st) return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

  // Chống ghi xuyên dự án: suy dự án qua sheet_types.tower_id → towers.project_id (vá V9).
  // P1-6: chỉ sheet thuộc DỰ ÁN ĐANG CHỌN (+ org), không phải mọi dự án nhìn thấy được.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });
  const proj = await queryOne<{ id: number }>(
    `SELECT st.id FROM sheet_types st JOIN towers t ON t.id = st.tower_id
       JOIN projects p ON p.id = t.project_id
      WHERE st.id = ? AND t.project_id = ? AND p.org_id = ?`,
    id,
    projectId,
    user.orgId,
  );
  if (!proj) return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên sheet không được rỗng" }, { status: 400 });
    sets.push("name = ?");
    vals.push(name);
  }
  if (body.code !== undefined) {
    const code = String(body.code).trim();
    if (!code) return NextResponse.json({ error: "Mã sheet không được rỗng" }, { status: 400 });
    if (
      code !== st.code &&
      (await queryOne(
        `SELECT id FROM sheet_types WHERE code = ? AND project_id = ? AND id <> ?`,
        code,
        projectId,
        id,
      ))
    )
      return NextResponse.json({ error: `Mã sheet "${code}" đã tồn tại` }, { status: 409 });
    sets.push("code = ?");
    vals.push(code);
  }
  if (body.slug !== undefined) {
    const slug = String(body.slug).trim();
    if (!SLUG_RE.test(slug))
      return NextResponse.json(
        { error: "Đường dẫn không hợp lệ — chỉ dùng chữ thường a-z, số và gạch nối" },
        { status: 400 },
      );
    if (
      // S02e: slug chỉ cần duy nhất trong dự án đang chọn (uq_sheet_types_project_slug).
      slug !== st.slug &&
      (await queryOne(
        `SELECT id FROM sheet_types WHERE slug = ? AND project_id = ? AND id <> ?`,
        slug,
        projectId,
        id,
      ))
    )
      return NextResponse.json({ error: `Đường dẫn "${slug}" đã được dùng` }, { status: 409 });
    sets.push("slug = ?");
    vals.push(slug);
  }
  if (body.responsible !== undefined) {
    sets.push("responsible = ?");
    vals.push(String(body.responsible).trim() || null);
  }
  if (body.managerId !== undefined) {
    const mid = body.managerId === null ? null : Number(body.managerId);
    // Cách ly tổ chức (Đợt 6, Việc G): users.org_id — cùng lớp lỗi đã vá ở
    // app/api/users/[id]/route.ts (Đợt 5, M54 GĐ1 PR2).
    if (
      mid !== null &&
      (isNaN(mid) ||
        !(await queryOne(`SELECT id FROM users WHERE id = ? AND org_id = ?`, mid, user.orgId)))
    )
      return NextResponse.json({ error: "Người dùng không tồn tại" }, { status: 400 });
    sets.push("manager_id = ?");
    vals.push(mid);
  }
  if (!sets.length) return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 400 });

  // Phòng thủ nhiều lớp: thêm điều kiện tower thuộc dự án đang chọn vào câu UPDATE.
  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await ghiNeuConQuyen(
    () => CAN.editStructure(user.role),
    () =>
      run(
        `UPDATE sheet_types SET ${sets.join(", ")} WHERE id = ? AND tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
        ...vals,
        id,
        projectId,
      ),
  );
  if (!kq.ok)
    return NextResponse.json(
      { error: "Bạn không có quyền sửa sheet (chỉ Admin/PM)" },
      { status: 403 },
    );
  const updated = await queryOne<Sheet>(
    `SELECT id, code, name, responsible, slug, manager_id AS "managerId" FROM sheet_types WHERE id = ?`,
    id,
  );
  return NextResponse.json({ sheet: updated });
}

// DELETE /api/sheets/:id — xoá sheet kèm toàn bộ nhóm/task/dimension/vật tư (chỉ Admin).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  try {
    const params = await paramsP;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (!CAN.editStructure(user.role))
      return NextResponse.json({ error: "Chỉ Admin/PM được xoá sheet" }, { status: 403 });

    const id = Number(params.id);
    if (Number.isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
    const st = await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, id);
    if (!st) return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

    // Chống xoá xuyên dự án: suy dự án qua sheet_types.tower_id → towers.project_id (vá V9).
    // P1-6: chỉ sheet thuộc DỰ ÁN ĐANG CHỌN (+ org), không phải mọi dự án nhìn thấy được.
    const projectId = await getCurrentProjectId(user);
    if (projectId == null)
      return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });
    const proj = await queryOne<{ id: number }>(
      `SELECT st.id FROM sheet_types st JOIN towers t ON t.id = st.tower_id
       JOIN projects p ON p.id = t.project_id
      WHERE st.id = ? AND t.project_id = ? AND p.org_id = ?`,
      id,
      projectId,
      user.orgId,
    );
    if (!proj) return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

    // FK không có ON DELETE CASCADE — xoá thủ công theo thứ tự phụ thuộc.
    // Tên bảng lấy từ danh sách cố định; id luôn truyền qua placeholder ?.
    // Bọc transaction: xoá nhiều bảng phụ thuộc, lỗi giữa chừng phải rollback
    // toàn bộ để không để lại dữ liệu mồ côi (orphan).
    const taskIdsSql = `SELECT t.id FROM tasks t JOIN work_packages wp ON t.package_id = wp.id WHERE wp.sheet_type_id = ?`;
    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.editStructure(user.role),
      async () => {
        // Khoá nhật ký gắn ảnh của các task sắp xoá TRƯỚC mọi DELETE (thứ tự "nhật ký → ảnh", S06).
        const taskIds = (await query<{ id: number }>(taskIdsSql, id)).map((t) => t.id);
        await khoaNhatKyCuaAnhTask(taskIds);
        for (const tbl of [
          "progress_dimensions",
          "task_history",
          "task_photos",
          "task_comments",
          "task_documents",
          "baseline_tasks",
        ]) {
          await run(`DELETE FROM ${tbl} WHERE task_id IN (${taskIdsSql})`, id);
        }
        await run(`DELETE FROM notifications WHERE task_id IN (${taskIdsSql})`, id);
        await run(
          `DELETE FROM notifications WHERE material_id IN (SELECT id FROM materials WHERE sheet_type_id = ?)`,
          id,
        );
        await run(
          `DELETE FROM material_transactions WHERE material_id IN (SELECT id FROM materials WHERE sheet_type_id = ?)`,
          id,
        );
        await run(`DELETE FROM materials WHERE sheet_type_id = ?`, id);
        await run(
          `DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id = ?)`,
          id,
        );
        await run(`DELETE FROM work_packages WHERE sheet_type_id = ?`, id);
        // Phòng thủ nhiều lớp: chỉ xoá nếu tower vẫn thuộc dự án đang chọn lúc kiểm ở trên.
        await run(
          `DELETE FROM sheet_types WHERE id = ? AND tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
          id,
          projectId,
        );
      },
    );
    if (!kq.ok) return NextResponse.json({ error: "Chỉ Admin/PM được xoá sheet" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (laLoiKhoaNgoai(err)) return phanHoiXungDotPhuThuoc();
    throw err;
  }
}
