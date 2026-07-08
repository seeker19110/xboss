// M12 — Sổ thiết bị/máy thi công: tình trạng, vị trí/tổ đội đang giữ, hạn kiểm định.
// Ghi log (cấp phát/thu hồi/chuyển/bảo trì/hiệu chuẩn) cập nhật trạng thái hiện hành
// trong cùng transaction (giống material_transactions cập nhật qty_used).
// Xem docs/nang-cap/M12-thiet-bi.md.
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const EQUIPMENT_CONDITIONS = ["good", "maintenance", "broken", "retired"] as const;
export type EquipmentCondition = (typeof EQUIPMENT_CONDITIONS)[number];
export const EQUIPMENT_CONDITION_LABEL: Record<EquipmentCondition, string> = {
  good: "Tốt",
  maintenance: "Đang bảo trì",
  broken: "Hỏng",
  retired: "Ngừng sử dụng",
};

export const EQUIPMENT_LOG_ACTIONS = ["issue", "return", "move", "maintain", "calibrate"] as const;
export type EquipmentLogAction = (typeof EQUIPMENT_LOG_ACTIONS)[number];
export const EQUIPMENT_LOG_ACTION_LABEL: Record<EquipmentLogAction, string> = {
  issue: "Cấp phát",
  return: "Thu hồi",
  move: "Chuyển vị trí",
  maintain: "Bảo trì",
  calibrate: "Hiệu chuẩn",
};

export const CALIBRATION_WARN_DAYS = 30;

export type EquipmentInput = {
  code: string;
  name: string;
  kind: string;
  serial: string | null;
  condition: EquipmentCondition;
  calibrationDue: string | null;
  currentLocation: string | null;
  currentCrew: string | null;
  note: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateEquipmentInput(input: EquipmentInput): string | null {
  if (!input.code.trim()) return "Thiếu mã thiết bị";
  if (!input.name.trim()) return "Thiếu tên thiết bị";
  if (!input.kind.trim()) return "Thiếu loại thiết bị";
  if (!EQUIPMENT_CONDITIONS.includes(input.condition)) return "Tình trạng không hợp lệ";
  if (input.calibrationDue != null && !DATE_RE.test(input.calibrationDue))
    return "Hạn kiểm định không đúng định dạng YYYY-MM-DD";
  return null;
}

export function parseEquipmentBody(body: Record<string, unknown>): EquipmentInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: str(body.code),
    name: str(body.name),
    kind: str(body.kind),
    serial: strOrNull(body.serial),
    condition: (str(body.condition) || "good") as EquipmentCondition,
    calibrationDue: strOrNull(body.calibrationDue),
    currentLocation: strOrNull(body.currentLocation),
    currentCrew: strOrNull(body.currentCrew),
    note: strOrNull(body.note),
  };
}

export type EquipmentRow = EquipmentInput & {
  id: number;
  certFileName: string | null;
  certMime: string | null;
  createdAt: string;
};

// projectId (M22): undefined = không lọc dự án (dùng nội bộ/cron chưa gắn ngữ cảnh dự án).
export async function listEquipment(filters: {
  kind?: string;
  condition?: EquipmentCondition;
  crew?: string;
  q?: string;
  projectId?: number;
}): Promise<EquipmentRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.kind) {
    clauses.push("kind = ?");
    params.push(filters.kind);
  }
  if (filters.condition) {
    clauses.push("condition = ?");
    params.push(filters.condition);
  }
  if (filters.crew) {
    clauses.push("current_crew = ?");
    params.push(filters.crew);
  }
  if (filters.q) {
    clauses.push("(code ILIKE ? OR name ILIKE ? OR serial ILIKE ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  if (filters.projectId != null) {
    clauses.push("project_id = ?");
    params.push(filters.projectId);
  }
  return query<EquipmentRow>(
    `SELECT id, code, name, kind, serial, condition,
            calibration_due AS "calibrationDue", cert_file_name AS "certFileName",
            cert_mime AS "certMime", current_location AS "currentLocation",
            current_crew AS "currentCrew", note, created_at AS "createdAt"
       FROM equipment
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY code`,
    ...params,
  );
}

