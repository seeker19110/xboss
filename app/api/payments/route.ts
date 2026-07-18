import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

type FloorRow = {
  sheetTypeId: number;
  sheetType: string;
  sheetSlug: string | null;
  responsible: string | null;
  floorLabel: string;
  progress: number;
  taskCount: number;
  delayed: number;
  contractValue: number;
};

// GET /api/payments — giá trị hợp đồng + tiến độ theo tầng × hệ.
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem thanh toán" }, { status: 403 });

  // Dự án đang chọn — lọc chéo dự án (giống pattern app/api/payments/floors/route.ts).
  // sheet_types không có project_id trực tiếp (suy qua tower_id). null = DB chưa có
  // dự án nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);
  const towerJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const towerFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const towerParam = projectId != null ? [projectId] : [];

  const rows = await query<FloorRow>(
    `
    SELECT st.id AS "sheetTypeId", st.code AS "sheetType", st.slug AS "sheetSlug",
           st.responsible AS responsible,
           wp.floor_label AS "floorLabel",
           COALESCE(AVG(t.progress_percent), 0) AS progress,
           COUNT(DISTINCT t.id)::int AS "taskCount",
           COALESCE(SUM(CASE WHEN t.status = 'tre' THEN 1 ELSE 0 END), 0)::int AS delayed,
           COALESCE(fc.contract_value, 0) AS "contractValue"
      FROM work_packages wp
      JOIN sheet_types st ON wp.sheet_type_id = st.id${towerJoin}
      LEFT JOIN tasks t ON t.package_id = wp.id
      LEFT JOIN floor_contracts fc
             ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
     WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''${towerFilter}
     GROUP BY st.id, st.code, st.slug, st.responsible, wp.floor_label, fc.contract_value
     ORDER BY st.id, wp.floor_label`,
    ...towerParam,
  );

  // Tổng hợp làm trong SQL (không cộng/nhân tiền trên số JS parse từ NUMERIC —
  // xem CLAUDE.md mục Quy ước / lib/money.ts) — cùng điều kiện lọc/nhóm với câu trên.
  const totals = await queryOne<{ totalContract: number; totalEarned: number }>(
    `
    WITH floor_data AS (
      SELECT st.id, wp.floor_label,
             COALESCE(AVG(t.progress_percent), 0) AS progress,
             COALESCE(fc.contract_value, 0) AS contract_value
        FROM work_packages wp
        JOIN sheet_types st ON wp.sheet_type_id = st.id${towerJoin}
        LEFT JOIN tasks t ON t.package_id = wp.id
        LEFT JOIN floor_contracts fc
               ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
       WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''${towerFilter}
       GROUP BY st.id, wp.floor_label, fc.contract_value
    )
    SELECT COALESCE(SUM(contract_value), 0) AS "totalContract",
           COALESCE(SUM(contract_value * progress), 0) AS "totalEarned"
      FROM floor_data`,
    ...towerParam,
  );

  return NextResponse.json({
    rows,
    totalContract: totals?.totalContract ?? 0,
    totalEarned: totals?.totalEarned ?? 0,
  });
}

// PATCH /api/payments — cập nhật giá trị HĐ theo tầng × hệ (upsert).
// Body: { updates: [{ sheetTypeId, floorLabel, contractValue }] }
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa giá trị hợp đồng" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const updates: { sheetTypeId: number; floorLabel: string; contractValue: number }[] =
    body?.updates ?? [];
  if (!updates.length) return NextResponse.json({ ok: true });

  for (const u of updates) {
    if (!Number.isFinite(u.contractValue) || u.contractValue < 0) continue;
    await run(
      `
      INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value)
           VALUES (?, ?, ?)
      ON CONFLICT (sheet_type_id, floor_label)
      DO UPDATE SET contract_value = EXCLUDED.contract_value`,
      u.sheetTypeId,
      u.floorLabel,
      u.contractValue,
    );
  }
  return NextResponse.json({ ok: true, updated: updates.length });
}
