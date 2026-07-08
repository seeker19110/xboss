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
// projectId (M22): undefined = không lọc dự án (dùng nội bộ/cron/test cũ — sẽ scoped ở
// batch cross-cutting notification riêng). site_diaries.diary_date nay UNIQUE theo
// (diary_date, project_id) (migrations/0028_diary_project_unique.sql) nên kiểm "đã lập
// nhật ký chưa" cũng phải khớp đúng project_id, không thì dự án A tưởng đã lập nhật ký
// chỉ vì dự án B đã lập cho cùng ngày đó.
export async function missingDiaryDates(lookbackDays = 7, projectId?: number): Promise<string[]> {
  const args: unknown[] = [daysFromTodayISO(-lookbackDays), todayISO()];
  // task_history.task_id/tasks.package_id nullable trong schema (dù app luôn set) — chỉ
  // JOIN thêm tasks/work_packages khi thật sự cần lọc theo dự án, để nhánh không lọc
  // (projectId undefined) giữ nguyên hành vi/kết quả như trước M22 (không đổi thành INNER
  // JOIN ẩn có thể làm rớt dòng hợp lệ nếu task_id/package_id có giá trị NULL bất thường).
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
