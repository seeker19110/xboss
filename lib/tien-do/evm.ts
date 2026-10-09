// lib/evm.ts — EVM chuẩn (M47 PR1): PV/EV/AC → SPI/CPI/EAC.
//
// 3 chân dữ liệu đều có sẵn:
//   - PV (Planned Value): nội suy tuyến tính start→end từng task (cùng cách với
//     S-curve /api/dashboard/scurve) × giá trị task; có baseline → dùng ngày đã chốt.
//   - EV (Earned Value): % thực tế của task (hiện tại từ tasks.progress_percent,
//     chuỗi ngày tái dựng từ task_history) × giá trị task.
//   - AC (Actual Cost): cộng dồn payment_bills ĐÃ CHI (pay_status='paid', M129) theo ngày
//     chi paid_at (mặc định — "thực chi" nhất quán lib/cost.ts, MỌI type kể cả advance)
//     hoặc cash_transactions chi (source="cash"). Phiếu đã duyệt chưa chi không vào AC.
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
// nhiều bước nên không tích luỹ sai số float) — chỉ để VẼ (hình học xấp xỉ, A3-FR06 cho
// phép), mọi con số tóm tắt (summary) đều exact.
//
// QUALITY-FINAL-1 S10c — summary exact hoàn toàn bằng bigint:
//   - tiền trong summary là MoneyMinor (bigint đồng×100) tới biên DTO (route đổi wire);
//   - tỷ lệ kế hoạch = số ngày đã trôi / số ngày kế hoạch (hữu tỉ exact, `mulRatio`);
//   - % thực tế `progress_percent` là float8 legacy → đọc `::numeric::text` (15 chữ số có nghĩa,
//     cùng quy ước float8→numeric của PostgreSQL) rồi nhân hữu tỉ exact — không còn
//     `mulRate(Number(v) × rate)` (mất xu khi giá trị lớn);
//   - SPI/CPI = phép chia bigint làm tròn 3 chữ số (ties xa 0) rồi mới ra number;
//     EAC = AC + (BAC − EV) × AC / EV exact (không qua 1/CPI float).
import { query, todayISO } from "@/lib/db";
import { addMoney, mulRatio, parseMoney } from "@/lib/nen/money";

export type EvmSource = "bills" | "cash";

export type EvmPoint = {
  date: string;
  pv: number | null; // đồng — null khi không có task nào đủ ngày BĐ/KT
  ev: number | null; // đồng — null sau hôm nay
  ac: number | null; // đồng — null sau hôm nay
};

// Tiền: MoneyMinor (bigint đồng×100) — route đổi wire qua `EVM_MONEY_FIELDS` (S10c).
export type EvmSummary = {
  hasValues: boolean; // có ít nhất 1 task gắn giá trị BOQ — false thì mọi chỉ số tiền null
  valuedTasks: number;
  totalTasks: number;
  bac: bigint | null; // Budget At Completion = Σ giá trị task
  pv: bigint | null;
  ev: bigint | null;
  ac: bigint; // tiền thật đã chi — luôn có kể cả khi chưa map BOQ
  sv: bigint | null; // EV − PV
  cv: bigint | null; // EV − AC
  spi: number | null; // EV / PV — tính được cả khi chưa map BOQ (trọng số đều)
  cpi: number | null; // EV / AC
  eac: bigint | null; // AC + (BAC − EV) / CPI
  etc: bigint | null; // EAC − AC
  vac: bigint | null; // BAC − EAC
};

/** Các trường tiền của summary — route đổi sang wire, SPI/CPI/đếm giữ number. */
export const EVM_MONEY_FIELDS = [
  "bac",
  "pv",
  "ev",
  "ac",
  "sv",
  "cv",
  "eac",
  "etc",
  "vac",
] as const satisfies readonly (keyof EvmSummary)[];

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

/** Tỷ lệ hữu tỉ exact num/den (den > 0). */
type TyLe = { num: bigint; den: bigint };

/** Cùng công thức `plannedRatio` nhưng exact: số ngày đã trôi / số ngày kế hoạch, clamp 0..1. */
export function plannedRatioExact(startISO: string, endISO: string, atMs: number): TyLe {
  const s = toMs(startISO),
    e = toMs(endISO);
  if (e <= s) return { num: atMs >= e ? 1n : 0n, den: 1n };
  const troi = Math.min(e - s, Math.max(0, atMs - s));
  return { num: BigInt(troi), den: BigInt(e - s) };
}

/** Chuỗi thập phân (vd `progress_percent::numeric::text`) → tỷ lệ hữu tỉ exact; null → 0. */
export function tyLeTuThapPhan(text: string | null): TyLe {
  if (text == null) return { num: 0n, den: 1n };
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new TypeError("evm: tỷ lệ thập phân không hợp lệ");
  const frac = m[3] ?? "";
  const num = BigInt(m[2] + frac);
  return { num: m[1] === "-" ? -num : num, den: 10n ** BigInt(frac.length) };
}

/** a/b làm tròn 3 chữ số (ties xa 0) bằng bigint rồi mới ra number — cho SPI/CPI. */
function tySo3(a: bigint, b: bigint): number {
  return Number(mulRatio(a, 1000n, b)) / 1000;
}

type TaskRow = {
  id: number;
  startDate: string | null;
  endDate: string | null;
  progress: number | null;
  progressText: string | null; // progress_percent::numeric::text — tỷ lệ exact cho summary
  valueText: string | null; // Σ(weight × thành tiền BOQ) từ SQL, ::text để parseMoney
};

