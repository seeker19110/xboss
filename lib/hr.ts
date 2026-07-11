// M24 — Nhân sự & Tổ chức: nhân sự công trường (personnel, khác user hệ thống), tổ đội
// (crews) — nối `diary_manpower` (M05) qua `crew_id` — chấm công (attendance) + đào tạo
// & chứng chỉ (certifications, cảnh báo hết hạn) + ma trận RACI. Xem
// docs/nang-cap/M24-nhan-su-to-chuc.md.
import { query, queryOne } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const PERSONNEL_STATUSES = ["active", "inactive"] as const;
export type PersonnelStatus = (typeof PERSONNEL_STATUSES)[number];
export const PERSONNEL_STATUS_LABEL: Record<PersonnelStatus, string> = {
  active: "Đang làm việc",
  inactive: "Ngừng làm việc",
};

// Ngưỡng cảnh báo chứng chỉ sắp hết hạn (ngày).
export const CERT_EXPIRY_WARN_DAYS = 30;

export type PersonnelRow = {
  id: number;
  projectId: number | null;
  code: string | null;
  fullName: string;
  roleTitle: string | null;
  supplierId: number | null;
  supplierName: string | null;
  phone: string | null;
  idNumber: string | null; // ẩn ở tầng route khi người gọi không phải admin/pm
  status: PersonnelStatus;
  crewNames: string | null; // gộp tên tổ đội (nếu có) — hiển thị nhanh ở danh sách
  createdBy: number | null;
  createdAt: string;
};

// Danh sách nhân sự — projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listPersonnel(
  projectId?: number,
  filters?: { crewId?: number; supplierId?: number; status?: PersonnelStatus },
): Promise<PersonnelRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("p.project_id = ?");
    args.push(projectId);
  }
  if (filters?.supplierId != null) {
    conds.push("p.supplier_id = ?");
    args.push(filters.supplierId);
  }
  if (filters?.status) {
    conds.push("p.status = ?");
    args.push(filters.status);
  }
  if (filters?.crewId != null) {
    conds.push(
      "EXISTS (SELECT 1 FROM crew_members cm WHERE cm.personnel_id = p.id AND cm.crew_id = ?)",
    );
    args.push(filters.crewId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<PersonnelRow>(
    `SELECT p.id, p.project_id AS "projectId", p.code, p.full_name AS "fullName",
            p.role_title AS "roleTitle", p.supplier_id AS "supplierId", s.name AS "supplierName",
            p.phone, p.id_number AS "idNumber", p.status,
            (SELECT string_agg(c.name, ', ' ORDER BY c.name)
               FROM crew_members cm JOIN crews c ON c.id = cm.crew_id
              WHERE cm.personnel_id = p.id) AS "crewNames",
            p.created_by AS "createdBy", p.created_at AS "createdAt"
       FROM personnel p LEFT JOIN suppliers s ON s.id = p.supplier_id
      ${where}
      ORDER BY p.full_name`,
    ...args,
  );
}

export type CrewRow = {
  id: number;
  projectId: number | null;
  name: string;
  systemId: number | null;
  systemName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  leaderId: number | null;
  leaderName: string | null;
  memberCount: number;
};

// Danh sách tổ đội — projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listCrews(projectId?: number): Promise<CrewRow[]> {
  const where = projectId != null ? "WHERE c.project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<CrewRow>(
    `SELECT c.id, c.project_id AS "projectId", c.name,
            c.system_id AS "systemId", d.name AS "systemName",
            c.supplier_id AS "supplierId", s.name AS "supplierName",
            c.leader_id AS "leaderId", l.full_name AS "leaderName",
            (SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id = c.id) AS "memberCount"
       FROM crews c
       LEFT JOIN systems d ON d.id = c.system_id
       LEFT JOIN suppliers s ON s.id = c.supplier_id
       LEFT JOIN personnel l ON l.id = c.leader_id
      ${where}
      ORDER BY c.name`,
    ...args,
  );
}