// projectId khi truyền → trả null nếu thiết bị không thuộc dự án đang chọn (chặn truy
// cập chéo dự án qua đoán ID).
export async function getEquipment(id: number, projectId?: number): Promise<EquipmentRow | null> {
  const conds = ["id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<EquipmentRow>(
    `SELECT id, code, name, kind, serial, condition,
            calibration_due AS "calibrationDue", cert_file_name AS "certFileName",
            cert_mime AS "certMime", current_location AS "currentLocation",
            current_crew AS "currentCrew", note, created_at AS "createdAt"
       FROM equipment WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? null;
}

export type EquipmentLogInput = {
  action: EquipmentLogAction;
  toLocation: string | null;
  toCrew: string | null;
  note: string | null;
};

export function parseEquipmentLogBody(body: Record<string, unknown>): EquipmentLogInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    action: (typeof body.action === "string" ? body.action : "") as EquipmentLogAction,
    toLocation: strOrNull(body.toLocation),
    toCrew: strOrNull(body.toCrew),
    note: strOrNull(body.note),
  };
}

export function validateEquipmentLogInput(input: EquipmentLogInput): string | null {
  if (!EQUIPMENT_LOG_ACTIONS.includes(input.action)) return "Hành động không hợp lệ";
  if ((input.action === "issue" || input.action === "move") && !input.toCrew && !input.toLocation)
    return "Cần chọn vị trí hoặc tổ đội nhận";
  return null;
}

// Ghi log + cập nhật trạng thái hiện hành trong 1 transaction.
export async function addEquipmentLog(
  equipmentId: number,
  input: EquipmentLogInput,
  userId: number,
): Promise<{ error: string } | { ok: true }> {
  return withTransaction(async () => {
    const eq = await queryOne<{ id: number }>(
      `SELECT id FROM equipment WHERE id = ? FOR UPDATE`,
      equipmentId,
    );
    if (!eq) return { error: "Không tìm thấy thiết bị" };

    await run(
      `INSERT INTO equipment_logs (equipment_id, action, to_location, to_crew, note, logged_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      equipmentId,
      input.action,
      input.toLocation,
      input.toCrew,
      input.note,
      userId,
    );

    if (input.action === "issue" || input.action === "move") {
      await run(
        `UPDATE equipment SET current_location = COALESCE(?, current_location),
                current_crew = ? WHERE id = ?`,
        input.toLocation,
        input.toCrew,
        equipmentId,
      );
    } else if (input.action === "return") {
      await run(`UPDATE equipment SET current_crew = NULL WHERE id = ?`, equipmentId);
    } else if (input.action === "maintain") {
      await run(`UPDATE equipment SET condition = 'maintenance' WHERE id = ?`, equipmentId);
    } else if (input.action === "calibrate") {
      await run(
        `UPDATE equipment SET condition = 'good' WHERE id = ? AND condition = 'maintenance'`,
        equipmentId,
      );
    }
    return { ok: true };
  });
}

export type EquipmentLogRow = {
  id: number;
  action: EquipmentLogAction;
  toLocation: string | null;
  toCrew: string | null;
  note: string | null;
  loggedBy: number | null;
  loggerName: string | null;
  createdAt: string;
};

export async function listEquipmentLogs(equipmentId: number): Promise<EquipmentLogRow[]> {
  return query<EquipmentLogRow>(
    `SELECT l.id, l.action, l.to_location AS "toLocation", l.to_crew AS "toCrew", l.note,
            l.logged_by AS "loggedBy", u.name AS "loggerName", l.created_at AS "createdAt"
       FROM equipment_logs l LEFT JOIN users u ON u.id = l.logged_by
      WHERE l.equipment_id = ? ORDER BY l.id DESC`,
    equipmentId,
  );
}

export type CalibrationDueItem = {
  id: number;
  code: string;
  name: string;
  calibrationDue: string;
  expired: boolean;
};

// projectId (M22): undefined = không lọc.
export async function calibrationDueList(
  days = CALIBRATION_WARN_DAYS,
  projectId?: number,
): Promise<CalibrationDueItem[]> {
  const limit = daysFromTodayISO(days);
  const conds = ["calibration_due IS NOT NULL", "calibration_due <= ?", "condition <> 'retired'"];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ id: number; code: string; name: string; calibrationDue: string }>(
    `SELECT id, code, name, calibration_due AS "calibrationDue"
       FROM equipment
      WHERE ${conds.join(" AND ")}
      ORDER BY calibration_due`,
    ...args,
  );
  const today = todayISO();
  return rows.map((r) => ({ ...r, expired: r.calibrationDue < today }));
}
