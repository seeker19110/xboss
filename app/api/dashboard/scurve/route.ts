import { NextRequest, NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type TaskRow = { id: number; startDate: string | null; endDate: string | null; progress: number; sheet: string };
type HistRow = { taskId: number; oldProgress: number | null; newProgress: number | null; day: string };

const DAY_MS = 86400_000;
const toDate = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// GET /api/dashboard/scurve?sheet=OGTĐ&baseline=<id> (đều tuỳ chọn)
// S-curve: đường kế hoạch (nội suy tuyến tính start→end mỗi task)
// vs đường thực tế (tái dựng % từng ngày từ task_history).
// Có ?baseline= → đường kế hoạch dùng ngày đã chốt trong baseline thay vì ngày hiện tại,
// để đo độ lệch so với kế hoạch gốc kể cả khi PM đã dời ngày.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sheet = req.nextUrl.searchParams.get("sheet");
  const baselineId = parseInt(req.nextUrl.searchParams.get("baseline") ?? "");
  const sheetFilter = sheet ? `AND st.code = ?` : "";
  const params = sheet ? [sheet] : [];

  const tasks = await query<TaskRow>(
    `SELECT t.id, t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS progress, st.code AS sheet
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE 1=1 ${sheetFilter}`, ...params);
  if (tasks.length === 0) return NextResponse.json({ points: [], sheets: [] });

  // Ngày kế hoạch lấy từ baseline đã chốt (nếu chọn) — task tạo sau baseline giữ ngày hiện tại.
  if (!isNaN(baselineId)) {
    const blDates = await query<{ taskId: number; startDate: string | null; endDate: string | null }>(
      `SELECT task_id AS "taskId", start_date AS "startDate", end_date AS "endDate"
         FROM baseline_tasks WHERE baseline_id = ?`, baselineId);
    const byTask = new Map(blDates.map((b) => [b.taskId, b]));
    for (const t of tasks) {
      const b = byTask.get(t.id);
      if (b) { t.startDate = b.startDate; t.endDate = b.endDate; }
    }
  }

  const hist = await query<HistRow>(
    `SELECT h.task_id AS "taskId", h.old_progress AS "oldProgress",
            h.new_progress AS "newProgress", h.changed_at::date::text AS day
       FROM task_history h
       JOIN tasks t ON h.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE 1=1 ${sheetFilter}
      ORDER BY h.task_id, h.changed_at`, ...params);

  // Sự kiện theo task: [{day, progress}] đã sắp theo thời gian.
  const eventsByTask = new Map<number, { day: string; progress: number }[]>();
  for (const h of hist) {
    if (!eventsByTask.has(h.taskId)) eventsByTask.set(h.taskId, []);
    eventsByTask.get(h.taskId)!.push({ day: h.day, progress: h.newProgress ?? 0 });
  }
  // % nền trước sự kiện đầu tiên = old_progress của sự kiện đầu (≈ % lúc import).
  const baseline = new Map<number, number>();
  for (const h of hist) if (!baseline.has(h.taskId)) baseline.set(h.taskId, h.oldProgress ?? 0);

  const today = todayISO();
  const dates: string[] = [];
  for (const t of tasks) { if (t.startDate) dates.push(t.startDate); if (t.endDate) dates.push(t.endDate); }
  for (const h of hist) dates.push(h.day);
  if (dates.length === 0) return NextResponse.json({ points: [], sheets: [] });

  let from = dates.reduce((a, b) => (a < b ? a : b));
  let to = dates.reduce((a, b) => (a > b ? a : b));
  if (to < today) to = today;
  if (from > today) from = today;

  // Tối đa ~140 điểm để chart nhẹ — bước nhảy theo ngày.
  const rangeDays = Math.max(1, Math.round((toDate(to) - toDate(from)) / DAY_MS));
  const step = Math.max(1, Math.ceil(rangeDays / 140));

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
        const s = toDate(t.startDate!), e = toDate(t.endDate!);
        sum += e <= s ? (ms >= e ? 1 : 0) : Math.min(1, Math.max(0, (ms - s) / (e - s)));
      }
      plannedPct = sum / planned.length;
    }

    // Thực tế: % của từng task tại ngày d (chỉ tới hôm nay).
    let actualPct: number | null = null;
    if (d <= today) {
      let sum = 0;
      for (const t of tasks) {
        const events = eventsByTask.get(t.id);
        if (!events) { sum += t.progress ?? 0; continue; } // không có lịch sử → coi như % hiện tại từ đầu
        let p = baseline.get(t.id) ?? 0;
        for (const ev of events) { if (ev.day <= d) p = ev.progress; else break; }
        sum += p;
      }
      actualPct = sum / tasks.length;
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
