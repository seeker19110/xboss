// M26 — Quan hệ & Quan trắc: mốc quan trắc kết cấu/nền (lún, chuyển vị/nghiêng, công
// trình lân cận) + kỳ đo (giá trị, luỹ kế nhập tay, ngưỡng cảnh báo warn/alarm tính lúc
// ghi) + khiếu nại/quan hệ cộng đồng (tiếp nhận → xử lý → đóng).
// Xem docs/nang-cap/M26-quan-he-quan-trac.md.
import { query, queryOne } from "@/lib/db";

export const MONITORING_KINDS = ["lun", "chuyen_vi", "nghieng", "lan_can", "khac"] as const;
export type MonitoringKind = (typeof MONITORING_KINDS)[number];
export const MONITORING_KIND_LABEL: Record<MonitoringKind, string> = {
  lun: "Lún",
  chuyen_vi: "Chuyển vị",
  nghieng: "Nghiêng",
  lan_can: "Công trình lân cận",
  khac: "Khác",
};

export const MONITORING_POINT_STATUSES = ["active", "stopped"] as const;
export type MonitoringPointStatus = (typeof MONITORING_POINT_STATUSES)[number];
export const MONITORING_POINT_STATUS_LABEL: Record<MonitoringPointStatus, string> = {
  active: "Đang quan trắc",
  stopped: "Đã dừng",
};

export const READING_LEVELS = ["normal", "warn", "alarm"] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];
export const READING_LEVEL_LABEL: Record<ReadingLevel, string> = {
  normal: "Bình thường",
  warn: "Cảnh báo",
  alarm: "Báo động",
};

export const COMMUNITY_CASE_STATUSES = ["open", "handling", "closed"] as const;
export type CommunityCaseStatus = (typeof COMMUNITY_CASE_STATUSES)[number];
export const COMMUNITY_CASE_STATUS_LABEL: Record<CommunityCaseStatus, string> = {
  open: "Mới tiếp nhận",
  handling: "Đang xử lý",
  closed: "Đã đóng",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ===== Mốc quan trắc =====

export type MonitoringPointRow = {
  id: number;
  projectId: number | null;
  code: string;
  kind: MonitoringKind;
  location: string | null;
  warnThreshold: number | null;
  alarmThreshold: number | null;
  unit: string | null;
  status: MonitoringPointStatus;
};

// projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listPoints(projectId?: number): Promise<MonitoringPointRow[]> {
  const where = projectId != null ? "WHERE project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<MonitoringPointRow>(
    `SELECT id, project_id AS "projectId", code, kind, location,
            warn_threshold AS "warnThreshold", alarm_threshold AS "alarmThreshold",
            unit, status
       FROM monitoring_points
      ${where}
      ORDER BY code`,
    ...args,
  );
}