export type PersonnelInput = {
  code: string | null;
  fullName: string;
  roleTitle: string | null;
  supplierId: number | null;
  phone: string | null;
  idNumber: string | null;
  status: PersonnelStatus;
};

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
export function validatePersonnelInput(input: PersonnelInput): string | null {
  if (!input.fullName.trim()) return "Thiếu họ tên";
  if (!PERSONNEL_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.supplierId != null && !Number.isInteger(input.supplierId))
    return "Nhà thầu phụ không hợp lệ";
  return null;
}

// Đọc body JSON thành PersonnelInput (POST dùng nguyên, PATCH merge với bản ghi cũ).
export function parsePersonnelBody(body: Record<string, unknown>): PersonnelInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: strOrNull(body.code),
    fullName: str(body.fullName),
    roleTitle: strOrNull(body.roleTitle),
    supplierId: body.supplierId != null && body.supplierId !== "" ? Number(body.supplierId) : null,
    phone: strOrNull(body.phone),
    idNumber: strOrNull(body.idNumber),
    status: (str(body.status) || "active") as PersonnelStatus,
  };
}

export type CrewInput = {
  name: string;
  systemId: number | null;
  supplierId: number | null;
  leaderId: number | null;
};

export function validateCrewInput(input: CrewInput): string | null {
  if (!input.name.trim()) return "Thiếu tên tổ đội";
  if (input.systemId != null && !Number.isInteger(input.systemId))
    return "Hệ thi công không hợp lệ";
  if (input.supplierId != null && !Number.isInteger(input.supplierId))
    return "Nhà thầu phụ không hợp lệ";
  if (input.leaderId != null && !Number.isInteger(input.leaderId)) return "Đội trưởng không hợp lệ";
  return null;
}

export function parseCrewBody(body: Record<string, unknown>): CrewInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const numOrNull = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
  return {
    name: str(body.name),
    systemId: numOrNull(body.systemId),
    supplierId: numOrNull(body.supplierId),
    leaderId: numOrNull(body.leaderId),
  };
}

// ===== Chấm công =====

export type AttendanceInput = {
  workDate: string;
  crewId: number | null;
  personnelId: number | null; // NULL = chấm gộp theo tổ (headcount)
  headcount: number | null;
  present: boolean | null;
  hours: number | null;
  note: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validate thuần — phải có crew hoặc personnel; chấm gộp (personnelId null) bắt buộc
// headcount > 0; chấm theo người thì headcount không dùng.
export function validateAttendanceInput(input: AttendanceInput): string | null {
  if (!DATE_RE.test(input.workDate)) return "Ngày chấm công không đúng định dạng YYYY-MM-DD";
  if (input.crewId == null && input.personnelId == null)
    return "Phải chọn tổ đội hoặc nhân sự để chấm công";
  if (input.personnelId == null) {
    if (input.headcount == null || input.headcount <= 0)
      return "Chấm công theo tổ (gộp) phải nhập số người > 0";
  } else if (input.headcount != null) {
    return "Chấm công theo người không dùng số người gộp (headcount)";
  }
  if (input.hours != null && (input.hours < 0 || input.hours > 24))
    return "Số giờ công không hợp lệ (0–24)";
  return null;
}

export function parseAttendanceBody(body: Record<string, unknown>): AttendanceInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const numOrNull = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
  return {
    workDate: str(body.workDate) || todayISO(),
    crewId: numOrNull(body.crewId),
    personnelId: numOrNull(body.personnelId),
    headcount: numOrNull(body.headcount),
    present:
      typeof body.present === "boolean"
        ? body.present
        : body.present == null
          ? null
          : !!body.present,
    hours: numOrNull(body.hours),
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
  };
}

export type AttendanceRow = AttendanceInput & {
  id: number;
  projectId: number | null;
  crewName: string | null;
  personnelName: string | null;
  recordedBy: number | null;
  createdAt: string;
};

