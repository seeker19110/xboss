import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";

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

function parseProjectId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

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

  if (!Number.isSafeInteger(user.orgId) || user.orgId < 1)
    return NextResponse.json({ error: "Không xác định được tổ chức của Admin" }, { status: 403 });
  const id = parseProjectId(params.id);
  if (id === null) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const project = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
    id,
    user.orgId,
  );
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Tên dự án không được rỗng" }, { status: 400 });
    await run(`UPDATE projects SET name = ? WHERE id = ? AND org_id = ?`, name, id, user.orgId);
  }
  if (body?.code !== undefined) {
    const code = typeof body.code === "string" && body.code.trim() ? body.code.trim() : null;
    if (code) {
      const dup = await queryOne(
        `SELECT id FROM projects WHERE code = ? AND id <> ? AND org_id = ?`,
        code,
        id,
        user.orgId,
      );
      if (dup)
        return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });
    }
    await run(`UPDATE projects SET code = ? WHERE id = ? AND org_id = ?`, code, id, user.orgId);
  }
  if (body?.investor !== undefined)
    await run(
      `UPDATE projects SET investor = ? WHERE id = ? AND org_id = ?`,
      body.investor || null,
      id,
      user.orgId,
    );
  if (body?.contractor !== undefined)
    await run(
      `UPDATE projects SET contractor = ? WHERE id = ? AND org_id = ?`,
      body.contractor || null,
      id,
      user.orgId,
    );
  if (body?.color !== undefined)
    await run(
      `UPDATE projects SET color = ? WHERE id = ? AND org_id = ?`,
      body.color || null,
      id,
      user.orgId,
    );
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status))
      return NextResponse.json({ error: "Trạng thái dự án không hợp lệ" }, { status: 422 });
    await run(
      `UPDATE projects SET status = ? WHERE id = ? AND org_id = ?`,
      body.status,
      id,
      user.orgId,
    );
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

  if (!Number.isSafeInteger(user.orgId) || user.orgId < 1)
    return NextResponse.json({ error: "Không xác định được tổ chức của Admin" }, { status: 403 });
  const projectId = parseProjectId(params.id);
  if (projectId === null) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const project = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
    projectId,
    user.orgId,
  );
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
  await run(`DELETE FROM projects WHERE id = ? AND org_id = ?`, projectId, user.orgId);
  return NextResponse.json({ ok: true });
}
