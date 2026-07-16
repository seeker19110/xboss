// lib/evm.ts — EVM chuẩn (M47 PR1): PV/EV/AC → SPI/CPI/EAC.
//
// 3 chân dữ liệu đều có sẵn:
//   - PV (Planned Value): nội suy tuyến tính start→end từng task (cùng cách với
//     S-curve /api/dashboard/scurve) × giá trị task; có baseline → dùng ngày đã chốt.
//   - EV (Earned Value): % thực tế của task (hiện tại từ tasks.progress_percent,
//     chuỗi ngày tái dựng từ task_history) × giá trị task.
//   - AC (Actual Cost): cộng dồn payment_bills theo paid_date (mặc định — "thực chi"
//     nhất quán lib/cost.ts, MỌI type kể cả advance) hoặc cash_transactions chi
//     (source="cash").
//
// Giá trị task = Σ(weight × thành tiền dòng BOQ) qua boq_task_map (dòng VO chỉ tính
// khi đã duyệt, lấy qty_approved — nhất quán budgetBySystem lib/cost.ts). Task chưa
// map BOQ → trọng số đều = trung bình giá trị các task đã có (ghi rõ giả định trên
// UI). Không có task nào gắn giá trị → chỉ tính được SPI theo trọng số đều, mọi chỉ
// số tiền trả null (UI hiện hướng dẫn map BOQ).
//
// Quy ước tiền (M45 PR1): tổng/tích tiền làm trong SQL, cast ::text → lib/money.ts
// (bigint đồng×100) khi buộc tính tiếp ở JS. Riêng CHUỖI điểm vẽ chart: mỗi điểm là
// tích giá-trị-đã-tổng-từ-SQL × tỷ lệ, tính độc lập từng điểm (không cộng dồn qua
// nhiều bước nên không tích luỹ sai số float) — chỉ để hiển thị, mọi con số tóm tắt
// (summary) đều đi qua money.ts.
import { query, todayISO } from "@/lib/db";
import { addMoney, moneyToNumber, mulRate, parseMoney } from "@/lib/money";

export type EvmSource = "bills" | "cash";

export type EvmPoint = {
  date: string;
  pv: number | null; // đồng — null khi không có task nào đủ ngày BĐ/KT
  ev: number | null; // đồng — null sau hôm nay
  ac: number | null; // đồng — null sau hôm nay
};

export type EvmSummary = {
  hasValues: boolean; // có ít nhất 1 task gắn giá trị BOQ — false thì mọi chỉ số tiền null
  valuedTasks: number;
  totalTasks: number;
  bac: number | null; // Budget At Completion = Σ giá trị task (đồng)
  pv: number | null;
  ev: number | null;
  ac: number; // tiền thật đã chi — luôn có kể cả khi chưa map BOQ
  sv: number | null; // EV − PV
  cv: number | null; // EV − AC
  spi: number | null; // EV / PV — tính được cả khi chưa map BOQ (trọng số đều)
  cpi: number | null; // EV / AC
  eac: number | null; // AC + (BAC − EV) / CPI
  etc: number | null; // EAC − AC
  vac: number | null; // BAC − EAC
};

