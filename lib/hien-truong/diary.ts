// M5 — Nhật ký thi công điện tử: sinh gần tự động nội dung "Công việc thực hiện" từ
// task_history/task_photos trong ngày + cảnh báo thiếu nhật ký. Tách khỏi route để test tích
// hợp trực tiếp qua DB (cùng pattern lib/cost.ts, lib/procurement.ts, lib/qaqc.ts).
// Xem docs/nang-cap/M05-nhat-ky.md.
import { dangTrongGiaoDich, query, queryOne, todayISO, daysFromTodayISO } from "@/lib/db";
import type { Role } from "@/lib/nen/roles";

// Khoá sổ (giá trị pháp lý — NĐ 06/2021): chỉ Admin/PM khoá, chỉ Admin mở khoá.
export const canLockDiary = (r?: Role) => r === "admin" || r === "pm";
export const canUnlockDiary = (r?: Role) => r === "admin";

// Nhật ký đã khoá thì không sửa được nữa (PATCH/PUT trả 409) — tách hàm để test độc lập route.
export function assertDiaryUnlocked(status: string | undefined): void {
  if (status === "locked")
    throw Object.assign(new Error("Nhật ký đã khoá — không thể sửa"), { status: 409 });
}

// ── Precondition PUT full-replace (QUALITY-FINAL-1 S06 — A2-FR11, DATA-CONTRACTS §5) ─────────

/** ETag MẠNH của nhật ký: id + version server cấp (không timestamp, không do client đặt). */
export function etagNhatKy(d: { id: number; version: number }): string {
  return `"${d.id}-${d.version}"`;
}

export type DieuKienNhatKy =
  | { loai: "tao_moi" } // If-None-Match: * — chỉ tạo khi ngày đó CHƯA có nhật ký
  | { loai: "khop"; etags: string[] }; // If-Match: "<etag>" — chỉ ghi đè đúng phiên bản đã đọc

export type KetQuaDieuKien =
  | { ok: true; dieuKien: DieuKienNhatKy }
  | { ok: false; status: 400 | 428; code: string; error: string };

/**
 * Đọc precondition của PUT. Thiếu cả hai → 428 (full-replace mù sẽ đè bản người khác vừa lưu).
 * `If-Match: *` không phải phiên bản cụ thể → 428. Có cả hai, hoặc If-None-Match khác `*` → 400.
 * ETag yếu (`W/`) được giữ nhưng không bao giờ khớp (so sánh mạnh) → 412 ở bước kiểm.
 */
export function docDieuKienNhatKy(
  ifMatch: string | null,
  ifNoneMatch: string | null,
): KetQuaDieuKien {
  const im = ifMatch?.trim() || null;
  const inm = ifNoneMatch?.trim() || null;
  const thieu = {
    ok: false,
    status: 428,
    code: "precondition_required",
    error:
      "Thiếu phiên bản nhật ký (If-Match) hoặc If-None-Match: * khi tạo mới — tải lại nhật ký rồi lưu",
  } as const;
  if (im && inm)
    return {
      ok: false,
      status: 400,
      code: "precondition_invalid",
      error: "Chỉ gửi một trong If-Match hoặc If-None-Match",
    };
  if (inm) {
    if (inm !== "*")
      return {
        ok: false,
        status: 400,
        code: "precondition_invalid",
        error: "If-None-Match chỉ nhận * (tạo mới)",
      };
    return { ok: true, dieuKien: { loai: "tao_moi" } };
  }
  if (!im || im === "*") return thieu;
  const etags = im
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!etags.length) return thieu;
  return { ok: true, dieuKien: { loai: "khop", etags } };
}

/** Precondition có thoả với nhật ký HIỆN HÀNH (đọc dưới khoá) không — false → 412. */
export function dieuKienThoa(
  dk: DieuKienNhatKy,
  hienTai: { id: number; version: number } | undefined,
): boolean {
  if (dk.loai === "tao_moi") return !hienTai;
  return !!hienTai && dk.etags.includes(etagNhatKy(hienTai));
}

/** Phiên bản gốc đưa vào hash receipt — đổi base dưới cùng Idempotency-Key là thao tác khác. */
export function baseVersionNhatKy(dk: DieuKienNhatKy): string {
  return dk.loai === "tao_moi" ? "*" : [...dk.etags].sort().join(",");
}

