// M59 PR1 — Lớp tổng hợp tài nguyên (chỉ đọc, KHÔNG migration): nhìn TẢI nhân lực theo
// thời gian (kế hoạch từ phân công vs thực tế từ chấm công), mật độ dùng thiết bị, và bắt
// xung đột phân bổ NGƯỜI (gán chồng quá nhiều task cùng lúc). Toàn bộ tính trên SQL
// (GROUP BY tuần qua date_trunc / self-join đếm chồng) — KHÔNG kéo bảng về JS lặp lồng.
//
// GHI CHÚ SCHEMA (đọc migrations xác nhận, 2026-07-18):
//  - migrations/0043 đã đổi tên `disciplines`→`systems`, `sheet_types.discipline_id`→
//    `system_id`, `crews.discipline_id`→`system_id`. Brief M59 viết theo tên cũ; ở đây
//    dùng tên THẬT trong DB: JOIN `systems`, cột `st.system_id` (rename cơ học 1:1, cùng
//    khái niệm "hệ").
//  - Scope dự án cho task suy qua `sheet_types → towers.project_id` (không có project_id
//    trực tiếp) — copy pattern JOIN của lib/dashboardext.ts / lib/assignments.ts.
//  - `attendance.project_id` có sẵn → lọc thẳng.
//  - `equipment`/`equipment_logs` KHÔNG có cột project_id (migrations/0021) → khối
//    equipmentUsageByWeek KHÔNG scope được theo dự án (xem ghi chú tại hàm).
//  - PR1 KHÔNG làm xung đột THIẾT BỊ: equipment_logs chỉ ghi điểm sự kiện (`action` tại 1
//    `created_at`), không có dải ngày phân bổ → không đủ dữ liệu tính "2 phân bổ giao nhau".
import { query, todayISO } from "@/lib/db";
import { addDaysISO } from "@/lib/date";

// COALESCE(t.start_date, wp.start_date) / COALESCE(t.end_date, wp.end_date): task NULL =
// kế thừa ngày nhóm (lib/recompute.ts). Điều kiện loại task đã xong dùng chung khắp file.
const EXCLUDE_DONE = `t.status NOT IN ('hoan_thanh','nghiem_thu')`;

export type WorkloadWeekRow = {
  week: string; // thứ Hai đầu tuần, 'YYYY-MM-DD'
  userId: number;
  userName: string;
  systemCode: string | null;
  systemColor: string | null;
  taskCount: number;
};

// Tải KẾ HOẠCH: mỗi tuần × mỗi user được gán — số task đang chạy giao nhau với tuần đó.
// Task giao tuần khi khoảng ngày hiệu lực chạm [thứ Hai, thứ Hai+6]. Loại task đã xong,
// chỉ tính task có assigned_to (task.assigned_to NULL = chưa gán tay, KHÔNG suy từ nhóm).
export async function workloadByWeek({
  projectId,
  from,
  to,
  subconUserId,
}: {
  projectId: number | null;
  from: string;
  to: string;
  subconUserId?: number;
}): Promise<WorkloadWeekRow[]> {
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const subconFilter = subconUserId != null ? " AND t.assigned_to = ?" : "";
  const rows = await query<WorkloadWeekRow>(
    `SELECT g.week::date AS week,
            t.assigned_to AS "userId", u.name AS "userName",
            s.code AS "systemCode", s.color AS "systemColor",
            COUNT(*) AS "taskCount"
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
       JOIN users u ON u.id = t.assigned_to
       LEFT JOIN systems s ON s.id = st.system_id
       JOIN generate_series(date_trunc('week', ?::date), date_trunc('week', ?::date), interval '1 week') AS g(week)
         ON COALESCE(t.start_date, wp.start_date) IS NOT NULL
        AND COALESCE(t.end_date, wp.end_date) IS NOT NULL
        AND COALESCE(t.start_date, wp.start_date) <= g.week + interval '6 days'
        AND COALESCE(t.end_date, wp.end_date) >= g.week
      WHERE t.assigned_to IS NOT NULL AND ${EXCLUDE_DONE}${projectFilter}${subconFilter}
      GROUP BY g.week, t.assigned_to, u.name, s.code, s.color
      ORDER BY g.week, t.assigned_to`,
    from,
    to,
    ...(projectId != null ? [projectId] : []),
    ...(subconUserId != null ? [subconUserId] : []),
  );
  return rows.map((r) => ({ ...r, userId: Number(r.userId), taskCount: Number(r.taskCount) }));
}