const DAY_MS = 86400_000;
const toMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Tỷ lệ kế hoạch đã trôi của 1 task tại thời điểm atMs (nội suy tuyến tính start→end,
// clamp 0..1) — cùng công thức với S-curve/SPI. Hàm thuần, test trực tiếp.
export function plannedRatio(startISO: string, endISO: string, atMs: number): number {
  const s = toMs(startISO),
    e = toMs(endISO);
  if (e <= s) return atMs >= e ? 1 : 0;
  return Math.min(1, Math.max(0, (atMs - s) / (e - s)));
}

type TaskRow = {
  id: number;
  startDate: string | null;
  endDate: string | null;
  progress: number | null;
  valueText: string | null; // Σ(weight × thành tiền BOQ) từ SQL, ::text để parseMoney
};

// Trần số điểm của chuỗi — cùng cơ chế bước nhảy với S-curve.
const MAX_POINTS = 1000;

export async function getEvmSeries(opts: {
  projectId?: number | null;
  baselineId?: number | null;
  systemId?: number | null;
  source?: EvmSource;
}): Promise<{
  series: EvmPoint[];
  summary: EvmSummary;
  from: string;
  to: string;
  today: string;
} | null> {
  const source: EvmSource = opts.source ?? "bills";
  if (source === "cash" && opts.systemId != null)
    throw new Error("Nguồn quỹ tiền mặt không gắn với hệ — bỏ lọc hệ hoặc dùng nguồn thực chi");

  const conds: string[] = [];
  const args: unknown[] = [];
  if (opts.systemId != null) {
    conds.push("st.system_id = ?");
    args.push(opts.systemId);
  }
  const projectJoin = opts.projectId != null ? "JOIN towers tw ON tw.id = st.tower_id" : "";
  if (opts.projectId != null) {
    conds.push("tw.project_id = ?");
    args.push(opts.projectId);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  // Giá trị task tổng trong SQL (M45): dòng VO chỉ tính khi đã duyệt, lấy qty_approved.
  const tasks = await query<TaskRow>(
    `SELECT t.id, t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS progress, v.value_text AS "valueText"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
       LEFT JOIN (
         SELECT m.task_id,
                SUM(m.weight * CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
                                    ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END)::text AS value_text
           FROM boq_task_map m
           JOIN boq_items bi ON bi.id = m.boq_item_id
           LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
          WHERE bi.vo_id IS NULL OR vo.status IN ('approved','partially_approved','contract_added')
          GROUP BY m.task_id
       ) v ON v.task_id = t.id
       ${where}`,
    ...args,
  );
  if (tasks.length === 0) return null;

  // Ngày kế hoạch từ baseline đã chốt (nếu chọn) — task tạo sau baseline giữ ngày hiện tại.
  if (opts.baselineId != null) {
    const blDates = await query<{
      taskId: number;
      startDate: string | null;
      endDate: string | null;
    }>(
      `SELECT task_id AS "taskId", start_date AS "startDate", end_date AS "endDate"
         FROM baseline_tasks WHERE baseline_id = ?`,
      opts.baselineId,
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

  // Trọng số giá trị: task đã map BOQ dùng giá trị thật; task chưa map = trung bình
  // các task có giá trị. Không task nào có giá trị → trọng số đều 1 đồng/task (chỉ
  // còn ý nghĩa cho SPI, mọi chỉ số tiền null).
  const valued = tasks.filter((t) => t.valueText != null);
  const hasValues = valued.length > 0;
  const totalValued = addMoney(...valued.map((t) => parseMoney(t.valueText!)));
  const fallback = hasValues ? totalValued / BigInt(valued.length) : 100n; // 100n = 1 đồng×100
  const valueOf = new Map<number, bigint>(
    tasks.map((t) => [t.id, t.valueText != null ? parseMoney(t.valueText) : fallback]),
  );

  // Lịch sử % từng task để tái dựng EV theo ngày (cùng pattern /api/dashboard/scurve).
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
       ${where}
      ORDER BY h.task_id, h.changed_at`,
    ...args,
  );
  const eventsByTask = new Map<number, { day: string; progress: number }[]>();
  for (const h of hist) {
    if (!eventsByTask.has(h.taskId)) eventsByTask.set(h.taskId, []);
    eventsByTask.get(h.taskId)!.push({ day: h.day, progress: h.newProgress ?? 0 });
  }
  const baseProgress = new Map<number, number>();
  for (const h of hist)
    if (!baseProgress.has(h.taskId)) baseProgress.set(h.taskId, h.oldProgress ?? 0);

  // AC cộng dồn theo ngày — SUM + window trong SQL, ::text để giữ chính xác.
  const acRows =
    source === "cash"
      ? await query<{ day: string; cum: string }>(
          `SELECT ct.tx_date AS day,
                  SUM(SUM(ct.amount)) OVER (ORDER BY ct.tx_date)::text AS cum
             FROM cash_transactions ct
            WHERE ct.direction = 'out'${opts.projectId != null ? " AND ct.project_id = ?" : ""}
            GROUP BY ct.tx_date ORDER BY ct.tx_date`,
          ...(opts.projectId != null ? [opts.projectId] : []),
        )
      : await query<{ day: string; cum: string }>(
          // Quy hệ/dự án qua sheet_types như lib/cost.ts — bill chưa gắn sheet chỉ vào
          // được khi không lọc gì (cùng giới hạn đã chấp nhận ở M2).
          `SELECT pb.paid_date AS day,
                  SUM(SUM(pb.amount)) OVER (ORDER BY pb.paid_date)::text AS cum
             FROM payment_bills pb
             ${conds.length > 0 ? "JOIN sheet_types st ON st.id = pb.sheet_type_id" : ""}
             ${projectJoin}
             ${where}
            GROUP BY pb.paid_date ORDER BY pb.paid_date`,
          ...args,
        );
  const acTotal = acRows.length > 0 ? parseMoney(acRows[acRows.length - 1].cum) : 0n;

  // ===== Summary tại hôm nay (mọi phép tiền qua lib/money.ts) =====
  const today = todayISO();
  const todayMs = toMs(today);
  const planned = tasks.filter((t) => t.startDate && t.endDate);
  const pvSum = addMoney(
    ...planned.map((t) =>
      mulRate(valueOf.get(t.id)!, plannedRatio(t.startDate!, t.endDate!, todayMs)),
    ),
  );
  const evSum = addMoney(...tasks.map((t) => mulRate(valueOf.get(t.id)!, t.progress ?? 0)));
  const bac = addMoney(...tasks.map((t) => valueOf.get(t.id)!));

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const spi = planned.length > 0 && pvSum > 0n ? round3(Number(evSum) / Number(pvSum)) : null;
  // CPI chưa làm tròn dùng cho EAC (tránh cộng sai số làm tròn vào con số tiền).
  const cpiRaw = hasValues && acTotal > 0n ? Number(evSum) / Number(acTotal) : null;
  const cpi = cpiRaw != null ? round3(cpiRaw) : null;
  // EAC = AC + (BAC − EV) / CPI — phần chia hệ số làm qua mulRate (bigint half-up).
  const eac =
    cpiRaw != null && cpiRaw > 0 ? addMoney(acTotal, mulRate(bac - evSum, 1 / cpiRaw)) : null;

  const summary: EvmSummary = {
    hasValues,
    valuedTasks: valued.length,
    totalTasks: tasks.length,
    bac: hasValues ? moneyToNumber(bac) : null,
    pv: hasValues ? moneyToNumber(pvSum) : null,
    ev: hasValues ? moneyToNumber(evSum) : null,
    ac: moneyToNumber(acTotal),
    sv: hasValues ? moneyToNumber(evSum - pvSum) : null,
    cv: hasValues ? moneyToNumber(evSum - acTotal) : null,
    spi,
    cpi,
    eac: eac != null ? moneyToNumber(eac) : null,
    etc: eac != null ? moneyToNumber(eac - acTotal) : null,
    vac: eac != null ? moneyToNumber(bac - eac) : null,
  };

  // ===== Chuỗi điểm vẽ chart (chỉ khi có giá trị BOQ — không thì chart tiền vô nghĩa) =====
  const series: EvmPoint[] = [];
  let from = today,
    to = today;
  if (hasValues) {
    const dates: string[] = [];
    for (const t of tasks) {
      if (t.startDate) dates.push(t.startDate);
      if (t.endDate) dates.push(t.endDate);
    }
    for (const h of hist) dates.push(h.day);
    if (acRows.length > 0) dates.push(acRows[0].day);
    if (dates.length > 0) {
      from = dates.reduce((a, b) => (a < b ? a : b));
      to = dates.reduce((a, b) => (a > b ? a : b));
    }
    if (to < today) to = today;
    if (from > today) from = today;

    const rangeDays = Math.max(1, Math.round((toMs(to) - toMs(from)) / DAY_MS));
    const step = Math.max(1, Math.ceil(rangeDays / MAX_POINTS));

    // Giá trị task ở đơn vị nhỏ dạng number — mỗi điểm là tích/tổng độc lập chỉ để vẽ.
    const valueNum = new Map<number, number>([...valueOf].map(([id, v]) => [id, Number(v)]));
    const evPtr = new Map<number, number>(); // con trỏ sự kiện từng task (điểm đi xuôi thời gian)
    const evCur = new Map<number, number>(); // % hiện hành của task tại điểm đang xét
    for (const t of tasks)
      evCur.set(t.id, eventsByTask.has(t.id) ? (baseProgress.get(t.id) ?? 0) : (t.progress ?? 0));
    let acPtr = 0;
    let acCur: number | null = null;

    for (let ms = toMs(from); ; ms += step * DAY_MS) {
      if (ms > toMs(to)) ms = toMs(to);
      const d = toISO(ms);

      let pv: number | null = null;
      if (planned.length > 0) {
        let sum = 0;
        for (const t of planned)
          sum += valueNum.get(t.id)! * plannedRatio(t.startDate!, t.endDate!, ms);
        pv = Math.round(sum / 100);
      }

      let ev: number | null = null;
      let ac: number | null = null;
      if (d <= today) {
        let sum = 0;
        for (const t of tasks) {
          const events = eventsByTask.get(t.id);
          if (events) {
            let i = evPtr.get(t.id) ?? 0;
            while (i < events.length && events[i].day <= d) {
              evCur.set(t.id, events[i].progress);
              i++;
            }
            evPtr.set(t.id, i);
          }
          sum += valueNum.get(t.id)! * (evCur.get(t.id) ?? 0);
        }
        ev = Math.round(sum / 100);

        while (acPtr < acRows.length && acRows[acPtr].day <= d) {
          acCur = moneyToNumber(parseMoney(acRows[acPtr].cum));
          acPtr++;
        }
        ac = Math.round(acCur ?? 0);
      }

      series.push({ date: d, pv, ev, ac });
      if (ms >= toMs(to)) break;
    }
  }

  return { series, summary, from, to, today };
}
