// M14 — Mặt bằng thi công (work front): trạng thái bàn giao mặt bằng theo tầng/sheet,
// dùng làm bằng chứng xin gia hạn (EOT) với tổng thầu/CĐT. Xem docs/nang-cap/M14-mat-bang.md.
import { query, queryOne, run, withTransaction, todayISO, daysFromTodayISO } from "@/lib/db";

export const WORK_FRONT_STATUSES = ["pending", "handed_over", "in_progress", "returned"] as const;
export type WorkFrontStatus = (typeof WORK_FRONT_STATUSES)[number];
export const WORK_FRONT_STATUS_LABEL: Record<WorkFrontStatus, string> = {
  pending: "Chưa bàn giao",
  handed_over: "Đã bàn giao",
  in_progress: "Đang thi công",
  returned: "Đã trả",
};

// Thứ tự tuần tự hợp lệ — chỉ Admin được nhảy ngược (sửa sai).
const STEP_ORDER: Record<WorkFrontStatus, number> = {
  pending: 0,
  handed_over: 1,
  in_progress: 2,
  returned: 3,
};

export function isForwardTransition(from: WorkFrontStatus, to: WorkFrontStatus): boolean {
  return STEP_ORDER[to] >= STEP_ORDER[from];
}

export type WorkFrontRow = {
  id: number;
  sheetTypeId: number;
  sheetCode: string;
  floorLabel: string;
  status: WorkFrontStatus;
  handedOverAt: string | null;
  returnedAt: string | null;
  blocker: string | null;
  note: string | null;
  updatedAt: string;
};

export async function listWorkFronts(sheetTypeId?: number): Promise<WorkFrontRow[]> {
  return query<WorkFrontRow>(
    `SELECT wf.id, wf.sheet_type_id AS "sheetTypeId", st.code AS "sheetCode",
            wf.floor_label AS "floorLabel", wf.status,
            wf.handed_over_at AS "handedOverAt", wf.returned_at AS "returnedAt",
            wf.blocker, wf.note, wf.updated_at AS "updatedAt"
       FROM work_fronts wf JOIN sheet_types st ON st.id = wf.sheet_type_id
      ${sheetTypeId ? "WHERE wf.sheet_type_id = ?" : ""}
      ORDER BY st.code, wf.floor_label`,
    ...(sheetTypeId ? [sheetTypeId] : []),
  );
}

// Đảm bảo có đủ dòng work_fronts cho mọi (sheet, tầng) đang tồn tại trong work_packages —
// gọi lười lúc GET vì tầng mới xuất hiện dần theo import/tạo task, không seed 1 lần cố định.
export async function ensureWorkFronts(): Promise<void> {
  await run(
    `INSERT INTO work_fronts (sheet_type_id, floor_label)
     SELECT DISTINCT wp.sheet_type_id, wp.floor_label
       FROM work_packages wp
      WHERE wp.floor_label IS NOT NULL
     ON CONFLICT (sheet_type_id, floor_label) DO NOTHING`,
  );
}

export type WorkFrontUpdateInput = {
  status: WorkFrontStatus;
  handedOverAt: string | null;
  returnedAt: string | null;
  blocker: string | null;
  note: string | null;
};

export function parseWorkFrontUpdateBody(body: Record<string, unknown>): WorkFrontUpdateInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    status: (typeof body.status === "string" ? body.status : "") as WorkFrontStatus,
    handedOverAt: strOrNull(body.handedOverAt),
    returnedAt: strOrNull(body.returnedAt),
    blocker: strOrNull(body.blocker),
    note: strOrNull(body.note),
  };
}

