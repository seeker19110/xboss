import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  taoDuLieuNgauNhien,
  donDuLieuNgauNhien,
  type DuLieuNgauNhien,
} from "./helpers/du-lieu-tien-do-ngau-nhien";
import { plannedRatio, plannedRatioMs } from "@/lib/tien-do/evm";

// Đợt tối ưu 3 (G2) — báo cáo/S-curve/EVM/matview đổi CÁCH TÍNH cho nhanh nhưng KHÔNG được đổi
// kết quả. Mỗi ca đối chiếu cách mới với một ORACLE là bản sao nguyên văn cách cũ (giữ trong
// test này), chạy trên cùng bộ dữ liệu ngẫu nhiên có hạt giống phủ các ca biên (xem helper).
// Khác biệt CÓ CHỦ ĐÍCH duy nhất: trùng changed_at hoàn toàn (2 dòng lịch sử cùng mốc của 1
// task) — bản cũ phụ thuộc thứ tự quét (không xác định), bản mới tie-break theo id; oracle
// thêm đúng tie-break đó để so khớp xác định.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ctx = {} as DuLieuNgauNhien & {
  userId: number;
  tNullCuoi: number;
  tNuaDem: number;
  ngayD: string;
};

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run, daysFromTodayISO } = await import("@/lib/db");
  Object.assign(ctx, await taoDuLieuNgauNhien(RUN));
  ctx.userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-g2', 'pm', 1)`,
    `G2 ${RUN}`,
    `g2-${RUN}@test.local`,
  );
  // 2 task ca biên tường minh (ngoài dữ liệu ngẫu nhiên) để assert số tay, không chỉ so oracle.
  const wp = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, 'Nhóm biên', 'TB')`,
    ctx.sheetIds[0],
    `WP-BIEN-${RUN}`,
  );
  const taoTask = (code: string, p: number) =>
    insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent) VALUES (?, ?, ?, 'dang_thi_cong', ?)`,
      wp,
      code,
      code,
      p,
    );
  const ghi = (task: number, oldP: number | null, newP: number | null, luc: string) =>
    run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, ?, ?, ?)`,
      task,
      oldP,
      newP,
      luc,
    );
  // new_progress NULL ở sự kiện cuối → 0 (bản JS), KHÔNG rơi về old_progress đầu.
  ctx.tNullCuoi = await taoTask(`BIEN-NULL-${RUN}`, 0.9);
  await ghi(ctx.tNullCuoi, 0.3, 0.5, `${daysFromTodayISO(-20)} 10:00:00+07`);
  await ghi(ctx.tNullCuoi, 0.5, null, `${daysFromTodayISO(-10)} 10:00:00+07`);
  // 23:59:59 giờ VN thuộc ngày D, 00:00:00 thuộc ngày D+1.
  ctx.ngayD = daysFromTodayISO(-15);
  ctx.tNuaDem = await taoTask(`BIEN-NUADEM-${RUN}`, 0.8);
  await ghi(ctx.tNuaDem, 0.2, 0.4, `${ctx.ngayD} 23:59:59+07`);
  await ghi(ctx.tNuaDem, 0.4, 0.8, `${daysFromTodayISO(-14)} 00:00:00+07`);
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await donDuLieuNgauNhien(ctx);
  if (ctx.userId) await run(`DELETE FROM users WHERE id = ?`, ctx.userId);
});

// ===== plannedRatioMs ≡ plannedRatio (một công thức) =====
test("plannedRatioMs: trùng khớp từng bit với plannedRatio trên ngày ngẫu nhiên + ca biên", () => {
  const DAY = 86400_000;
  const base = Date.UTC(2026, 0, 1);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 400 - 200;
  for (let i = 0; i < 5000; i++) {
    const s = base + Math.round(rnd()) * DAY;
    const e = i % 7 === 0 ? s : base + Math.round(rnd()) * DAY; // gồm KT = BĐ và KT < BĐ
    const at = base + Math.round(rnd()) * DAY + (i % 3) * 3600_000;
    assert.equal(Object.is(plannedRatioMs(s, e, at), plannedRatio(iso(s), iso(e), at)), true);
  }
});

// ===== progressAtDate (1 query, 2 LATERAL) ≡ 2 query + reconstructProgressAtDate cũ =====
async function progressAtDateCu(
  date: string,
  filter: { systemId?: number; projectId?: number },
): Promise<Map<number, { sheetId: number; sheetType: string; progress: number }>> {
  const { query } = await import("@/lib/db");
  const { reconstructProgressAtDate } = await import("@/lib/tien-do/report");
  const systemFilter = filter.systemId != null ? "AND st.system_id = ?" : "";
  const systemParams = filter.systemId != null ? [filter.systemId] : [];
  const projectJoin = filter.projectId != null ? "JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = filter.projectId != null ? "AND tw.project_id = ?" : "";
  const projectParams = filter.projectId != null ? [filter.projectId] : [];
  const tasks = await query<{ id: number; progress: number; sheetId: number; sheetType: string }>(
    `SELECT t.id, t.progress_percent AS progress, st.id AS "sheetId", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
      WHERE 1=1 ${systemFilter} ${projectFilter}`,
    ...systemParams,
    ...projectParams,
  );
  const hist = await query<{
    taskId: number;
    oldProgress: number | null;
    newProgress: number | null;
    day: string;
  }>(
    `SELECT h.task_id AS "taskId", h.old_progress AS "oldProgress", h.new_progress AS "newProgress",
            (h.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day
       FROM task_history h
       JOIN tasks t ON h.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
      WHERE 1=1 ${systemFilter} ${projectFilter}
      ORDER BY h.task_id, h.changed_at, h.id`,
    ...systemParams,
    ...projectParams,
  );
  const progress = reconstructProgressAtDate(tasks, hist, date);
  return new Map(
    tasks.map((t) => [
      t.id,
      {
        sheetId: t.sheetId,
        sheetType: t.sheetType,
        progress: progress.get(t.id) ?? t.progress ?? 0,
      },
    ]),
  );
}

test(
  "progressAtDate: khớp tuyệt đối bản cũ mọi mốc ngày × bộ lọc (dữ liệu ngẫu nhiên)",
  S,
  async () => {
    const { progressAtDate } = await import("@/lib/tien-do/report");
    const { daysFromTodayISO, todayISO } = await import("@/lib/db");
    const ngays = [
      ctx.ngayNuaDem,
      daysFromTodayISO(-11),
      daysFromTodayISO(-13),
      ctx.ngayD,
      daysFromTodayISO(-14),
      daysFromTodayISO(-7),
      daysFromTodayISO(-30),
      todayISO(),
      "2020-01-01",
      daysFromTodayISO(30),
    ];
    const filters = [
      { projectId: ctx.projectId },
      { projectId: ctx.projectId, systemId: ctx.systemIds[0] },
      { projectId: ctx.projectId, systemId: ctx.systemIds[1] },
    ];
    for (const ngay of ngays)
      for (const f of filters) {
        const moi = await progressAtDate(ngay, f);
        const cu = await progressAtDateCu(ngay, f);
        assert.equal(moi.length, cu.size, `${ngay} ${JSON.stringify(f)}: số task`);
        assert.ok(moi.length > 0);
        for (const r of moi)
          assert.deepEqual(
            { sheetId: r.sheetId, sheetType: r.sheetType, progress: r.progress },
            cu.get(r.taskId),
            `${ngay} task ${r.taskId}`,
          );
      }
  },
);

test(
  "progressAtDate: số tay — new_progress NULL cuối → 0; 23:59:59 / 00:00:00 giờ VN",
  S,
  async () => {
    const { progressAtDate } = await import("@/lib/tien-do/report");
    const { daysFromTodayISO } = await import("@/lib/db");
    const giaTri = async (ngay: string, task: number) =>
      (await progressAtDate(ngay, { projectId: ctx.projectId })).find((r) => r.taskId === task)
        ?.progress;
    assert.equal(await giaTri(daysFromTodayISO(-25), ctx.tNullCuoi), 0.3); // trước sự kiện đầu
    assert.equal(await giaTri(daysFromTodayISO(-15), ctx.tNullCuoi), 0.5);
    assert.equal(await giaTri(daysFromTodayISO(-5), ctx.tNullCuoi), 0); // NULL → 0, không phải 0.3
    assert.equal(await giaTri(daysFromTodayISO(-16), ctx.tNuaDem), 0.2);
    assert.equal(await giaTri(ctx.ngayD, ctx.tNuaDem), 0.4); // 23:59:59 thuộc ngày D
    assert.equal(await giaTri(daysFromTodayISO(-14), ctx.tNuaDem), 0.8); // 00:00:00 thuộc D+1
  },
);

// ===== S-curve (nhánh tái dựng từ task_history) ≡ thuật toán cũ =====
// Bản sao nguyên văn route cũ (trước đợt G2): plannedRatio parse chuỗi mỗi điểm × task, đường
// thực tế quét lại sự kiện từ đầu ở mỗi điểm. Chỉ dùng cho nhánh KHÔNG đọc MV.
async function scurveCu(qs: URLSearchParams) {
  const { query, todayISO } = await import("@/lib/db");
  const sheet = qs.get("sheet");
  const systemId = sheet ? null : qs.get("system") ? ctx.systemIds[0] : null;
  const baselineId = qs.get("baseline") ? Number(qs.get("baseline")) : null;
  const sheetFilter = sheet ? `AND st.code = ?` : systemId !== null ? `AND st.system_id = ?` : "";
  const params = sheet ? [sheet] : systemId !== null ? [systemId] : [];
  const projectJoin = "JOIN towers tw ON tw.id = st.tower_id";
  const projectFilter = "AND tw.project_id = ?";
  const tasks = await query<{
    id: number;
    startDate: string | null;
    endDate: string | null;
    progress: number;
    sheet: string;
  }>(
    `SELECT t.id, COALESCE(t.start_date, wp.start_date) AS "startDate",
            COALESCE(t.end_date, wp.end_date) AS "endDate",
            t.progress_percent AS progress, st.code AS sheet
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
      WHERE 1=1 ${sheetFilter} ${projectFilter}`,
    ...params,
    ctx.projectId,
  );
  if (baselineId != null) {
    const bl = await query<{ taskId: number; startDate: string | null; endDate: string | null }>(
      `SELECT task_id AS "taskId", start_date AS "startDate", end_date AS "endDate"
         FROM baseline_tasks WHERE baseline_id = ?`,
      baselineId,
    );
    const byTask = new Map(bl.map((b) => [b.taskId, b]));
    for (const t of tasks) {
      const b = byTask.get(t.id);
      if (b) {
        t.startDate = b.startDate;
        t.endDate = b.endDate;
      }
    }
  }
  const today = todayISO();
  const hist = await query<{
    taskId: number;
    oldProgress: number | null;
    newProgress: number | null;
    day: string;
  }>(
    `SELECT h.task_id AS "taskId", h.old_progress AS "oldProgress",
            h.new_progress AS "newProgress",
            (h.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day
       FROM task_history h
       JOIN tasks t ON h.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
      WHERE 1=1 ${sheetFilter} ${projectFilter}
      ORDER BY h.task_id, h.changed_at, h.id`,
    ...params,
    ctx.projectId,
  );
  const eventsByTask = new Map<number, { day: string; progress: number }[]>();
  for (const h of hist) {
    if (!eventsByTask.has(h.taskId)) eventsByTask.set(h.taskId, []);
    eventsByTask.get(h.taskId)!.push({ day: h.day, progress: h.newProgress ?? 0 });
  }
  const baselineProgress = new Map<number, number>();
  for (const h of hist)
    if (!baselineProgress.has(h.taskId)) baselineProgress.set(h.taskId, h.oldProgress ?? 0);
  const dates: string[] = [];
  for (const t of tasks) {
    if (t.startDate) dates.push(t.startDate);
    if (t.endDate) dates.push(t.endDate);
  }
  dates.push(...hist.map((h) => h.day));
  let from = dates.reduce((a, b) => (a < b ? a : b));
  let to = dates.reduce((a, b) => (a > b ? a : b));
  if (to < today) to = today;
  if (from > today) from = today;
  const DAY_MS = 86400_000;
  const toDate = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
  const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const rangeDays = Math.max(1, Math.round((toDate(to) - toDate(from)) / DAY_MS));
  const step = Math.max(1, Math.ceil(rangeDays / 1000));
  const planned = tasks.filter((t) => t.startDate && t.endDate);
  const points: { date: string; planned: number | null; actual: number | null }[] = [];
  for (let ms = toDate(from); ; ms += step * DAY_MS) {
    if (ms > toDate(to)) ms = toDate(to);
    const d = toISO(ms);
    let plannedPct: number | null = null;
    if (planned.length > 0) {
      let sum = 0;
      for (const t of planned) sum += plannedRatio(t.startDate!, t.endDate!, ms);
      plannedPct = sum / planned.length;
    }
    let actualPct: number | null = null;
    if (d <= today) {
      let sum = 0;
      for (const t of tasks) {
        const events = eventsByTask.get(t.id);
        if (!events) {
          sum += t.progress ?? 0;
          continue;
        }
        let p = baselineProgress.get(t.id) ?? 0;
        for (const ev of events) {
          if (ev.day <= d) p = ev.progress;
          else break;
        }
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
  return { points, sheets: [...new Set(tasks.map((t) => t.sheet))].sort(), from, to, today };
}

test(
  "S-curve nhánh tái dựng: khớp tuyệt đối thuật toán cũ (sheet/hệ/toàn dự án × baseline)",
  S,
  async () => {
    const { GET } = await import("@/app/api/dashboard/scurve/route");
    // Toàn dự án/hệ chỉ đi nhánh tái dựng khi MV chưa phủ dự án này — chạy TRƯỚC ca refresh MV
    // bên dưới (dự án vừa tạo, MV chưa có dòng nào của nó → readMvActual trả null).
    const cacQs = [
      `sheet=${ctx.sheetCodes[0]}`,
      `sheet=${ctx.sheetCodes[1]}`,
      `sheet=${ctx.sheetCodes[2]}`,
      `sheet=${ctx.sheetCodes[0]}&baseline=${ctx.baselineId}`,
      `system=${ctx.systemCodes[0]}`,
      ``,
      `baseline=${ctx.baselineId}`,
    ];
    for (const qs of cacQs) {
      await dangNhapDuAn({ id: ctx.userId, passwordHash: "hash-g2" }, ctx.projectId);
      const res = await GET(new NextRequest(`http://localhost/api/dashboard/scurve?${qs}`));
      assert.equal(res.status, 200, qs);
      const moi = await res.json();
      const cu = await scurveCu(new URLSearchParams(qs));
      assert.ok(cu.points.length > 30, `${qs}: dữ liệu đủ dài`);
      assert.deepEqual({ ...moi, sheets: [...moi.sheets].sort() }, cu, qs);
    }
  },
);

