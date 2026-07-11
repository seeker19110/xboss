// M5 — Nhật ký thi công điện tử: sinh gần tự động nội dung "Công việc thực hiện" từ
// task_history/task_photos trong ngày + cảnh báo thiếu nhật ký. Tách khỏi route để test tích
// hợp trực tiếp qua DB (cùng pattern lib/cost.ts, lib/procurement.ts, lib/qaqc.ts).
// Xem docs/nang-cap/M05-nhat-ky.md.
import { query, queryOne, todayISO, daysFromTodayISO } from "@/lib/db";
import type { Role } from "@/lib/roles";

// Khoá sổ (giá trị pháp lý — NĐ 06/2021): chỉ Admin/PM khoá, chỉ Admin mở khoá.
export const canLockDiary = (r?: Role) => r === "admin" || r === "pm";
export const canUnlockDiary = (r?: Role) => r === "admin";

// Nhật ký đã khoá thì không sửa được nữa (PATCH/PUT trả 409) — tách hàm để test độc lập route.
export function assertDiaryUnlocked(status: string | undefined): void {
  if (status === "locked")
    throw Object.assign(new Error("Nhật ký đã khoá — không thể sửa"), { status: 409 });
}

export type DiaryPhotoPrefill = {
  id: number;
  taskId: number;
  taskCode: string;
  caption: string | null;
  createdAt: string;
};

export type DiaryPrefill = {
  workDone: string;
  updatedBy: string[];
  photos: DiaryPhotoPrefill[];
};

// Gộp task_history + task_photos trong ngày `date` thành nội dung nhật ký gợi ý — thuần tính
// toán lúc GET (không ghi DB); người lập vẫn sửa được, hoặc bấm "Lấy lại từ hệ thống" để tính lại.
// projectId (M22): undefined = không lọc dự án (dùng nội bộ/test cũ); có giá trị → chỉ gộp
// hoạt động của task thuộc dự án đó (qua work_package → sheet_type → tower.project_id).
export async function buildDiaryPrefill(date: string, projectId?: number): Promise<DiaryPrefill> {
  const projectCond = projectId != null ? " AND tw.project_id = ?" : "";
  const projectArgs = projectId != null ? [projectId] : [];

  const groups = await query<{
    systemName: string | null;
    floorLabel: string | null;
    taskCount: number;
    minCode: string;
    maxCode: string;
  }>(
    `SELECT d.name AS "systemName", wp.floor_label AS "floorLabel",
            COUNT(DISTINCT t.id) AS "taskCount",
            MIN(t.code) AS "minCode", MAX(t.code) AS "maxCode"
       FROM task_history th
       JOIN tasks t ON t.id = th.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
       LEFT JOIN systems d ON d.id = st.system_id
      WHERE (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ?
        AND th.new_progress > th.old_progress${projectCond}
      GROUP BY d.name, wp.floor_label
      ORDER BY d.name, wp.floor_label`,
    date,
    ...projectArgs,
  );

  const workDone = groups
    .map((g) => {
      const label = [g.systemName ?? "Chưa rõ hệ", g.floorLabel].filter(Boolean).join(" ");
      const range = g.minCode === g.maxCode ? g.minCode : `${g.minCode} → ${g.maxCode}`;
      return `${label}: cập nhật ${g.taskCount} hạng mục (${range})`;
    })
    .join("\n");

  const updatedByRows = await query<{ changedBy: string }>(
    `SELECT DISTINCT th.changed_by AS "changedBy"
       FROM task_history th
       JOIN tasks t ON t.id = th.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ? AND th.changed_by IS NOT NULL${projectCond}
      ORDER BY th.changed_by`,
    date,
    ...projectArgs,
  );

  const photos = await query<DiaryPhotoPrefill>(
    `SELECT p.id, p.task_id AS "taskId", t.code AS "taskCode", p.caption, p.created_at AS "createdAt"
       FROM task_photos p
       JOIN tasks t ON t.id = p.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ?${projectCond}
      ORDER BY p.id DESC`,
    date,
    ...projectArgs,
  );

  return { workDone, updatedBy: updatedByRows.map((r) => r.changedBy), photos };
}

export type DiaryRow = {
  id: number;
  diaryDate: string;
  projectId: number | null;
  weatherAm: string | null;
  weatherPm: string | null;
  workDone: string | null;
  obstacles: string | null;
  safetyNote: string | null;
  status: "draft" | "locked";
  createdBy: number | null;
  lockedBy: number | null;
  lockedByName: string | null;
  lockedAt: string | null;
};

