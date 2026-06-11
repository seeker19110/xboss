// Tổng hợp báo cáo trễ hạn hằng ngày (dùng cho email cron + xem trước).
import { query, queryOne, todayISO } from "@/lib/db";
import { STATUS_LABEL, type StatusSlug } from "@/lib/status";

export type DelayedRow = {
  code: string; name: string; status: string; endDate: string;
  progressPercent: number; floorLabel: string | null; sheetType: string;
};
export type KpiRow = { sheetType: string; total: number; avgProgress: number; delayed: number };
export type DailyReport = {
  date: string;
  projectName: string | null;
  totalDelayed: number;
  newDelayed: DelayedRow[];   // mới quá hạn trong 24h (end_date = hôm qua)
  topDelayed: DelayedRow[];   // trễ lâu nhất
  dueSoon: DelayedRow[];      // còn ≤3 ngày tới hạn mà tiến độ < 70%
  kpi: KpiRow[];
};

const DELAY_COND = `t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')`;

export async function buildDailyReport(): Promise<DailyReport> {
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  const select = `SELECT t.code, t.name, t.status, t.end_date AS "endDate",
            t.progress_percent AS "progressPercent",
            wp.floor_label AS "floorLabel", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id`;

  const all = await query<DelayedRow>(
    `${select} WHERE ${DELAY_COND} ORDER BY t.end_date`, today);

  const newDelayed = all.filter((r) => r.endDate === yesterday);
  const topDelayed = all.slice(0, 15);

  // Sắp đến hạn (≤3 ngày, tiến độ < 70%) — cảnh báo sớm để còn kịp xử lý.
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const dueSoon = await query<DelayedRow>(
    `${select} WHERE t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < 0.7 AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      ORDER BY t.end_date LIMIT 20`, today, soon);

  const kpi = await query<KpiRow>(
    `SELECT st.code AS "sheetType", COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN ${DELAY_COND.replace(/t\./g, "t.")} THEN 1 ELSE 0 END), 0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code ORDER BY st.id`, today);

  const project = await queryOne<{ name: string }>(`SELECT name FROM projects ORDER BY id LIMIT 1`);

  return { date: today, projectName: project?.name ?? null, totalDelayed: all.length, newDelayed, topDelayed, dueSoon, kpi };
}

// ===== Báo cáo tuần =====
// So sánh tiến độ hiện tại với 7 ngày trước (tái dựng từ task_history như S-curve),
// kèm danh sách hoàn thành trong tuần + trễ mới phát sinh.

export type WeeklyKpiRow = {
  sheetType: string; total: number;
  avgProgress: number;      // hiện tại
  avgProgressPrev: number;  // 7 ngày trước
  delayed: number;
};
export type CompletedRow = { code: string; name: string; sheetType: string; floorLabel: string | null; day: string };
export type WeeklyReport = {
  date: string;
  weekFrom: string; // 7 ngày trước
  projectName: string | null;
  kpi: WeeklyKpiRow[];
  completed: CompletedRow[];   // đạt 100% trong tuần
  newDelayed: DelayedRow[];    // quá hạn trong 7 ngày qua, chưa xong
  topDelayed: DelayedRow[];
  totalDelayed: number;
};

