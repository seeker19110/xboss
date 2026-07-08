import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "handover", "closed"];

// Bảng có cột project_id trực tiếp (M22 PR1, migrations/0027) — dùng để kiểm "rỗng dữ
// liệu" trước khi cho xoá dự án. `towers` cũng phải rỗng (mọi WBS suy qua tower).
const SCOPED_TABLES = [
  "contracts",
  "variation_orders",
  "materials",
  "boq_items",
  "purchase_orders",
  "purchase_requests",
  "meetings",
  "risks",
  "proposals",
  "correspondences",
  "drawings",
  "qc_checklists",
  "ncrs",
  "hse_records",
  "site_diaries",
  "equipment",
  "vehicle_logs",
  "tender_packages",
  "project_documents",
];

// PATCH /api/projects/:id — sửa tên/mã/CĐT/nhà thầu/trạng thái/màu (chỉ Admin).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới sửa được dự án" }, { status: 403 });

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const project = await queryOne(`SELECT id FROM projects WHERE id = ?`, id);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Tên dự án không được rỗng" }, { status: 400 });
    await run(`UPDATE projects SET name = ? WHERE id = ?`, name, id);
  }
  if (body?.code !== undefined) {
    const code = typeof body.code === "string" && body.code.trim() ? body.code.trim() : null;
    if (code) {
      const dup = await queryOne(`SELECT id FROM projects WHERE code = ? AND id <> ?`, code, id);
      if (dup)
        return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });
    }
    await run(`UPDATE projects SET code = ? WHERE id = ?`, code, id);
  }
  if (body?.investor !== undefined)
    await run(`UPDATE projects SET investor = ? WHERE id = ?`, body.investor || null, id);
  if (body?.contractor !== undefined)
    await run(`UPDATE projects SET contractor = ? WHERE id = ?`, body.contractor || null, id);
  if (body?.color !== undefined)
    await run(`UPDATE projects SET color = ? WHERE id = ?`, body.color || null, id);
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status))
      return NextResponse.json({ error: "Trạng thái dự án không hợp lệ" }, { status: 422 });
    await run(`UPDATE projects SET status = ? WHERE id = ?`, body.status, id);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/:id — chỉ Admin, chỉ khi dự án rỗng dữ liệu (không có tower nào
// lẫn không dòng nào ở các bảng scoped project_id) — tránh xoá nhầm mất dữ liệu thi công.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới xoá được dự án" }, { status: 403 });

  const projectId = Number(params.id);
  if (Number.isNaN(projectId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const project = await queryOne(`SELECT id FROM projects WHERE id = ?`, projectId);
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  const towerCount = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM towers WHERE project_id = ?`,
    projectId,
  );
  if ((towerCount?.n ?? 0) > 0)
    return NextResponse.json(
      { error: "Dự án còn tháp/WBS — không thể xoá (xoá tháp trước)" },
      { status: 409 },
    );

  for (const table of SCOPED_TABLES) {
    const row = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE project_id = ?`,
      projectId,
    );
    if ((row?.n ?? 0) > 0)
      return NextResponse.json(
        { error: `Dự án còn dữ liệu (${table}) — không thể xoá` },
        { status: 409 },
      );
  }

  await run(`DELETE FROM user_projects WHERE project_id = ?`, projectId);
  await run(`DELETE FROM nav_settings WHERE project_id = ?`, projectId);
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
  return NextResponse.json({ ok: true });
}