const SELECT_DIARY = `
  SELECT sd.id, sd.diary_date AS "diaryDate", sd.project_id AS "projectId",
         sd.weather_am AS "weatherAm", sd.weather_pm AS "weatherPm", sd.work_done AS "workDone",
         sd.obstacles, sd.safety_note AS "safetyNote", sd.status, sd.created_by AS "createdBy",
         sd.locked_by AS "lockedBy", u.name AS "lockedByName", sd.locked_at AS "lockedAt"
    FROM site_diaries sd
    LEFT JOIN users u ON u.id = sd.locked_by`;

// site_diaries.diary_date nay UNIQUE(diary_date, project_id) — mỗi dự án có nhật ký
// riêng theo ngày (migrations/0028_diary_project_unique.sql, thay UNIQUE đơn cũ).
export async function getDiaryByDate(
  date: string,
  projectId?: number,
): Promise<DiaryRow | undefined> {
  const conds = ["sd.diary_date = ?"];
  const params: unknown[] = [date];
  if (projectId != null) {
    conds.push("sd.project_id = ?");
    params.push(projectId);
  }
  return queryOne<DiaryRow>(`${SELECT_DIARY} WHERE ${conds.join(" AND ")}`, ...params);
}

export type DiaryDayStatus = { date: string; status: string };
export type DiaryDayManpower = { date: string; crew: string; headcount: number };

// Trạng thái từng ngày trong tháng (cho lịch) + nhân lực theo ngày × tổ đội — scoped
// theo dự án đang chọn (M22). projectId: undefined = không lọc dự án (dùng nội bộ/test cũ).
export async function listDiaryCalendar(
  start: string,
  next: string,
  projectId?: number,
): Promise<{ days: DiaryDayStatus[]; manpower: DiaryDayManpower[] }> {
  const days = await query<DiaryDayStatus>(
    `SELECT diary_date AS "date", status FROM site_diaries
      WHERE diary_date >= ? AND diary_date < ?${
        projectId != null ? " AND project_id = ?" : ""
      } ORDER BY diary_date`,
    start,
    next,
    ...(projectId != null ? [projectId] : []),
  );

  const manpower = await query<DiaryDayManpower>(
    `SELECT sd.diary_date AS "date", dm.crew, dm.headcount
       FROM diary_manpower dm
       JOIN site_diaries sd ON sd.id = dm.diary_id
      WHERE sd.diary_date >= ? AND sd.diary_date < ?${
        projectId != null ? " AND sd.project_id = ?" : ""
      }
      ORDER BY sd.diary_date, dm.crew`,
    start,
    next,
    ...(projectId != null ? [projectId] : []),
  );

  return { days, manpower };
}

// Ngày trong quá khứ (không tính hôm nay — có thể lập nhật ký cuối ngày) có task_history nhưng
// chưa có site_diaries → cần nhắc lập nhật ký. Chỉ soát trong `lookbackDays` gần nhất (mặc định
// 7, giống cửa sổ nhắc của due_soon/stalled) để tránh cảnh báo dồn ứ dữ liệu cũ.
// projectId (M22): undefined = không lọc dự án (dùng nội bộ/cron/test cũ — chỉ JOIN thêm
// tasks/work_packages khi thật cần lọc, để nhánh không lọc giữ nguyên hành vi cũ — hai cột
// này nullable trong schema dù app luôn set). site_diaries nay UNIQUE(diary_date, project_id)
// nên kiểm "đã lập nhật ký chưa" cũng phải khớp đúng project_id khi có lọc.
export async function missingDiaryDates(lookbackDays = 7, projectId?: number): Promise<string[]> {
  const args: unknown[] = [daysFromTodayISO(-lookbackDays), todayISO()];
  const taskJoin =
    projectId != null
      ? `JOIN tasks t ON t.id = th.task_id
       JOIN work_packages wp ON wp.id = t.package_id`
      : "";
  let taskCond = "";
  let diaryCond = "";
  if (projectId != null) {
    taskCond = ` AND wp.sheet_type_id IN (
        SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`;
    args.push(projectId);
    diaryCond = " AND sd.project_id = ?";
    args.push(projectId);
  }
  const rows = await query<{ d: string }>(
    `SELECT DISTINCT (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
       FROM task_history th
       ${taskJoin}
      WHERE (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ?
        AND (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < ?${taskCond}
        AND NOT EXISTS (
          SELECT 1 FROM site_diaries sd
           WHERE sd.diary_date = (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date${diaryCond})
      ORDER BY d`,
    ...args,
  );
  return rows.map((r) => r.d);
}
