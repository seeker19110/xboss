// Trang "Mặt bằng thi công" bản mới (M46) — trục tầng × công tác thi công (Trắc đạc →
// MEP layout → Xây thô → MEP âm tường → Tô trám → …) thay cho trục tầng × sheet-type cũ.
// Bảng cũ (work_fronts, xem lib/workfronts.ts) vẫn giữ nguyên, không đụng tới.
import { query, queryOne, run, insertId, todayISO, daysFromTodayISO } from "@/lib/db";
import { sortFloorsDesc } from "@/lib/tien-do/floors";
import { addDaysISO } from "@/lib/nen/date";

export type StageRow = {
  id: number;
  name: string;
  sortOrder: number;
  active: boolean;
  durationDays: number;
};

// Danh mục công tác mà MỘT dự án nhìn thấy (M123 · D1): project_id NULL = công tác dùng
// chung mọi dự án (7 công tác seed của migrations/0046), có giá trị = công tác riêng dự án.
export async function listStages(projectId: number): Promise<StageRow[]> {
  return query<StageRow>(
    `SELECT id, name, sort_order AS "sortOrder", active, duration_days AS "durationDays"
       FROM construction_stages
      WHERE active = TRUE AND (project_id IS NULL OR project_id = ?)
      ORDER BY sort_order, id`,
    projectId,
  );
}

// Tạo công tác RIÊNG của dự án (project_id luôn do route suy từ getCurrentProjectId, không
// nhận từ client). sort_order tính trên các công tác dự án đó nhìn thấy (chung + riêng).
export async function createStage(
  projectId: number,
  name: string,
  durationDays: number,
): Promise<number> {
  return insertId(
    `INSERT INTO construction_stages (project_id, name, sort_order, duration_days)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM construction_stages
                     WHERE project_id IS NULL OR project_id = ?), ?)`,
    projectId,
    name,
    projectId,
    durationDays,
  );
}

// Sửa công tác mà dự án đó nhìn thấy (chung + riêng). Luật quyền D3 (chỉ Admin được sửa
// công tác dùng chung) kiểm ở route PATCH — ở đây chỉ chặn sửa công tác của dự án khác.
export async function updateStage(
  projectId: number,
  id: number,
  patch: { name?: string; active?: boolean; sortOrder?: number; durationDays?: number },
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
  if (patch.durationDays !== undefined) {
    sets.push("duration_days = ?");
    args.push(patch.durationDays);
  }
  if (sets.length === 0) return;
  args.push(id, projectId);
  await run(
    `UPDATE construction_stages SET ${sets.join(", ")}
      WHERE id = ? AND (project_id IS NULL OR project_id = ?)`,
    ...args,
  );
}

export type FloorStageFrontRow = {
  id: number;
  floorLabel: string;
  stageId: number;
  handedOverAt: string | null;
  receivedAt: string | null;
  plannedReceivedAt: string | null;
  note: string | null;
  outgoingSupplierId: number | null;
  incomingSupplierId: number | null;
  transitionStageId: number | null;
  outgoingRepName: string | null;
  incomingRepName: string | null;
  updatedAt: string;
};

// Đảm bảo có đủ dòng floor_stage_fronts cho mọi (tầng, công tác active) CỦA MỘT DỰ ÁN —
// gọi lười lúc GET vì tầng/công tác phát sinh dần, không seed 1 lần cố định. Số tầng +
// công tác nhỏ (vài chục × vài chục) nên lặp run() theo từng floor là đủ, không cần tối
// ưu 1 câu SQL. projectId bắt buộc (M123): nhãn tầng là chuỗi tự do nên hai dự án cùng có
// "T5" phải ra hai bộ ô độc lập — ON CONFLICT bám unique index uniq_floor_stage_fronts_project.
export async function ensureFloorStageFronts(
  projectId: number,
  floorLabels: string[],
): Promise<void> {
  for (const floor of floorLabels) {
    await run(
      `INSERT INTO floor_stage_fronts (project_id, floor_label, stage_id)
       SELECT ?, ?, id FROM construction_stages WHERE active = TRUE
       ON CONFLICT (COALESCE(project_id, 0), floor_label, stage_id) DO NOTHING`,
      projectId,
      floor,
    );
  }
}