export function validateWorkFrontUpdate(input: WorkFrontUpdateInput): string | null {
  if (!WORK_FRONT_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  return null;
}

// Đổi trạng thái + ghi lịch sử trong 1 transaction. `allowBackward` cho Admin nhảy ngược
// (sửa sai) — role khác chỉ được đi tới hoặc đứng yên.
export async function updateWorkFrontStatus(
  id: number,
  input: WorkFrontUpdateInput,
  userId: number,
  allowBackward: boolean,
): Promise<{ error: string } | { ok: true }> {
  return withTransaction(async () => {
    const current = await queryOne<{ status: WorkFrontStatus }>(
      `SELECT status FROM work_fronts WHERE id = ? FOR UPDATE`,
      id,
    );
    if (!current) return { error: "Không tìm thấy mặt bằng" };
    if (!allowBackward && !isForwardTransition(current.status, input.status))
      return { error: "Không thể chuyển ngược trạng thái (chỉ Admin)" };

    await run(
      `UPDATE work_fronts
          SET status = ?, handed_over_at = ?, returned_at = ?, blocker = ?, note = ?,
              updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      input.status,
      input.handedOverAt,
      input.returnedAt,
      input.blocker,
      input.note,
      userId,
      id,
    );
    if (input.status !== current.status) {
      await run(
        `INSERT INTO work_front_history (work_front_id, old_status, new_status, changed_by)
         VALUES (?, ?, ?, ?)`,
        id,
        current.status,
        input.status,
        userId,
      );
    }
    return { ok: true };
  });
}

// Task thuộc tầng còn 'pending' → gắn cờ chờ mặt bằng cho lookahead/EOT.
export async function pendingFrontKeys(): Promise<Set<string>> {
  const rows = await query<{ sheetTypeId: number; floorLabel: string }>(
    `SELECT sheet_type_id AS "sheetTypeId", floor_label AS "floorLabel"
       FROM work_fronts WHERE status = 'pending'`,
  );
  return new Set(rows.map((r) => `${r.sheetTypeId}:${r.floorLabel}`));
}

export type FrontMissingItem = {
  workFrontId: number;
  sheetCode: string;
  floorLabel: string;
  earliestStart: string;
  waitingDays: number;
};

// Tầng 'pending' có ít nhất 1 task với start_date ≤3 ngày tới (hoặc đã quá) —
// nguồn notification front_missing + số ngày chờ luỹ kế cho báo cáo EOT.
// projectId (M22): work_fronts không có cột project_id riêng — suy qua
// sheet_types → towers.project_id; undefined = không lọc. towers.project_id nullable
// nên dùng LEFT JOIN (không đổi hành vi nhánh không lọc khi tower_id NULL).
export async function frontMissingList(projectId?: number): Promise<FrontMissingItem[]> {
  const soon = daysFromTodayISO(3);
  const today = todayISO();
  // COALESCE(t.start_date, wp.start_date): task.start_date NULL = kế thừa ngày BĐ nhóm
  // (lib/recompute.ts) — bỏ qua sẽ khiến task kế thừa không bao giờ tính vào mặt bằng chờ.
  const conds = [
    "wf.status = 'pending'",
    "COALESCE(t.start_date, wp.start_date) IS NOT NULL",
    "COALESCE(t.start_date, wp.start_date) <= ?",
    "t.status NOT IN ('hoan_thanh','nghiem_thu')",
  ];
  const args: unknown[] = [soon];
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    workFrontId: number;
    sheetCode: string;
    floorLabel: string;
    earliestStart: string;
  }>(
    `SELECT wf.id AS "workFrontId", st.code AS "sheetCode", wf.floor_label AS "floorLabel",
            MIN(COALESCE(t.start_date, wp.start_date)) AS "earliestStart"
       FROM work_fronts wf
       JOIN sheet_types st ON st.id = wf.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
       JOIN work_packages wp ON wp.sheet_type_id = wf.sheet_type_id AND wp.floor_label = wf.floor_label
       JOIN tasks t ON t.package_id = wp.id
      WHERE ${conds.join(" AND ")}
      GROUP BY wf.id, st.code, wf.floor_label`,
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