export async function getPoint(id: number, projectId?: number): Promise<MonitoringPointRow | null> {
  const conds = ["id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<MonitoringPointRow>(
    `SELECT id, project_id AS "projectId", code, kind, location,
            warn_threshold AS "warnThreshold", alarm_threshold AS "alarmThreshold",
            unit, status
       FROM monitoring_points WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? null;
}

export type MonitoringPointInput = {
  code: string;
  kind: MonitoringKind;
  location: string | null;
  warnThreshold: number | null;
  alarmThreshold: number | null;
  unit: string | null;
  status: MonitoringPointStatus;
};

export function parsePointBody(body: Record<string, unknown>): MonitoringPointInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    code: str(body.code),
    kind: str(body.kind) as MonitoringKind,
    location: strOrNull(body.location),
    warnThreshold: numOrNull(body.warnThreshold),
    alarmThreshold: numOrNull(body.alarmThreshold),
    unit: strOrNull(body.unit),
    status: (str(body.status) || "active") as MonitoringPointStatus,
  };
}

export function validatePointInput(input: MonitoringPointInput): string | null {
  if (!input.code.trim()) return "Thiếu mã mốc quan trắc";
  if (!MONITORING_KINDS.includes(input.kind)) return "Loại quan trắc không hợp lệ";
  if (!MONITORING_POINT_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (
    input.warnThreshold != null &&
    input.alarmThreshold != null &&
    input.warnThreshold > input.alarmThreshold
  )
    return "Ngưỡng cảnh báo phải nhỏ hơn hoặc bằng ngưỡng báo động";
  return null;
}

// ===== Kỳ đo (readings) =====

export type MonitoringReadingRow = {
  id: number;
  pointId: number;
  measuredAt: string;
  value: number;
  cumulative: number | null;
  level: ReadingLevel | null;
  note: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

// Chuỗi kỳ đo theo thời gian cho biểu đồ + đường ngưỡng — sắp tăng dần theo measured_at
// (đúng thứ tự thời gian, không phải id).
export async function readingsSeries(pointId: number): Promise<MonitoringReadingRow[]> {
  return query<MonitoringReadingRow>(
    `SELECT r.id, r.point_id AS "pointId", r.measured_at AS "measuredAt", r.value,
            r.cumulative, r.level, r.note,
            r.recorded_by AS "recordedBy", u.name AS "recordedByName", r.created_at AS "createdAt"
       FROM monitoring_readings r LEFT JOIN users u ON u.id = r.recorded_by
      WHERE r.point_id = ?
      ORDER BY r.measured_at ASC, r.id ASC`,
    pointId,
  );
}

export type MonitoringReadingInput = {
  measuredAt: string;
  value: number;
  cumulative: number | null;
  note: string | null;
};

export function parseReadingBody(body: Record<string, unknown>): MonitoringReadingInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    measuredAt: str(body.measuredAt),
    value: Number(body.value),
    cumulative: numOrNull(body.cumulative),
    note: strOrNull(body.note),
  };
}

// Validate thuần (không chạm DB).
export function validateReadingInput(input: MonitoringReadingInput): string | null {
  if (!DATE_RE.test(input.measuredAt)) return "Ngày đo không đúng định dạng YYYY-MM-DD";
  if (!Number.isFinite(input.value)) return "Giá trị đo không hợp lệ";
  if (input.cumulative != null && !Number.isFinite(input.cumulative))
    return "Giá trị luỹ kế không hợp lệ";
  return null;
}

// Tính mức cảnh báo lúc ghi kỳ đo (thuần, snapshot — không phải cột generated).
// Ưu tiên so ngưỡng với `cumulative` (luỹ kế lún thực tế) khi có giá trị; else so `value`.
// Biên bằng đúng ngưỡng tính là ĐẠT ngưỡng đó (>=, không phải >).
export function computeLevel(
  value: number,
  cumulative: number | null,
  point: { warnThreshold: number | null; alarmThreshold: number | null },
): ReadingLevel {
  const compareVal = cumulative != null ? cumulative : value;
  if (point.alarmThreshold != null && compareVal >= point.alarmThreshold) return "alarm";
  if (point.warnThreshold != null && compareVal >= point.warnThreshold) return "warn";
  return "normal";
}

// Mốc có kỳ đo GẦN NHẤT (theo measured_at) đang ở mức 'alarm' → nguồn cho notification
// monitoring_alarm (dedup theo monitoring_point_id). projectId undefined = không lọc.
export type AlarmingPoint = {
  id: number;
  code: string;
  kind: MonitoringKind;
  measuredAt: string;
  value: number;
  cumulative: number | null;
};

export async function alarmingPoints(projectId?: number): Promise<AlarmingPoint[]> {
  const conds = ["p.status = 'active'"];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("p.project_id = ?");
    args.push(projectId);
  }
  return query<AlarmingPoint>(
    `SELECT p.id, p.code, p.kind, latest."measuredAt", latest.value, latest.cumulative
       FROM monitoring_points p
       JOIN LATERAL (
         SELECT r.measured_at AS "measuredAt", r.value, r.cumulative, r.level
           FROM monitoring_readings r
          WHERE r.point_id = p.id
          ORDER BY r.measured_at DESC, r.id DESC
          LIMIT 1
       ) latest ON true
      WHERE ${conds.join(" AND ")} AND latest.level = 'alarm'
      ORDER BY p.code`,
    ...args,
  );
}

// ===== Khiếu nại/quan hệ cộng đồng =====

export type CommunityCaseRow = {
  id: number;
  projectId: number | null;
  code: string | null;
  title: string;
  source: string | null;
  receivedDate: string | null;
  status: CommunityCaseStatus;
  resolution: string | null;
  closedDate: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listCommunityCases(
  projectId?: number,
  filters?: { status?: CommunityCaseStatus },
): Promise<CommunityCaseRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  if (filters?.status) {
    conds.push("c.status = ?");
    args.push(filters.status);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<CommunityCaseRow>(
    `SELECT c.id, c.project_id AS "projectId", c.code, c.title, c.source,
            c.received_date AS "receivedDate", c.status, c.resolution,
            c.closed_date AS "closedDate",
            c.created_by AS "createdBy", u.name AS "createdByName", c.created_at AS "createdAt"
       FROM community_cases c LEFT JOIN users u ON u.id = c.created_by
      ${where}
      ORDER BY c.status = 'closed', c.id DESC`,
    ...args,
  );
}

export async function getCommunityCase(
  id: number,
  projectId?: number,
): Promise<CommunityCaseRow | null> {
  const conds = ["id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<CommunityCaseRow>(
    `SELECT id, project_id AS "projectId", code, title, source, received_date AS "receivedDate",
            status, resolution, closed_date AS "closedDate",
            created_by AS "createdBy", created_at AS "createdAt"
       FROM community_cases WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? null;
}

export type CommunityCaseInput = {
  code: string | null;
  title: string;
  source: string | null;
  receivedDate: string | null;
  status: CommunityCaseStatus;
  resolution: string | null;
  closedDate: string | null;
};

export function parseCommunityCaseBody(body: Record<string, unknown>): CommunityCaseInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: strOrNull(body.code),
    title: str(body.title),
    source: strOrNull(body.source),
    receivedDate: strOrNull(body.receivedDate),
    status: (str(body.status) || "open") as CommunityCaseStatus,
    resolution: strOrNull(body.resolution),
    closedDate: strOrNull(body.closedDate),
  };
}

export function validateCommunityCaseInput(input: CommunityCaseInput): string | null {
  if (!input.title.trim()) return "Thiếu tiêu đề khiếu nại";
  if (!COMMUNITY_CASE_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  for (const [label, d] of [
    ["Ngày tiếp nhận", input.receivedDate],
    ["Ngày đóng", input.closedDate],
  ] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  return null;
}
