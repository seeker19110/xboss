import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, queryOne, withTransaction } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

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

  const projectId = await getCurrentProjectId(user);
  if (!Number.isSafeInteger(user.orgId) || user.orgId <= 0 || projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  const invalid = () =>
    NextResponse.json({ error: "Dữ liệu cập nhật không hợp lệ" }, { status: 400 });
  const parseId = (value: unknown): number | null => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d*$/.test(value)))
      return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
  if (!body || typeof body !== "object" || !Array.isArray((body as { updates?: unknown }).updates))
    return invalid();
  const rawUpdates = (body as { updates: unknown[] }).updates;
  if (rawUpdates.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const updates: { sheetTypeId: number; floorLabel: string; contractValue: number }[] = [];
  const seen = new Set<string>();
  for (const raw of rawUpdates) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid();
    const row = raw as Record<string, unknown>;
    const sheetTypeId = parseId(row.sheetTypeId);
    if (
      sheetTypeId == null ||
      typeof row.floorLabel !== "string" ||
      row.floorLabel.trim() === "" ||
      typeof row.contractValue !== "number" ||
      !Number.isFinite(row.contractValue) ||
      row.contractValue < 0 ||
      row.contractValue > 9_999_999_999_999.99
    )
      return invalid();
    const floorLabel = row.floorLabel.trim();
    const key = `${sheetTypeId}\0${floorLabel}`;
    if (seen.has(key)) return invalid();
    seen.add(key);
    updates.push({ sheetTypeId, floorLabel, contractValue: row.contractValue });
  }

  const placeholders = updates.map(() => "(?::integer, ?::text, ?::numeric)").join(", ");
  const params = updates.flatMap((u) => [u.sheetTypeId, u.floorLabel, u.contractValue]);
  let writeResult: { ok: false } | { ok: true; count: number };
  try {
    writeResult = await withTransaction(async () => {
      // Lock and validate every sheet against both the selected project and actor org.
      const ids = [...new Set(updates.map((u) => u.sheetTypeId))];
      const idPlaceholders = ids.map(() => "?").join(", ");
      const sheets = await query<{ id: number }>(
        `SELECT st.id
         FROM sheet_types st
         JOIN towers tw ON tw.id = st.tower_id
         JOIN projects p ON p.id = tw.project_id
        WHERE st.id IN (${idPlaceholders}) AND tw.project_id = ? AND p.org_id = ?
        ORDER BY st.id
        FOR UPDATE OF st, tw, p`,
        ...ids,
        projectId,
        user.orgId,
      );
      if (sheets.length !== ids.length) return { ok: false as const };

      // Existing optional contract pointers must remain within this exact project/org.
      const existing: { contractId: number | null }[] = [];
      for (const u of updates) {
        const row = await queryOne<{ contractId: number | null }>(
          `SELECT contract_id AS "contractId" FROM floor_contracts
          WHERE sheet_type_id = ? AND floor_label = ? FOR UPDATE`,
          u.sheetTypeId,
          u.floorLabel,
        );
        if (row?.contractId != null) existing.push(row);
      }
      const contractIds = [...new Set(existing.map((r) => r.contractId!))];
      if (contractIds.length) {
        const contractPlaceholders = contractIds.map(() => "?").join(", ");
        const contracts = await query<{ id: number }>(
          `SELECT c.id FROM contracts c JOIN projects p ON p.id = c.project_id
          WHERE c.id IN (${contractPlaceholders}) AND c.project_id = ? AND p.org_id = ?
          ORDER BY c.id FOR UPDATE OF c, p`,
          ...contractIds,
          projectId,
          user.orgId,
        );
        if (contracts.length !== contractIds.length) return { ok: false as const };
      }

      // A single guarded upsert is the only mutation. The conditional conflict clause also
      // protects against an out-of-scope contract pointer appearing after the validation read.
      const written = await query<{ sheetTypeId: number; floorLabel: string }>(
        `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value)
       SELECT v.sheet_type_id, v.floor_label, v.contract_value
         FROM (VALUES ${placeholders}) AS v(sheet_type_id, floor_label, contract_value)
         JOIN sheet_types st ON st.id = v.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
         JOIN projects p ON p.id = tw.project_id
        WHERE tw.project_id = ? AND p.org_id = ?
       ON CONFLICT (sheet_type_id, floor_label)
       DO UPDATE SET contract_value = EXCLUDED.contract_value
        WHERE floor_contracts.contract_id IS NULL OR EXISTS (
          SELECT 1 FROM contracts c JOIN projects cp ON cp.id = c.project_id
           WHERE c.id = floor_contracts.contract_id
             AND c.project_id = ? AND cp.org_id = ?
        )
       RETURNING sheet_type_id AS "sheetTypeId", floor_label AS "floorLabel"`,
        ...params,
        projectId,
        user.orgId,
        projectId,
        user.orgId,
      );
      if (written.length !== updates.length) throw new Error("FLOOR_CONTRACT_SCOPE_CONFLICT");
      return { ok: true as const, count: written.length };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FLOOR_CONTRACT_SCOPE_CONFLICT")
      return NextResponse.json(
        { error: "Không tìm thấy dữ liệu trong dự án đang chọn" },
        { status: 404 },
      );
    throw error;
  }
  if (!writeResult.ok)
    return NextResponse.json(
      { error: "Không tìm thấy dữ liệu trong dự án đang chọn" },
      { status: 404 },
    );
  return NextResponse.json({ ok: true, updated: writeResult.count });
}
