import { NextRequest, NextResponse } from "next/server";
import { query, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

const RACI_VALUES = ["R", "A", "C", "I"] as const;

export type RaciRow = {
  id: number;
  scope: string;
  roleLabel: string;
  personnelId: number | null;
  personnelName: string | null;
  raci: (typeof RACI_VALUES)[number];
};

// GET /api/raci — ma trận RACI (vai trò × hạng mục), scoped theo dự án đang chọn (M22).
// Xem: mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ items: [] });

  const items = await query<RaciRow>(
    `SELECT r.id, r.scope, r.role_label AS "roleLabel", r.personnel_id AS "personnelId",
            p.full_name AS "personnelName", r.raci
       FROM raci_matrix r LEFT JOIN personnel p ON p.id = r.personnel_id
      WHERE r.project_id = ?
      ORDER BY r.scope, r.id`,
    projectId,
  );
  return NextResponse.json({ items });
}

// PUT /api/raci  body: { scope, rows: [{ roleLabel, personnelId, raci }] } — thay toàn
// bộ dòng RACI của 1 hạng mục/quy trình (Admin/PM). Không đụng scope khác.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa ma trận RACI (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để sửa RACI" }, { status: 422 });

  const body = await req.json().catch(() => null);
  const scope = typeof body?.scope === "string" ? body.scope.trim() : "";
  if (!scope) return NextResponse.json({ error: "Thiếu tên hạng mục/quy trình" }, { status: 422 });

  const rowsIn = Array.isArray(body?.rows) ? body.rows : null;
  if (!rowsIn) return NextResponse.json({ error: "Thiếu danh sách RACI" }, { status: 422 });

  const rows: { roleLabel: string; personnelId: number | null; raci: string }[] = [];
  for (const r of rowsIn) {
    const roleLabel = typeof r?.roleLabel === "string" ? r.roleLabel.trim() : "";
    if (!roleLabel)
      return NextResponse.json({ error: "Thiếu tên vai trò trong 1 dòng RACI" }, { status: 422 });
    const raci = typeof r?.raci === "string" ? r.raci.toUpperCase() : "";
    if (!RACI_VALUES.includes(raci as (typeof RACI_VALUES)[number]))
      return NextResponse.json({ error: `Giá trị RACI không hợp lệ: ${raci}` }, { status: 422 });
    const personnelId =
      r?.personnelId != null && r.personnelId !== "" ? Number(r.personnelId) : null;
    if (personnelId != null && !Number.isInteger(personnelId))
      return NextResponse.json(
        { error: "Nhân sự không hợp lệ trong 1 dòng RACI" },
        { status: 422 },
      );
    rows.push({ roleLabel, personnelId, raci });
  }

  await withTransaction(async () => {
    await run(`DELETE FROM raci_matrix WHERE project_id = ? AND scope = ?`, projectId, scope);
    for (const r of rows) {
      await run(
        `INSERT INTO raci_matrix (project_id, scope, role_label, personnel_id, raci)
         VALUES (?, ?, ?, ?, ?)`,
        projectId,
        scope,
        r.roleLabel,
        r.personnelId,
        r.raci,
      );
    }
  });

  return NextResponse.json({ ok: true });
}