// ── Thứ tự khoá khi xoá ảnh (S06 — trigger version 0164) ────────────────────────────────────
// Xoá task_photos cascade xoá diary_photos → trigger tăng version → UPDATE site_diaries. PUT nhật
// ký đi chiều ngược: khoá site_diaries trước rồi mới xoá/chèn diary_photos (chèn = KEY SHARE dòng
// task_photos). Hai chiều ngược nhau = deadlock. Mọi đường xoá ảnh phải khoá các nhật ký đang gắn
// ảnh đó TRƯỚC khi DELETE, theo id tăng dần — cùng thứ tự "nhật ký → ảnh" với PUT.

function batBuocGiaoDichXoaAnh(): void {
  if (!dangTrongGiaoDich())
    throw new Error("Khoá nhật ký trước khi xoá ảnh phải chạy CÙNG transaction với lệnh DELETE");
}

/** Khoá (FOR UPDATE, id tăng dần) các nhật ký đang gắn một trong các ảnh sắp xoá. */
export async function khoaNhatKyCuaAnh(photoIds: number[]): Promise<void> {
  batBuocGiaoDichXoaAnh();
  if (!photoIds.length) return;
  await query(
    `SELECT sd.id FROM site_diaries sd
      WHERE sd.id IN (SELECT dp.diary_id FROM diary_photos dp WHERE dp.photo_id = ANY(?::int[]))
      ORDER BY sd.id FOR UPDATE`,
    photoIds,
  );
}

/** Như `khoaNhatKyCuaAnh` nhưng cho mọi ảnh của các task sắp bị xoá (xoá task/nhóm/sheet). */
export async function khoaNhatKyCuaAnhTask(taskIds: number[]): Promise<void> {
  batBuocGiaoDichXoaAnh();
  if (!taskIds.length) return;
  await query(
    `SELECT sd.id FROM site_diaries sd
      WHERE sd.id IN (SELECT dp.diary_id FROM diary_photos dp
                        JOIN task_photos tp ON tp.id = dp.photo_id
                       WHERE tp.task_id = ANY(?::int[]))
      ORDER BY sd.id FOR UPDATE`,
    taskIds,
  );
}

/**
 * Id ảnh trong danh sách KHÔNG thuộc dự án `projectId` (hoặc không tồn tại) — PUT nhật ký từ chối
 * 422 thay vì gắn ảnh dự án khác vào nhật ký (lộ ảnh xuyên dự án qua nhật ký/PDF). Cùng luật suy
 * dự án với `/api/photos/:id`: ảnh album → progress_albums.project_id; ảnh task → task → nhóm →
 * sheet → tháp; không gắn gì → không thuộc dự án nào.
 */
export async function anhNgoaiDuAn(photoIds: number[], projectId: number): Promise<number[]> {
  if (!photoIds.length) return [];
  const hopLe = await query<{ id: number }>(
    `SELECT tp.id FROM task_photos tp
       LEFT JOIN progress_albums pa ON pa.id = tp.album_id
       LEFT JOIN tasks t ON t.id = tp.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE tp.id = ANY(?::int[])
        AND CASE WHEN tp.album_id IS NOT NULL THEN pa.project_id = ?
                 ELSE tw.project_id = ? END`,
    photoIds,
    projectId,
    projectId,
  );
  const thuoc = new Set(hopLe.map((r) => r.id));
  return photoIds.filter((id) => !thuoc.has(id));
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
  /** Phiên bản mạnh do trigger 0164 tăng ở mọi thay đổi (dòng nhật ký + nhân lực + ảnh). */
  version: number;
};

const SELECT_DIARY = `
  SELECT sd.id, sd.diary_date AS "diaryDate", sd.project_id AS "projectId",
         sd.weather_am AS "weatherAm", sd.weather_pm AS "weatherPm", sd.work_done AS "workDone",
         sd.obstacles, sd.safety_note AS "safetyNote", sd.status, sd.created_by AS "createdBy",
         sd.locked_by AS "lockedBy", u.name AS "lockedByName", sd.locked_at AS "lockedAt",
         sd.version
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