export async function buildWeeklyReport(): Promise<WeeklyReport> {
  const today = todayISO();
  const weekFrom = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  type TaskRow = { id: number; progress: number; sheetType: string };
  const tasks = await query<TaskRow>(
    `SELECT t.id, t.progress_percent AS progress, st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id`);

  // Tái dựng % của từng task tại thời điểm 7 ngày trước từ task_history:
  // lấy new_progress của sự kiện cuối cùng trước mốc; chưa có sự kiện nào trước mốc
  // thì dùng old_progress của sự kiện đầu tiên; không có lịch sử → % hiện tại.
  type HistRow = { taskId: number; oldProgress: number | null; newProgress: number | null; day: string };
  const hist = await query<HistRow>(
    `SELECT task_id AS "taskId", old_progress AS "oldProgress",
            new_progress AS "newProgress", changed_at::date::text AS day
       FROM task_history ORDER BY task_id, changed_at`);

  const prevProgress = new Map<number, number>();
  const firstOld = new Map<number, number>();
  for (const h of hist) {
    if (!firstOld.has(h.taskId)) firstOld.set(h.taskId, h.oldProgress ?? 0);
    if (h.day <= weekFrom) prevProgress.set(h.taskId, h.newProgress ?? 0);
  }
  const progressAt = (t: TaskRow) =>
    prevProgress.get(t.id) ?? (firstOld.has(t.id) ? firstOld.get(t.id)! : t.progress ?? 0);

  const select = `SELECT t.code, t.name, t.status, t.end_date AS "endDate",
            t.progress_percent AS "progressPercent",
            wp.floor_label AS "floorLabel", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id`;

  const allDelayed = await query<DelayedRow>(
    `${select} WHERE ${DELAY_COND} ORDER BY t.end_date`, today);
  const newDelayed = allDelayed.filter((r) => r.endDate >= weekFrom);

  // Đạt 100% trong tuần: sự kiện history đầu tiên chạm new_progress >= 1 nằm trong 7 ngày qua.
  const completed = await query<CompletedRow>(
    `SELECT t.code, t.name, st.code AS "sheetType", wp.floor_label AS "floorLabel",
            MIN(h.changed_at::date)::text AS day
       FROM task_history h
       JOIN tasks t ON h.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE h.new_progress >= 1 AND t.progress_percent >= 1
      GROUP BY t.id, t.code, t.name, st.code, wp.floor_label
     HAVING MIN(h.changed_at::date)::text > ?
      ORDER BY day DESC LIMIT 30`, weekFrom);

  // KPI theo sheet: % trung bình hiện tại vs 7 ngày trước + số trễ.
  const bySheet = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!bySheet.has(t.sheetType)) bySheet.set(t.sheetType, []);
    bySheet.get(t.sheetType)!.push(t);
  }
  const delayedCount = new Map<string, number>();
  for (const d of allDelayed) delayedCount.set(d.sheetType, (delayedCount.get(d.sheetType) ?? 0) + 1);

  const kpi: WeeklyKpiRow[] = [...bySheet.entries()].map(([sheetType, list]) => ({
    sheetType,
    total: list.length,
    avgProgress: list.reduce((s, t) => s + (t.progress ?? 0), 0) / list.length,
    avgProgressPrev: list.reduce((s, t) => s + progressAt(t), 0) / list.length,
    delayed: delayedCount.get(sheetType) ?? 0,
  }));

  const project = await queryOne<{ name: string }>(`SELECT name FROM projects ORDER BY id LIMIT 1`);

  return {
    date: today, weekFrom, projectName: project?.name ?? null, kpi,
    completed, newDelayed, topDelayed: allDelayed.slice(0, 15), totalDelayed: allDelayed.length,
  };
}

const pct = (v: number) => `${Math.round((v ?? 0) * 100)}%`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rowsHtml(rows: DelayedRow[]): string {
  if (!rows.length) return `<tr><td colspan="5" style="padding:8px;color:#888">Không có</td></tr>`;
  return rows.map((r) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace">${esc(r.code)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(r.name)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(r.sheetType)}${r.floorLabel ? ` · ${esc(r.floorLabel)}` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#c00">${r.endDate}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${pct(r.progressPercent)}</td>
    </tr>`).join("");
}

// Bản rút gọn cho Telegram (parse_mode HTML — chỉ hỗ trợ b/i/a/code, giới hạn 4096 ký tự).
export function reportToTelegramText(r: DailyReport, appUrl?: string): string {
  const lines: string[] = [
    `🏗️ <b>XBoss — Báo cáo trễ hạn ${r.date}</b>`,
    `Tổng cộng <b>${r.totalDelayed}</b> việc đang trễ · <b>${r.newDelayed.length}</b> mới quá hạn trong 24h`,
    "",
    "📊 <b>KPI theo hệ</b>",
    ...r.kpi.map((k) => `· ${esc(k.sheetType)}: ${pct(k.avgProgress)} — ${k.delayed > 0 ? `⚠ ${k.delayed} trễ` : "✓ không trễ"}`),
  ];
  if (r.newDelayed.length) {
    lines.push("", `🆕 <b>Mới quá hạn (${r.newDelayed.length})</b>`);
    for (const t of r.newDelayed.slice(0, 10))
      lines.push(`· <code>${esc(t.code)}</code> ${esc(t.name)} — hạn ${t.endDate} (${pct(t.progressPercent)})`);
  }
  if (r.topDelayed.length) {
    lines.push("", `⏰ <b>Trễ lâu nhất</b>`);
    for (const t of r.topDelayed.slice(0, 5))
      lines.push(`· <code>${esc(t.code)}</code> ${esc(t.name)} — hạn ${t.endDate} (${pct(t.progressPercent)})`);
  }
  if (r.dueSoon.length) {
    lines.push("", `⏳ <b>Sắp đến hạn ≤3 ngày, tiến độ &lt;70% (${r.dueSoon.length})</b>`);
    for (const t of r.dueSoon.slice(0, 8))
      lines.push(`· <code>${esc(t.code)}</code> ${esc(t.name)} — hạn ${t.endDate} (${pct(t.progressPercent)})`);
  }
  if (appUrl) lines.push("", `<a href="${appUrl}">→ Mở XBoss Dashboard</a>`);
  // Telegram giới hạn 4096 ký tự/tin — cắt an toàn.
  return lines.join("\n").slice(0, 4000);
}

// Gửi tin nhắn qua Telegram Bot API. Trả về lỗi dạng chuỗi (null = thành công).
export async function sendTelegram(text: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || chatIds.length === 0) return "Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID";

  for (const chatId of chatIds) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Telegram API lỗi ${res.status} (chat ${chatId}): ${body.slice(0, 200)}`;
    }
  }
  return null;
}