// Các ô mặt trận của MỘT dự án (M123) — projectId bắt buộc vì floor_label là chuỗi tự do,
// hai dự án cùng có "T5" là hai bộ ô độc lập.
export async function listFloorStageFronts(
  projectId: number,
  floorLabel?: string,
): Promise<FloorStageFrontRow[]> {
  return query<FloorStageFrontRow>(
    `SELECT id, floor_label AS "floorLabel", stage_id AS "stageId",
            handed_over_at AS "handedOverAt", received_at AS "receivedAt",
            planned_received_at AS "plannedReceivedAt", note,
            outgoing_supplier_id AS "outgoingSupplierId",
            incoming_supplier_id AS "incomingSupplierId",
            transition_stage_id AS "transitionStageId",
            outgoing_rep_name AS "outgoingRepName", incoming_rep_name AS "incomingRepName",
            updated_at AS "updatedAt"
       FROM floor_stage_fronts fsf
      WHERE fsf.project_id = ?${floorLabel ? " AND fsf.floor_label = ?" : ""}
      ORDER BY floor_label, stage_id`,
    projectId,
    ...(floorLabel ? [floorLabel] : []),
  );
}

// Ghi 1 ô mặt trận (tầng × công tác) của MỘT dự án — projectId bắt buộc (M123) và luôn do
// route suy từ getCurrentProjectId(), không nhận từ client. ON CONFLICT bám unique index
// uniq_floor_stage_fronts_project nên ô "T5" của dự án A không đè ô "T5" của dự án B.
export async function upsertFloorStageFront(
  projectId: number,
  floorLabel: string,
  stageId: number,
  input: {
    receivedAt: string | null;
    handedOverAt: string | null;
    plannedReceivedAt: string | null;
    note: string | null;
    outgoingSupplierId: number | null;
    incomingSupplierId: number | null;
    transitionStageId: number | null;
    outgoingRepName: string | null;
    incomingRepName: string | null;
  },
  userId: number,
): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO floor_stage_fronts
       (project_id, floor_label, stage_id, received_at, handed_over_at, planned_received_at, note,
        outgoing_supplier_id, incoming_supplier_id, transition_stage_id,
        outgoing_rep_name, incoming_rep_name, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (COALESCE(project_id, 0), floor_label, stage_id) DO UPDATE
       SET received_at = EXCLUDED.received_at, handed_over_at = EXCLUDED.handed_over_at,
           planned_received_at = EXCLUDED.planned_received_at, note = EXCLUDED.note,
           outgoing_supplier_id = EXCLUDED.outgoing_supplier_id,
           incoming_supplier_id = EXCLUDED.incoming_supplier_id,
           transition_stage_id = EXCLUDED.transition_stage_id,
           outgoing_rep_name = EXCLUDED.outgoing_rep_name,
           incoming_rep_name = EXCLUDED.incoming_rep_name,
           updated_by = ?, updated_at = NOW()
     RETURNING id`,
    projectId,
    floorLabel,
    stageId,
    input.receivedAt,
    input.handedOverAt,
    input.plannedReceivedAt,
    input.note,
    input.outgoingSupplierId,
    input.incomingSupplierId,
    input.transitionStageId,
    input.outgoingRepName,
    input.incomingRepName,
    userId,
    userId,
  );
  return row!.id;
}

export type PlannedDates = { plannedReceivedAt: string | null; plannedHandedOverAt: string | null };

// Tính ngày kế hoạch nối tiếp cho từng công tác của 1 tầng theo thứ tự sort_order: công
// tác đầu tiên lấy planned_received_at đã lưu (do PM đặt tay), các công tác sau = ngày
// bàn giao kế hoạch của công tác liền trước (không lưu DB, tính lại mỗi lần đọc để không
// bao giờ lệch khi đổi duration_days/thêm bớt công tác).
export function computePlannedDates(
  stages: StageRow[],
  fronts: FloorStageFrontRow[],
  floorLabel: string,
): Map<number, PlannedDates> {
  const result = new Map<number, PlannedDates>();
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  let cursor: string | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const stage = sorted[i];
    const front = fronts.find((f) => f.floorLabel === floorLabel && f.stageId === stage.id);
    const receivedAt: string | null = i === 0 ? (front?.plannedReceivedAt ?? null) : cursor;
    const handedOverAt: string | null = receivedAt
      ? addDaysISO(receivedAt, stage.durationDays)
      : null;
    result.set(stage.id, { plannedReceivedAt: receivedAt, plannedHandedOverAt: handedOverAt });
    cursor = handedOverAt;
  }
  return result;
}

// Toàn bộ tầng đang có trong dự án (kể cả tầng chưa từng có work_package/task) — dùng
// làm danh sách hàng của lưới mặt bằng, copy đúng nguồn dữ liệu của /api/timeline.
export async function allProjectFloors(projectId: number): Promise<string[]> {
  const rows = await query<{ floorLabel: string }>(
    `SELECT DISTINCT wp.floor_label AS "floorLabel"
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
        AND tw.project_id = ?`,
    projectId,
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
// projectId lọc thẳng theo cột fsf.project_id (M123 · F6 — trước đây phải suy dự án qua
// chuỗi wp.floor_label = fsf.floor_label vì bảng chưa có cột dự án).
export async function pendingStageFloors(projectId?: number): Promise<Set<string>> {
  const conds = [
    "cs.active = TRUE",
    "fsf.handed_over_at IS NULL",
    "cs.sort_order = (SELECT MAX(sort_order) FROM construction_stages WHERE active = TRUE)",
  ];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("fsf.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ floorLabel: string }>(
    `SELECT fsf.floor_label AS "floorLabel"
       FROM floor_stage_fronts fsf
       JOIN construction_stages cs ON cs.id = fsf.stage_id
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return new Set(rows.map((r) => r.floorLabel));
}

