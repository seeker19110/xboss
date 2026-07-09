// M5 — Nhật ký thi công điện tử: sinh gần tự động nội dung "Công việc thực hiện" từ
// task_history/task_photos trong ngày + cảnh báo thiếu nhật ký. Tách khỏi route để test tích
// hợp trực tiếp qua DB (cùng pattern lib/cost.ts, lib/procurement.ts, lib/qaqc.ts).
// Xem docs/nang-cap/M05-nhat-ky.md.
import { query, todayISO, daysFromTodayISO } from "@/lib/db";
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
export async function buildDiaryPrefill(date: string): Promise<DiaryPrefill> {
  const groups = await query<{
    disciplineName: string | null;
    floorLabel: string | null;
    taskCount: number;
    minCode: string;
    maxCode: string;
  }>(
    `SELECT d.name AS "disciplineName", wp.floor_label AS "floorLabel",
            COUNT(DISTINCT t.id) AS "taskCount",
            MIN(t.code) AS "minCode", MAX(t.code) AS "maxCode"
       FROM task_history th
       JOIN tasks t ON t.id = th.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN disciplines d ON d.id = st.discipline_id
      WHERE (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ?
        AND th.new_progress > th.old_progress
      GROUP BY d.name, wp.floor_label
      ORDER BY d.name, wp.floor_label`,
    date,
  );

  const workDone = groups
    .map((g) => {
      const label = [g.disciplineName ?? "Chưa rõ hệ", g.floorLabel].filter(Boolean).join(" ");
      const range = g.minCode === g.maxCode ? g.minCode : `${g.minCode} → ${g.maxCode}`;
      return `${label}: cập nhật ${g.taskCount} hạng mục (${range})`;
    })
    .join("\n");

  const updatedByRows = await query<{ changedBy: string }>(
    `SELECT DISTINCT th.changed_by AS "changedBy"
       FROM task_history th
      WHERE (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ? AND th.changed_by IS NOT NULL
      ORDER BY th.changed_by`,
    date,
  );

  const photos = await query<DiaryPhotoPrefill>(
    `SELECT p.id, p.task_id AS "taskId", t.code AS "taskCode", p.caption, p.created_at AS "createdAt"
       FROM task_photos p
       JOIN tasks t ON t.id = p.task_id
      WHERE (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ?
      ORDER BY p.id DESC`,
    date,
  );

  return { workDone, updatedBy: updatedByRows.map((r) => r.changedBy), photos };
}

// Ngày trong quá khứ (không tính hôm nay — có thể lập nhật ký cuối ngày) có task_history nhưng
// chưa có site_diaries → cần nhắc lập nhật ký. Chỉ soát trong `lookbackDays` gần nhất (mặc định
// 7, giống cửa sổ nhắc của due_soon/stalled) để tránh cảnh báo dồn ứ dữ liệu cũ.
// projectId: lọc theo dự án đang chọn (đa dự án, M22+) — task_history không có project_id
// trực tiếp, suy qua tasks → work_packages → sheet_types → towers. site_diaries là bảng
// nhật ký chung theo ngày (diary_date UNIQUE toàn hệ thống, không theo dự án) nên vế
// NOT EXISTS giữ nguyên không lọc — chỉ lọc vế "có hoạt động" theo dự án.
export async function missingDiaryDates(lookbackDays = 7, projectId?: number): Promise<string[]> {
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const joinTower = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const joinChain =
    projectId != null
      ? ` JOIN tasks t ON t.id = th.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id${joinTower}`
      : "";
  const rows = await query<{ d: string }>(
    `SELECT DISTINCT (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
       FROM task_history th${joinChain}
      WHERE (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ?
        AND (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < ?
        AND NOT EXISTS (
          SELECT 1 FROM site_diaries sd
           WHERE sd.diary_date = (th.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)${projectFilter}
      ORDER BY d`,
    ...(projectId != null
      ? [daysFromTodayISO(-lookbackDays), todayISO(), projectId]
      : [daysFromTodayISO(-lookbackDays), todayISO()]),
  );
  return rows.map((r) => r.d);
}
