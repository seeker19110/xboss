import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: number;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  sheet: string;
};
type HistRow = {
  taskId: number;
  oldProgress: number | null;
  newProgress: number | null;
  day: string;
};

const DAY_MS = 86400_000;
const toDate = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// M47 PR2: đọc đường thực tế từ mv_progress_daily (xem migrations/0055_matviews.sql) thay
// vì tái dựng từ task_history mỗi request — chỉ khi MV phủ đủ [from, toCap]. Trả null (DB
// mới/cron chưa refresh lần nào → MV rỗng, hoặc phủ chưa đủ) để route tự fallback tái dựng
// như trước, KHÔNG đổi kết quả trong mọi trường hợp (đã verify khớp tuyệt đối bằng dữ liệu
// thật, xem PROGRESS.md mục M47 PR2). MV dùng sentinel 0 cho project/system NULL.
async function readMvActual(
  projectId: number | null,
  systemId: number | null,
  from: string,
  toCap: string,
): Promise<Map<string, number> | null> {
  const scopeProjectId = projectId ?? 0;
  const systemFilter = systemId !== null ? "AND system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];

  const coverage = await queryOne<{ minD: string | null; maxD: string | null }>(
    `SELECT MIN(date) AS "minD", MAX(date) AS "maxD" FROM mv_progress_daily
      WHERE project_id = ? ${systemFilter}`,
    scopeProjectId,
    ...systemParams,
  );
  if (!coverage?.minD || !coverage.maxD || coverage.minD > from || coverage.maxD < toCap)
    return null;

  const rows = await query<{ date: string; sumProgress: number; sumCount: number }>(
    `SELECT date, SUM(avg_progress * total_count) AS "sumProgress", SUM(total_count) AS "sumCount"
       FROM mv_progress_daily
      WHERE project_id = ? ${systemFilter} AND date BETWEEN ? AND ?
      GROUP BY date`,
    scopeProjectId,
    ...systemParams,
    from,
    toCap,
  );
  const map = new Map<string, number>();
  for (const r of rows) if (r.sumCount > 0) map.set(r.date, r.sumProgress / r.sumCount);
  return map;
}