export type ManpowerWeekRow = {
  week: string;
  crewId: number | null;
  crewName: string | null;
  manpower: number;
};

// Tải THỰC TẾ: tổng nhân lực chấm công theo tuần × tổ. attendance có 2 KIỂU CHẤM không loại
// trừ nhau (thiết kế bảng, migrations/0031):
//  - personnel_id IS NULL   → chấm gộp theo tổ, dùng `headcount` (cộng headcount).
//  - personnel_id IS NOT NULL → chấm từng người, dùng `present` (đếm 1 người nếu present).
// Cộng riêng 2 tập rồi cộng lại để KHÔNG đếm đôi. NỢ KỸ THUẬT: không có ràng buộc UNIQUE
// chặn nhập CẢ 2 kiểu cho cùng crew/ngày; nếu dữ liệu thật trùng thì tổng cao hơn thực tế —
// không tự thêm ràng buộc DB (ngoài phạm vi "không migration"), ghi nợ trong PROGRESS.md.
export async function manpowerByWeek({
  projectId,
  from,
  to,
}: {
  projectId: number | null;
  from: string;
  to: string;
}): Promise<ManpowerWeekRow[]> {
  const projectFilter = projectId != null ? " AND a.project_id = ?" : "";
  const rows = await query<ManpowerWeekRow>(
    `SELECT date_trunc('week', a.work_date)::date AS week,
            a.crew_id AS "crewId", c.name AS "crewName",
            COALESCE(SUM(COALESCE(a.headcount, 0)) FILTER (WHERE a.personnel_id IS NULL), 0)
              + COUNT(*) FILTER (WHERE a.personnel_id IS NOT NULL AND a.present) AS "manpower"
       FROM attendance a
       LEFT JOIN crews c ON c.id = a.crew_id
      WHERE a.work_date >= ? AND a.work_date <= ?${projectFilter}
      GROUP BY date_trunc('week', a.work_date), a.crew_id, c.name
      ORDER BY week, a.crew_id`,
    from,
    to,
    ...(projectId != null ? [projectId] : []),
  );
  return rows.map((r) => ({
    ...r,
    crewId: r.crewId != null ? Number(r.crewId) : null,
    manpower: Number(r.manpower),
  }));
}

export type EquipmentUsageWeekRow = {
  week: string;
  action: string;
  eventCount: number;
};

// Mật độ dùng thiết bị: đếm SỐ SỰ KIỆN equipment_logs theo tuần × loại `action` (issue/
// return/move/maintain/calibrate) — KHÔNG phải dải ngày phân bổ (schema không có). KHÔNG
// scope theo dự án: bảng `equipment`/`equipment_logs` (migrations/0021) không có cột
// project_id nên không suy được dự án — cố JOIN sẽ sai; bỏ scope, ghi rõ lý do tại đây.
export async function equipmentUsageByWeek({
  from,
  to,
}: {
  projectId: number | null;
  from: string;
  to: string;
}): Promise<EquipmentUsageWeekRow[]> {
  const rows = await query<EquipmentUsageWeekRow>(
    `SELECT date_trunc('week', el.created_at)::date AS week,
            el.action, COUNT(*) AS "eventCount"
       FROM equipment_logs el
      WHERE el.created_at::date >= ?::date AND el.created_at::date <= ?::date
      GROUP BY date_trunc('week', el.created_at), el.action
      ORDER BY week, el.action`,
    from,
    to,
  );
  return rows.map((r) => ({ ...r, eventCount: Number(r.eventCount) }));
}

export type ConflictTaskRow = {
  id: number;
  code: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sheetSlug: string | null;
};
export type AssignmentConflict = {
  userId: number;
  userName: string;
  overlappingTaskCount: number;
  tasks: ConflictTaskRow[];
};