// Trần số điểm của chuỗi — cùng cơ chế bước nhảy với S-curve.
const MAX_POINTS = 1000;

// projectId BẮT BUỘC (QUALITY-FINAL-1 S02, A1-AC02): trước đây null/undefined = bỏ lọc dự
// án → tính EVM gộp mọi dự án/tổ chức. Caller không có dự án khả kiến phải tự trả rỗng.
export async function getEvmSeries(opts: {
  projectId: number;
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

  // Lọc dự án VÔ ĐIỀU KIỆN qua tháp của sheet (fail-closed, không còn nhánh toàn hệ).
  const conds: string[] = ["tw.project_id = ?"];
  const args: unknown[] = [opts.projectId];
  if (opts.systemId != null) {
    conds.push("st.system_id = ?");
    args.push(opts.systemId);
  }
  const projectJoin = "JOIN towers tw ON tw.id = st.tower_id";
  const where = `WHERE ${conds.join(" AND ")}`;

  // Giá trị task tổng trong SQL (M45): dòng VO chỉ tính khi đã duyệt, lấy qty_approved.
  // COALESCE(t.start_date/end_date, wp....): task NULL = kế thừa ngày nhóm (lib/recompute.ts)
  // — PV (kế hoạch) phải nội suy theo ngày HIỆU LỰC, không phải cột thô (có thể NULL).
  const tasks = await query<TaskRow>(
    `SELECT t.id, COALESCE(t.start_date, wp.start_date) AS "startDate",
            COALESCE(t.end_date, wp.end_date) AS "endDate",
            t.progress_percent AS progress,
            t.progress_percent::numeric::text AS "progressText", v.value_text AS "valueText"
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
            WHERE ct.direction = 'out' AND ct.project_id = ?
            GROUP BY ct.tx_date ORDER BY ct.tx_date`,
          opts.projectId,
        )
      : await query<{ day: string; cum: string }>(
          // Quy hệ/dự án qua sheet_types như lib/cost.ts — bill chưa gắn sheet không vào
          // được AC dự án nào (cùng giới hạn đã chấp nhận ở M2; không còn nhánh toàn hệ).
          `SELECT COALESCE(pb.paid_at, pb.paid_date) AS day,
                  SUM(SUM(pb.amount)) OVER (ORDER BY COALESCE(pb.paid_at, pb.paid_date))::text AS cum
             FROM payment_bills pb
             JOIN sheet_types st ON st.id = pb.sheet_type_id
             ${projectJoin}
             ${where} AND pb.pay_status = 'paid'
            GROUP BY 1 ORDER BY 1`,
          ...args,
        );
  const acTotal = acRows.length > 0 ? parseMoney(acRows[acRows.length - 1].cum) : 0n;

  // ===== Summary tại hôm nay (exact bằng bigint — S10c) =====
  const today = todayISO();
  const todayMs = toMs(today);
  const planned = tasks.filter((t) => t.startDate && t.endDate);
  const nhanTyLe = (v: bigint, r: TyLe) => mulRatio(v, r.num, r.den);
  const pvSum = addMoney(
    ...planned.map((t) =>
      nhanTyLe(valueOf.get(t.id)!, plannedRatioExact(t.startDate!, t.endDate!, todayMs)),
    ),
  );
  const evSum = addMoney(
    ...tasks.map((t) => nhanTyLe(valueOf.get(t.id)!, tyLeTuThapPhan(t.progressText))),
  );
  const bac = addMoney(...tasks.map((t) => valueOf.get(t.id)!));

  const spi = planned.length > 0 && pvSum > 0n ? tySo3(evSum, pvSum) : null;
  const cpi = hasValues && acTotal > 0n ? tySo3(evSum, acTotal) : null;
  // EAC = AC + (BAC − EV) / CPI với CPI = EV / AC chưa làm tròn ⇒ AC + (BAC − EV) × AC / EV —
  // một phép nhân-chia hữu tỉ exact (không tích luỹ sai số làm tròn của CPI vào tiền).
  const eac =
    hasValues && acTotal > 0n && evSum > 0n
      ? addMoney(acTotal, mulRatio(bac - evSum, acTotal, evSum))
      : null;

  const summary: EvmSummary = {
    hasValues,
    valuedTasks: valued.length,
    totalTasks: tasks.length,
    bac: hasValues ? bac : null,
    pv: hasValues ? pvSum : null,
    ev: hasValues ? evSum : null,
    ac: acTotal,
    sv: hasValues ? evSum - pvSum : null,
    cv: hasValues ? evSum - acTotal : null,
    spi,
    cpi,
    eac,
    etc: eac != null ? eac - acTotal : null,
    vac: eac != null ? bac - eac : null,
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
    let acCur = 0n; // AC luỹ kế exact (bigint đồng×100) tới điểm đang xét

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
          acCur = parseMoney(acRows[acPtr].cum);
          acPtr++;
        }
        // Làm tròn tới đồng bằng bigint rồi mới ra number (điểm vẽ, đồng nguyên).
        ac = Number(mulRatio(acCur, 1n, 100n));
      }

      series.push({ date: d, pv, ev, ac });
      if (ms >= toMs(to)) break;
    }
  }

  return { series, summary, from, to, today };
}