// GET /api/dashboard/scurve?sheet=OGTĐ&baseline=<id>&system=<systems.code> (đều tuỳ chọn)
// S-curve: đường kế hoạch (nội suy tuyến tính start→end mỗi task)
// vs đường thực tế (tái dựng % từng ngày từ task_history).
// Có ?baseline= → đường kế hoạch dùng ngày đã chốt trong baseline thay vì ngày hiện tại,
// để đo độ lệch so với kế hoạch gốc kể cả khi PM đã dời ngày.
// `system` (M36) gộp mọi sheet thuộc hệ — truyền cả `sheet` lẫn `system` thì `sheet` thắng (hẹp hơn).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewDashboard(user.role))
    return NextResponse.json({ error: "Thầu phụ không có quyền xem dashboard" }, { status: 403 });

  const sheet = req.nextUrl.searchParams.get("sheet");
  const baselineId = parseInt(req.nextUrl.searchParams.get("baseline") ?? "");
  const systemId = sheet ? null : await resolveSystemId(req.nextUrl.searchParams.get("system"));
  const sheetFilter = sheet ? `AND st.code = ?` : systemId !== null ? `AND st.system_id = ?` : "";
  const params = sheet ? [sheet] : systemId !== null ? [systemId] : [];
  // Dự án đang chọn — lọc theo dự án để tránh rò rỉ chéo dự án (đa dự án, M22+).
  // null = DB chưa có project nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);
  const projectJoin = projectId != null ? "JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? "AND tw.project_id = ?" : "";
  const projectParams = projectId != null ? [projectId] : [];

  const tasks = await query<TaskRow>(
    `SELECT t.id, t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS progress, st.code AS sheet
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
      WHERE 1=1 ${sheetFilter} ${projectFilter}`,
    ...params,
    ...projectParams,
  );
  if (tasks.length === 0) return NextResponse.json({ points: [], sheets: [] });

  // Ngày kế hoạch lấy từ baseline đã chốt (nếu chọn) — task tạo sau baseline giữ ngày hiện tại.
  if (!isNaN(baselineId)) {
    const blDates = await query<{
      taskId: number;
      startDate: string | null;
      endDate: string | null;
    }>(
      `SELECT task_id AS "taskId", start_date AS "startDate", end_date AS "endDate"
         FROM baseline_tasks WHERE baseline_id = ?`,
      baselineId,
    );
    const byTask = new Map(blDates.map((b) => [b.taskId, b]));
    for (const t of tasks) {
      const b = byTask.get(t.id);
      if (b) {
        t.startDate = b.startDate;
        t.endDate = b.endDate;
      }
    }
  }

  const today = todayISO();
  const taskDates: string[] = [];
  for (const t of tasks) {
    if (t.startDate) taskDates.push(t.startDate);
    if (t.endDate) taskDates.push(t.endDate);
  }

  // Thử MV trước (chỉ khi không lọc sheet — MV chỉ gộp tới cấp hệ). Dải ngày kiểm phủ tính
  // từ ngày BĐ/KT task (không cộng ngày lịch sử vì nhánh này không fetch lịch sử) — chấp
  // nhận vì lịch sử luôn phát sinh sau khi task tồn tại; ca hiếm start_date đổi muộn hơn
  // lịch sử cũ sẽ tự fallback (coverage check trong readMvActual không qua được → null).
  let mvActual: Map<string, number> | null = null;
  if (!sheet && taskDates.length > 0) {
    const mvFrom = taskDates.reduce((a, b) => (a < b ? a : b));
    const mvToCap = today < mvFrom ? mvFrom : today;
    mvActual = await readMvActual(projectId, systemId, mvFrom, mvToCap);
  }

  // Chỉ tái dựng từ task_history khi không dùng được MV (lọc sheet, hoặc MV rỗng/chưa phủ đủ).
  let eventsByTask: Map<number, { day: string; progress: number }[]> | null = null;
  let baselineProgress: Map<number, number> | null = null;
  const dates: string[] = [...taskDates];

  if (!mvActual) {
    const hist = await query<HistRow>(
      `SELECT h.task_id AS "taskId", h.old_progress AS "oldProgress",
              h.new_progress AS "newProgress",
              (h.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day
         FROM task_history h
         JOIN tasks t ON h.task_id = t.id
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         ${projectJoin}
        WHERE 1=1 ${sheetFilter} ${projectFilter}
        ORDER BY h.task_id, h.changed_at`,
      ...params,
      ...projectParams,
    );

    // Sự kiện theo task: [{day, progress}] đã sắp theo thời gian.
    eventsByTask = new Map();
    for (const h of hist) {
      if (!eventsByTask.has(h.taskId)) eventsByTask.set(h.taskId, []);
      eventsByTask.get(h.taskId)!.push({ day: h.day, progress: h.newProgress ?? 0 });
    }
    // % nền trước sự kiện đầu tiên = old_progress của sự kiện đầu (≈ % lúc import).
    baselineProgress = new Map();
    for (const h of hist)
      if (!baselineProgress.has(h.taskId)) baselineProgress.set(h.taskId, h.oldProgress ?? 0);
    dates.push(...hist.map((h) => h.day));
  }

  if (dates.length === 0) return NextResponse.json({ points: [], sheets: [] });

  let from = dates.reduce((a, b) => (a < b ? a : b));
  let to = dates.reduce((a, b) => (a > b ? a : b));
  if (to < today) to = today;
  if (from > today) from = today;

  // Mỗi điểm = 1 ngày để mỗi chấm trên chart tương ứng đúng 1 ngày. Trần 1000 điểm
  // giữ chart nhẹ với dự án kéo dài nhiều năm — vượt trần mới nhảy bước >1 ngày.
  const rangeDays = Math.max(1, Math.round((toDate(to) - toDate(from)) / DAY_MS));
  const step = Math.max(1, Math.ceil(rangeDays / 1000));

  const planned = tasks.filter((t) => t.startDate && t.endDate);
  const points: { date: string; planned: number | null; actual: number | null }[] = [];

  for (let ms = toDate(from); ; ms += step * DAY_MS) {
    if (ms > toDate(to)) ms = toDate(to); // luôn chốt điểm cuối
    const d = toISO(ms);

    // Kế hoạch: trung bình tỉ lệ thời gian đã qua của mỗi task (clamp 0..1).
    let plannedPct: number | null = null;
    if (planned.length > 0) {
      let sum = 0;
      for (const t of planned) {
        const s = toDate(t.startDate!),
          e = toDate(t.endDate!);
        sum += e <= s ? (ms >= e ? 1 : 0) : Math.min(1, Math.max(0, (ms - s) / (e - s)));
      }
      plannedPct = sum / planned.length;
    }

    // Thực tế: % của từng task tại ngày d (chỉ tới hôm nay) — đọc MV nếu có, không thì
    // tái dựng từ task_history như trước.
    let actualPct: number | null = null;
    if (d <= today) {
      if (mvActual) {
        actualPct = mvActual.get(d) ?? 0;
      } else {
        let sum = 0;
        for (const t of tasks) {
          const events = eventsByTask!.get(t.id);
          if (!events) {
            sum += t.progress ?? 0;
            continue;
          } // không có lịch sử → coi như % hiện tại từ đầu
          let p = baselineProgress!.get(t.id) ?? 0;
          for (const ev of events) {
            if (ev.day <= d) p = ev.progress;
            else break;
          }
          sum += p;
        }
        actualPct = sum / tasks.length;
      }
    }

    points.push({
      date: d,
      planned: plannedPct === null ? null : Math.round(plannedPct * 1000) / 10,
      actual: actualPct === null ? null : Math.round(actualPct * 1000) / 10,
    });
    if (ms >= toDate(to)) break;
  }

  const sheets = [...new Set(tasks.map((t) => t.sheet))];
  return NextResponse.json({ points, sheets, from, to, today });
}