// Mũi tên xu hướng tuần: tăng/đứng yên.
const trend = (prev: number, cur: number) => {
  const d = Math.round((cur - prev) * 100);
  return d > 0 ? `▲ +${d}%` : d < 0 ? `▼ ${d}%` : "—";
};

export function weeklyToTelegramText(r: WeeklyReport, appUrl?: string): string {
  const lines: string[] = [
    `📅 <b>XBoss — Báo cáo tuần ${r.weekFrom} → ${r.date}</b>`,
    `${esc(r.projectName ?? "")}`,
    "",
    "📊 <b>Tiến độ theo hệ (so với tuần trước)</b>",
    ...r.kpi.map((k) => `· ${esc(k.sheetType)}: ${pct(k.avgProgress)} (${trend(k.avgProgressPrev, k.avgProgress)})${k.delayed > 0 ? ` — ⚠ ${k.delayed} trễ` : ""}`),
    "",
    `✅ <b>Hoàn thành trong tuần: ${r.completed.length}</b>`,
  ];
  for (const t of r.completed.slice(0, 10))
    lines.push(`· <code>${esc(t.code)}</code> ${esc(t.name)} (${t.day})`);
  if (r.newDelayed.length) {
    lines.push("", `🆕 <b>Trễ mới phát sinh trong tuần (${r.newDelayed.length})</b>`);
    for (const t of r.newDelayed.slice(0, 10))
      lines.push(`· <code>${esc(t.code)}</code> ${esc(t.name)} — hạn ${t.endDate} (${pct(t.progressPercent)})`);
  }
  lines.push("", `Tổng cộng <b>${r.totalDelayed}</b> việc đang trễ`);
  if (appUrl) lines.push(`<a href="${appUrl}">→ Mở XBoss Dashboard</a>`);
  return lines.join("\n").slice(0, 4000);
}