// Xung đột phân bổ NGƯỜI: với mỗi assigned_to, tìm số task đang hoạt động CÙNG LÚC lớn nhất
// (đỉnh chồng lịch). Kỹ thuật sweep bằng self-join trong SQL: với mỗi task đếm số task khác
// cùng người có khoảng ngày GIAO NHAU nó (kể cả chính nó); MAX trong nhóm người = đỉnh chồng.
// Chỉ giữ người có đỉnh ≥ minTasks. TUYỆT ĐỐI không kéo hết task về JS lặp lồng — mọi đếm ở
// SQL, JS chỉ gom dòng phẳng thành cây 1 lượt.
// subconUserId có giá trị → chỉ xét task của chính người đó (nhất quán canTouchTask).
export async function assignmentConflicts({
  projectId,
  minTasks = 5,
  subconUserId,
}: {
  projectId: number | null;
  minTasks?: number;
  subconUserId?: number;
}): Promise<AssignmentConflict[]> {
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const subconFilter = subconUserId != null ? " AND t.assigned_to = ?" : "";
  const params = [
    ...(projectId != null ? [projectId] : []),
    ...(subconUserId != null ? [subconUserId] : []),
    minTasks,
  ];
  const rows = await query<{
    userId: number;
    userName: string;
    overlappingTaskCount: number;
    id: number;
    code: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    sheetSlug: string | null;
  }>(
    `WITH active AS (
        SELECT t.id, t.code, t.name, t.assigned_to AS user_id,
               COALESCE(t.start_date, wp.start_date) AS sd,
               COALESCE(t.end_date, wp.end_date) AS ed,
               st.slug AS sheet_slug
          FROM tasks t
          JOIN work_packages wp ON wp.id = t.package_id
          JOIN sheet_types st ON st.id = wp.sheet_type_id
          JOIN towers tw ON tw.id = st.tower_id
         WHERE t.assigned_to IS NOT NULL AND ${EXCLUDE_DONE}
           AND COALESCE(t.start_date, wp.start_date) IS NOT NULL
           AND COALESCE(t.end_date, wp.end_date) IS NOT NULL${projectFilter}${subconFilter}
      ),
      overlap AS (
        SELECT a.id, a.user_id, COUNT(*) AS concurrent
          FROM active a
          JOIN active b ON b.user_id = a.user_id AND b.sd <= a.ed AND b.ed >= a.sd
         GROUP BY a.id, a.user_id
      ),
      peak AS (
        SELECT user_id, MAX(concurrent) AS peak
          FROM overlap
         GROUP BY user_id
        HAVING MAX(concurrent) >= ?
      )
      SELECT a.user_id AS "userId", u.name AS "userName", p.peak AS "overlappingTaskCount",
             a.id, a.code, a.name, a.sd AS "startDate", a.ed AS "endDate", a.sheet_slug AS "sheetSlug"
        FROM peak p
        JOIN active a ON a.user_id = p.user_id
        JOIN users u ON u.id = p.user_id
       ORDER BY p.peak DESC, a.user_id, a.sd, a.id`,
    ...params,
  );

  // Gom phẳng → cây (1 lượt, không lồng): giữ thứ tự peak DESC nhờ ORDER BY trên.
  const byUser = new Map<number, AssignmentConflict>();
  for (const r of rows) {
    const uid = Number(r.userId);
    let entry = byUser.get(uid);
    if (!entry) {
      entry = {
        userId: uid,
        userName: r.userName,
        overlappingTaskCount: Number(r.overlappingTaskCount),
        tasks: [],
      };
      byUser.set(uid, entry);
    }
    entry.tasks.push({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      sheetSlug: r.sheetSlug,
    });
  }
  return [...byUser.values()];
}

// Cửa sổ mặc định 8 tuần quanh hôm nay (4 tuần trước → 4 tuần sau) khi thiếu from/to.
export function defaultResourceWindow(): { from: string; to: string } {
  const today = todayISO();
  return { from: addDaysISO(today, -28), to: addDaysISO(today, 28) };
}