// Tầng chưa sẵn sàng (như trên) có ít nhất 1 task với start_date ≤3 ngày tới (hoặc đã
// quá) — nguồn notification + báo cáo EOT + dashboard. projectId lọc thẳng theo cột
// fsf.project_id (M123 · F6); JOIN work_packages/tasks vẫn giữ vì cần ngày bắt đầu của
// task trên tầng đó. Copy tinh thần frontMissingList() cũ trong lib/workfronts.ts nhưng
// bỏ trục sheet.
export async function stageMissingList(projectId?: number): Promise<StageMissingItem[]> {
  const soon = daysFromTodayISO(3);
  const today = todayISO();
  // COALESCE(t.start_date, wp.start_date): task.start_date NULL = kế thừa ngày BĐ nhóm (lib/recompute.ts).
  const conds = [
    "cs.active = TRUE",
    "fsf.handed_over_at IS NULL",
    "cs.sort_order = (SELECT MAX(sort_order) FROM construction_stages WHERE active = TRUE)",
    "COALESCE(t.start_date, wp.start_date) IS NOT NULL",
    "COALESCE(t.start_date, wp.start_date) <= ?",
    "t.status NOT IN ('hoan_thanh','nghiem_thu')",
  ];
  const args: unknown[] = [soon];
  if (projectId != null) {
    conds.push("fsf.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    floorStageFrontId: number;
    floorLabel: string;
    stageName: string;
    earliestStart: string;
  }>(
    `SELECT fsf.id AS "floorStageFrontId", fsf.floor_label AS "floorLabel", cs.name AS "stageName",
            MIN(COALESCE(t.start_date, wp.start_date)) AS "earliestStart"
       FROM floor_stage_fronts fsf
       JOIN construction_stages cs ON cs.id = fsf.stage_id
       JOIN work_packages wp ON wp.floor_label = fsf.floor_label
       JOIN sheet_types st ON st.id = wp.sheet_type_id
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