// ===== mv_progress_daily (0175, delta + luỹ kế) ≡ định nghĩa 0055 =====
// Thân MV nguyên văn migrations/0055_matviews.sql, chỉ thêm tie-break id ở 2 ORDER BY.
const MV_0055 = `
WITH bounds AS (
  SELECT LEAST(
    (SELECT MIN(start_date) FROM tasks WHERE start_date IS NOT NULL),
    (SELECT MIN((changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) FROM task_history)
  ) AS min_d
),
days AS (
  SELECT generate_series(b.min_d, CURRENT_DATE, interval '1 day')::date AS d
    FROM bounds b WHERE b.min_d IS NOT NULL
),
task_scope AS (
  SELECT t.id AS task_id, t.progress_percent AS current_progress,
         COALESCE(tw.project_id, 0) AS project_id, COALESCE(st.system_id, 0) AS system_id,
         EXISTS (SELECT 1 FROM task_history h WHERE h.task_id = t.id) AS has_history,
         (SELECT h.old_progress FROM task_history h
           WHERE h.task_id = t.id ORDER BY h.changed_at ASC, h.id ASC LIMIT 1) AS first_old_progress
    FROM tasks t
    JOIN work_packages wp ON wp.id = t.package_id
    JOIN sheet_types st ON st.id = wp.sheet_type_id
    LEFT JOIN towers tw ON tw.id = st.tower_id
),
per_task_day AS (
  SELECT d.d AS date, ts.project_id, ts.system_id,
         CASE WHEN NOT ts.has_history THEN ts.current_progress
              ELSE COALESCE(
                (SELECT h.new_progress FROM task_history h
                  WHERE h.task_id = ts.task_id
                    AND (h.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= d.d
                  ORDER BY h.changed_at DESC, h.id DESC LIMIT 1),
                ts.first_old_progress, 0)
         END AS progress
    FROM days d
    CROSS JOIN task_scope ts
)
SELECT project_id, system_id, date,
       AVG(progress) AS avg_progress,
       COUNT(*) FILTER (WHERE progress >= 1) AS done_count,
       COUNT(*) AS total_count
  FROM per_task_day
 GROUP BY project_id, system_id, date`;

