// Trang "Mặt bằng thi công" bản mới (M46) — trục tầng × công tác thi công (Trắc đạc →
// MEP layout → Xây thô → MEP âm tường → Tô trám → …) thay cho trục tầng × sheet-type cũ.
// Bảng cũ (work_fronts, xem lib/workfronts.ts) vẫn giữ nguyên, không đụng tới.
import { query, queryOne, run, insertId, todayISO, daysFromTodayISO } from "@/lib/db";
import { sortFloorsDesc } from "@/lib/floors";

export type StageRow = { id: number; name: string; sortOrder: number; active: boolean };

export async function listStages(): Promise<StageRow[]> {
  return query<StageRow>(
    `SELECT id, name, sort_order AS "sortOrder", active
       FROM construction_stages WHERE active = TRUE ORDER BY sort_order, id`,
  );
}

export async function createStage(name: string): Promise<number> {
  return insertId(
    `INSERT INTO construction_stages (name, sort_order)
     VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM construction_stages))`,
    name,
  );
}

export async function updateStage(
  id: number,
  patch: { name?: string; active?: boolean; sortOrder?: number },
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.active !== undefined) {
    sets.push("active = ?");
    args.push(patch.active);
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    args.push(patch.sortOrder);
  }
  if (sets.length === 0) return;
  args.push(id);
  await run(`UPDATE construction_stages SET ${sets.join(", ")} WHERE id = ?`, ...args);
}

export type FloorStageFrontRow = {
  id: number;
  floorLabel: string;
  stageId: number;
  handedOverAt: string | null;
  note: string | null;
  updatedAt: string;
};

// Đảm bảo có đủ dòng floor_stage_fronts cho mọi (tầng, công tác active) — gọi lười lúc
// GET vì tầng/công tác phát sinh dần, không seed 1 lần cố định. Số tầng + công tác nhỏ
// (vài chục × vài chục) nên lặp run() theo từng floor là đủ, không cần tối ưu 1 câu SQL.
export async function ensureFloorStageFronts(floorLabels: string[]): Promise<void> {
  for (const floor of floorLabels) {
    await run(
      `INSERT INTO floor_stage_fronts (floor_label, stage_id)
       SELECT ?, id FROM construction_stages WHERE active = TRUE
       ON CONFLICT (floor_label, stage_id) DO NOTHING`,
      floor,
    );
  }
}

export async function listFloorStageFronts(floorLabel?: string): Promise<FloorStageFrontRow[]> {
  return query<FloorStageFrontRow>(
    `SELECT id, floor_label AS "floorLabel", stage_id AS "stageId",
            handed_over_at AS "handedOverAt", note, updated_at AS "updatedAt"
       FROM floor_stage_fronts
      ${floorLabel ? "WHERE floor_label = ?" : ""}
      ORDER BY floor_label, stage_id`,
    ...(floorLabel ? [floorLabel] : []),
  );
}

export async function upsertFloorStageFront(
  floorLabel: string,
  stageId: number,
  input: { handedOverAt: string | null; note: string | null },
  userId: number,
): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO floor_stage_fronts (floor_label, stage_id, handed_over_at, note, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (floor_label, stage_id) DO UPDATE
       SET handed_over_at = EXCLUDED.handed_over_at, note = EXCLUDED.note,
           updated_by = ?, updated_at = NOW()
     RETURNING id`,
    floorLabel,
    stageId,
    input.handedOverAt,
    input.note,
    userId,
    userId,
  );
  return row!.id;
}

// Toàn bộ tầng đang có trong dự án (kể cả tầng chưa từng có work_package/task) — dùng
// làm danh sách hàng của lưới mặt bằng, copy đúng nguồn dữ liệu của /api/timeline.
export async function allProjectFloors(): Promise<string[]> {
  const rows = await query<{ floorLabel: string }>(
    `SELECT DISTINCT wp.floor_label AS "floorLabel"
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''`,
  );
  return rows.map((r) => r.floorLabel).sort(sortFloorsDesc);
}

export type StageMissingItem = {
  floorStageFrontId: number;
  floorLabel: string;
  stageName: string;
  earliestStart: string;
  waitingDays: number;
};

// Tầng "chưa sẵn sàng" = công tác cuối cùng theo sort_order (trong các stage active) của
// tầng đó còn handed_over_at NULL — áp dụng chung mọi hệ (khác model cũ tách theo sheet).
export async function pendingStageFloors(): Promise<Set<string>> {
  const rows = await query<{ floorLabel: string }>(
    `SELECT fsf.floor_label AS "floorLabel"
       FROM floor_stage_fronts fsf
       JOIN construction_stages cs ON cs.id = fsf.stage_id
      WHERE cs.active = TRUE AND fsf.handed_over_at IS NULL
        AND cs.sort_order = (SELECT MAX(sort_order) FROM construction_stages WHERE active = TRUE)`,
  );
  return new Set(rows.map((r) => r.floorLabel));
}

// Tầng chưa sẵn sàng (như trên) có ít nhất 1 task với start_date ≤3 ngày tới (hoặc đã
// quá) — nguồn notification + báo cáo EOT + dashboard. projectId lọc qua chain
// work_packages → sheet_types → towers (floor_label không phải FK nên JOIN theo giá trị,
// giống cách allProjectFloors() suy tầng). Copy tinh thần frontMissingList() cũ trong
// lib/workfronts.ts nhưng bỏ trục sheet.
export async function stageMissingList(projectId?: number): Promise<StageMissingItem[]> {
  const soon = daysFromTodayISO(3);
  const today = todayISO();
  const conds = [
    "cs.active = TRUE",
    "fsf.handed_over_at IS NULL",
    "cs.sort_order = (SELECT MAX(sort_order) FROM construction_stages WHERE active = TRUE)",
    "t.start_date IS NOT NULL",
    "t.start_date <= ?",
    "t.status NOT IN ('hoan_thanh','nghiem_thu')",
  ];
  const args: unknown[] = [soon];
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    floorStageFrontId: number;
    floorLabel: string;
    stageName: string;
    earliestStart: string;
  }>(
    `SELECT fsf.id AS "floorStageFrontId", fsf.floor_label AS "floorLabel", cs.name AS "stageName",
            MIN(t.start_date) AS "earliestStart"
       FROM floor_stage_fronts fsf
       JOIN construction_stages cs ON cs.id = fsf.stage_id
       JOIN work_packages wp ON wp.floor_label = fsf.floor_label
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
       JOIN tasks t ON t.package_id = wp.id
      WHERE ${conds.join(" AND ")}
      GROUP BY fsf.id, fsf.floor_label, cs.name`,
    ...args,
  );
  return rows.map((r) => {
    const waitingDays = Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(r.earliestStart)) / 86400_000),
    );
    return { ...r, waitingDays };
  });
}