export async function listAttendance(
  projectId?: number,
  filters?: { from?: string; to?: string; crewId?: number },
): Promise<AttendanceRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("a.project_id = ?");
    args.push(projectId);
  }
  if (filters?.from) {
    conds.push("a.work_date >= ?");
    args.push(filters.from);
  }
  if (filters?.to) {
    conds.push("a.work_date <= ?");
    args.push(filters.to);
  }
  if (filters?.crewId != null) {
    conds.push("a.crew_id = ?");
    args.push(filters.crewId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<AttendanceRow>(
    `SELECT a.id, a.project_id AS "projectId", a.work_date AS "workDate",
            a.crew_id AS "crewId", c.name AS "crewName",
            a.personnel_id AS "personnelId", p.full_name AS "personnelName",
            a.headcount, a.present, a.hours, a.note,
            a.recorded_by AS "recordedBy", a.created_at AS "createdAt"
       FROM attendance a
       LEFT JOIN crews c ON c.id = a.crew_id
       LEFT JOIN personnel p ON p.id = a.personnel_id
      ${where}
      ORDER BY a.work_date DESC, a.id DESC`,
    ...args,
  );
}

export type AttendanceByDate = {
  workDate: string;
  crewId: number | null;
  crewName: string | null;
  totalHeadcount: number; // gộp headcount trực tiếp + số người chấm theo cá nhân (present=true)
};

// Gộp headcount theo ngày × tổ — dùng cho biểu đồ cột tổng công theo tháng. Chấm gộp
// (personnel_id NULL) cộng thẳng headcount; chấm theo người (present=true) cộng 1/người.
export async function attendanceByDate(
  projectId: number | undefined,
  from: string,
  to: string,
): Promise<AttendanceByDate[]> {
  const conds = ["a.work_date >= ?", "a.work_date <= ?"];
  const args: unknown[] = [from, to];
  if (projectId != null) {
    conds.push("a.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    workDate: string;
    crewId: number | null;
    crewName: string | null;
    headcount: number | null;
    personnelId: number | null;
    present: boolean | null;
  }>(
    `SELECT a.work_date AS "workDate", a.crew_id AS "crewId", c.name AS "crewName",
            a.headcount, a.personnel_id AS "personnelId", a.present
       FROM attendance a LEFT JOIN crews c ON c.id = a.crew_id
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );

  const byKey = new Map<string, AttendanceByDate>();
  for (const r of rows) {
    const key = `${r.workDate}|${r.crewId ?? "null"}`;
    const add = r.personnelId == null ? (r.headcount ?? 0) : r.present !== false ? 1 : 0;
    const existing = byKey.get(key);
    if (existing) existing.totalHeadcount += add;
    else
      byKey.set(key, {
        workDate: r.workDate,
        crewId: r.crewId,
        crewName: r.crewName,
        totalHeadcount: add,
      });
  }
  return Array.from(byKey.values()).sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) || (a.crewName ?? "").localeCompare(b.crewName ?? ""),
  );
}

export type AttendanceSummaryRow = {
  personnelId: number;
  personnelName: string;
  daysPresent: number;
  totalHours: number;
};

// Công/người/tháng (chỉ tính chấm công theo người, personnel_id NOT NULL).
export async function attendanceSummary(
  projectId: number | undefined,
  from: string,
  to: string,
): Promise<AttendanceSummaryRow[]> {
  const conds = ["a.work_date >= ?", "a.work_date <= ?", "a.personnel_id IS NOT NULL"];
  const args: unknown[] = [from, to];
  if (projectId != null) {
    conds.push("a.project_id = ?");
    args.push(projectId);
  }
  return query<AttendanceSummaryRow>(
    `SELECT a.personnel_id AS "personnelId", p.full_name AS "personnelName",
            COUNT(*) FILTER (WHERE a.present IS DISTINCT FROM false) AS "daysPresent",
            COALESCE(SUM(a.hours), 0) AS "totalHours"
       FROM attendance a JOIN personnel p ON p.id = a.personnel_id
      WHERE ${conds.join(" AND ")}
      GROUP BY a.personnel_id, p.full_name
      ORDER BY p.full_name`,
    ...args,
  );
}

// ===== Chứng chỉ =====

export type ExpiringCertification = {
  id: number;
  personnelId: number | null;
  personnelName: string | null;
  kind: string;
  code: string | null;
  expiryDate: string;
  expired: boolean; // true = đã quá hạn
};

// Chứng chỉ có expiry_date trong vòng `days` ngày tới (gồm cả đã quá hạn) — so sánh
// chuỗi ngày (quy ước lớp DB: DATE giữ nguyên string). projectId undefined = không lọc.
export async function expiringCertifications(
  projectId?: number,
  days = CERT_EXPIRY_WARN_DAYS,
): Promise<ExpiringCertification[]> {
  const limit = daysFromTodayISO(days);
  const today = todayISO();
  const conds = ["c.expiry_date IS NOT NULL", "c.expiry_date <= ?"];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    id: number;
    personnelId: number | null;
    personnelName: string | null;
    kind: string;
    code: string | null;
    expiryDate: string;
  }>(
    `SELECT c.id, c.personnel_id AS "personnelId", p.full_name AS "personnelName",
            c.kind, c.code, c.expiry_date AS "expiryDate"
       FROM certifications c LEFT JOIN personnel p ON p.id = c.personnel_id
      WHERE ${conds.join(" AND ")}
      ORDER BY c.expiry_date`,
    ...args,
  );
  return rows.map((r) => ({ ...r, expired: r.expiryDate < today }));
}

export type CertificationInput = {
  personnelId: number | null;
  kind: string;
  code: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
};

export function validateCertificationInput(input: CertificationInput): string | null {
  if (!input.kind.trim()) return "Thiếu loại chứng chỉ";
  if (input.personnelId != null && !Number.isInteger(input.personnelId))
    return "Nhân sự không hợp lệ";
  for (const [label, d] of [
    ["Ngày cấp", input.issuedDate],
    ["Ngày hết hạn", input.expiryDate],
  ] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  if (input.issuedDate && input.expiryDate && input.issuedDate > input.expiryDate)
    return "Ngày cấp phải trước hoặc bằng ngày hết hạn";
  return null;
}

export function parseCertificationBody(body: Record<string, unknown>): CertificationInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
  return {
    personnelId: numOrNull(body.personnelId),
    kind: str(body.kind),
    code: strOrNull(body.code),
    issuedDate: strOrNull(body.issuedDate),
    expiryDate: strOrNull(body.expiryDate),
  };
}

// Ẩn CCCD (id_number) khỏi payload khi người gọi không phải admin/pm (nhạy cảm).
export function maskIdNumber<T extends { idNumber?: string | null }>(
  rows: T[],
  canSeeIdNumber: boolean,
): T[] {
  if (canSeeIdNumber) return rows;
  return rows.map((r) => ({ ...r, idNumber: null }));
}

export async function findPersonnelById(
  id: number,
  projectId: number | null,
): Promise<PersonnelRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<PersonnelRow>(
    `SELECT p.id, p.project_id AS "projectId", p.code, p.full_name AS "fullName",
            p.role_title AS "roleTitle", p.supplier_id AS "supplierId", s.name AS "supplierName",
            p.phone, p.id_number AS "idNumber", p.status,
            (SELECT string_agg(c.name, ', ' ORDER BY c.name)
               FROM crew_members cm JOIN crews c ON c.id = cm.crew_id
              WHERE cm.personnel_id = p.id) AS "crewNames",
            p.created_by AS "createdBy", p.created_at AS "createdAt"
       FROM personnel p LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.id = ? AND p.project_id = ?`,
    id,
    projectId,
  );
}