export function weeklyToHtml(r: WeeklyReport, appUrl?: string): string {
  const th = `style="padding:6px 8px;text-align:left;background:#f4f4f5;font-size:12px;color:#555"`;
  const td = `style="padding:6px 8px;border-bottom:1px solid #eee"`;
  const completedRows = r.completed.length
    ? r.completed.map((t) => `<tr><td ${td}><code>${esc(t.code)}</code></td><td ${td}>${esc(t.name)}</td>
        <td ${td}>${esc(t.sheetType)}${t.floorLabel ? ` · ${esc(t.floorLabel)}` : ""}</td><td ${td}>${t.day}</td></tr>`).join("")
    : `<tr><td colspan="4" style="padding:8px;color:#888">Không có</td></tr>`;
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#222;max-width:720px;margin:0 auto">
  <h2 style="margin:16px 0 4px">📅 XBoss — Báo cáo tuần ${r.weekFrom} → ${r.date}</h2>
  <p style="margin:0 0 16px;color:#666">${esc(r.projectName ?? "XBoss")} · <b style="color:#16a34a">${r.completed.length}</b> hoàn thành trong tuần
  · <b style="color:#c00">${r.newDelayed.length}</b> trễ mới · tổng ${r.totalDelayed} đang trễ</p>

  <h3 style="margin:16px 0 8px">📊 Tiến độ theo hệ (so với tuần trước)</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Sheet</th><th ${th}>Tổng task</th><th ${th}>Tuần trước</th><th ${th}>Hiện tại</th><th ${th}>Xu hướng</th><th ${th}>Đang trễ</th></tr>
    ${r.kpi.map((k) => `<tr>
      <td ${td}>${esc(k.sheetType)}</td><td ${td}>${k.total}</td>
      <td ${td}>${pct(k.avgProgressPrev)}</td><td ${td}><b>${pct(k.avgProgress)}</b></td>
      <td ${td};color:#059669>${trend(k.avgProgressPrev, k.avgProgress)}</td>
      <td ${td};color:${k.delayed > 0 ? "#c00" : "#16a34a"}>${k.delayed}</td>
    </tr>`).join("")}
  </table>

  <h3 style="margin:20px 0 8px">✅ Hoàn thành trong tuần (${r.completed.length})</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Mã</th><th ${th}>Công việc</th><th ${th}>Hệ · Tầng</th><th ${th}>Ngày đạt 100%</th></tr>
    ${completedRows}
  </table>

  <h3 style="margin:20px 0 8px">🆕 Trễ mới phát sinh trong tuần (${r.newDelayed.length})</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Mã</th><th ${th}>Công việc</th><th ${th}>Hệ · Tầng</th><th ${th}>Hạn</th><th ${th}>%</th></tr>
    ${rowsHtml(r.newDelayed)}
  </table>

  <h3 style="margin:20px 0 8px">⏰ Trễ lâu nhất (top ${r.topDelayed.length})</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Mã</th><th ${th}>Công việc</th><th ${th}>Hệ · Tầng</th><th ${th}>Hạn</th><th ${th}>%</th></tr>
    ${rowsHtml(r.topDelayed)}
  </table>

  ${appUrl ? `<p style="margin:20px 0"><a href="${appUrl}" style="color:#059669">→ Mở XBoss Dashboard</a></p>` : ""}
  <p style="color:#999;font-size:11px;margin-top:24px">Email tự động từ XBoss — báo cáo tuần</p>
  </body></html>`;
}

export function reportToHtml(r: DailyReport, appUrl?: string): string {
  const th = `style="padding:6px 8px;text-align:left;background:#f4f4f5;font-size:12px;color:#555"`;
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#222;max-width:720px;margin:0 auto">
  <h2 style="margin:16px 0 4px">🏗️ XBoss — Báo cáo trễ hạn ${r.date}</h2>
  <p style="margin:0 0 16px;color:#666">${esc(r.projectName ?? "XBoss")} · Tổng cộng <b style="color:#c00">${r.totalDelayed}</b> công việc đang trễ
  · <b>${r.newDelayed.length}</b> mới quá hạn trong 24h</p>

  <h3 style="margin:16px 0 8px">📊 KPI theo hệ</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Sheet</th><th ${th}>Tổng task</th><th ${th}>Tiến độ TB</th><th ${th}>Đang trễ</th></tr>
    ${r.kpi.map((k) => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(k.sheetType)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${k.total}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${pct(k.avgProgress)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:${k.delayed > 0 ? "#c00" : "#16a34a"}">${k.delayed}</td>
    </tr>`).join("")}
  </table>

  <h3 style="margin:20px 0 8px">🆕 Mới quá hạn trong 24h (${r.newDelayed.length})</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Mã</th><th ${th}>Công việc</th><th ${th}>Hệ · Tầng</th><th ${th}>Hạn</th><th ${th}>%</th></tr>
    ${rowsHtml(r.newDelayed)}
  </table>

  <h3 style="margin:20px 0 8px">⏰ Trễ lâu nhất (top ${r.topDelayed.length})</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Mã</th><th ${th}>Công việc</th><th ${th}>Hệ · Tầng</th><th ${th}>Hạn</th><th ${th}>%</th></tr>
    ${rowsHtml(r.topDelayed)}
  </table>

  <h3 style="margin:20px 0 8px">⏳ Sắp đến hạn ≤3 ngày, tiến độ &lt;70% (${r.dueSoon.length})</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>Mã</th><th ${th}>Công việc</th><th ${th}>Hệ · Tầng</th><th ${th}>Hạn</th><th ${th}>%</th></tr>
    ${rowsHtml(r.dueSoon)}
  </table>

  ${appUrl ? `<p style="margin:20px 0"><a href="${appUrl}" style="color:#059669">→ Mở XBoss Dashboard</a></p>` : ""}
  <p style="color:#999;font-size:11px;margin-top:24px">Email tự động từ XBoss · trạng thái: ${Object.values(STATUS_LABEL as Record<StatusSlug, string>).join(" / ")}</p>
  </body></html>`;
}