test(
  "mv_progress_daily 0175: khớp định nghĩa 0055 từng dòng (NULL, nửa đêm VN, sentinel 0)",
  S,
  async () => {
    const { run, query } = await import("@/lib/db");
    await run(`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_progress_daily`);
    // So trong MỘT câu lệnh (cùng phiên, cùng CURRENT_DATE). Phạm vi: nhóm của dự án test + nhóm
    // sentinel project 0 của hệ C riêng (sheet không tháp) — không đụng dữ liệu file test khác.
    const rows = await query<{
      thieuCu: number;
      thieuMoi: number;
      lechDem: number;
      lechNull: number;
      lechAvg: number | null;
      soDong: number;
      soNhom: number;
    }>(
      `WITH cu AS (SELECT * FROM (${MV_0055}) x
                  WHERE project_id = ? OR (project_id = 0 AND system_id = ?)),
          moi AS (SELECT * FROM mv_progress_daily
                   WHERE project_id = ? OR (project_id = 0 AND system_id = ?))
     SELECT COUNT(*) FILTER (WHERE cu.date IS NULL)::int AS "thieuCu",
            COUNT(*) FILTER (WHERE moi.date IS NULL)::int AS "thieuMoi",
            COUNT(*) FILTER (WHERE cu.done_count IS DISTINCT FROM moi.done_count
                               OR cu.total_count IS DISTINCT FROM moi.total_count)::int AS "lechDem",
            COUNT(*) FILTER (WHERE (cu.avg_progress IS NULL) <> (moi.avg_progress IS NULL))::int AS "lechNull",
            MAX(ABS(cu.avg_progress - moi.avg_progress)) AS "lechAvg",
            COUNT(*)::int AS "soDong",
            COUNT(DISTINCT (project_id, system_id))::int AS "soNhom"
       FROM cu FULL JOIN moi USING (project_id, system_id, date)`,
      ctx.projectId,
      ctx.systemIds[2],
      ctx.projectId,
      ctx.systemIds[2],
    );
    const r = rows[0];
    assert.ok(r.soDong > 100, "phải có đủ dòng để so");
    assert.equal(r.soNhom, 4); // 3 hệ của dự án (A, B, không hệ) + sentinel 0/hệ C
    assert.equal(r.thieuCu, 0);
    assert.equal(r.thieuMoi, 0);
    assert.equal(r.lechDem, 0);
    assert.equal(r.lechNull, 0);
    // Bản cũ cộng float theo thứ tự quét (AVG float8), bản mới cộng NUMERIC rồi mới chia — lệch
    // tối đa vài ulp (đo ≤ 2,3e-16), không phải lệch ngữ nghĩa.
    assert.ok((r.lechAvg ?? 0) < 1e-12, `lệch avg ${r.lechAvg}`);

    // Mẫu số AVG = số task KHÁC NULL, tách khỏi total_count: nhóm "không hệ" (S3) có task không
    // lịch sử progress NULL (k=16) → avg × total ≠ tổng. Khớp bản cũ đã kiểm ở trên; ở đây khẳng
    // định dữ liệu test thật sự phủ ca này (không thì phép so ở trên không chứng minh gì).
    const coNull = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
      WHERE t.progress_percent IS NULL AND wp.sheet_type_id IN (?, ?, ?, ?)
        AND NOT EXISTS (SELECT 1 FROM task_history h WHERE h.task_id = t.id)`,
      ...ctx.sheetIds,
    );
    assert.ok(coNull[0].n > 0, "dữ liệu phải có task progress NULL không lịch sử");
  },
);

// ===== EVM chiTomTat (cron báo cáo ngày) — summary y hệt bản đầy đủ =====
test("getEvmSeries chiTomTat: summary giống hệt bản đầy đủ, bỏ chuỗi điểm", S, async () => {
  const { getEvmSeries } = await import("@/lib/tien-do/evm");
  const { todayISO } = await import("@/lib/db");
  const cacOpts = [
    {},
    { baselineId: ctx.baselineId },
    { systemId: ctx.systemIds[0] },
    { source: "cash" as const },
  ];
  for (const o of cacOpts) {
    const day = await getEvmSeries({ projectId: ctx.projectId, ...o });
    const gon = await getEvmSeries({ projectId: ctx.projectId, ...o, chiTomTat: true });
    assert.ok(day && gon);
    assert.ok(day.series.length > 0, "bản đầy đủ phải có chuỗi điểm (có giá trị BOQ)");
    assert.deepEqual(gon.summary, day.summary, JSON.stringify(o));
    assert.deepEqual(gon.series, []);
    assert.equal(gon.from, todayISO());
    assert.equal(gon.to, todayISO());
  }
});
