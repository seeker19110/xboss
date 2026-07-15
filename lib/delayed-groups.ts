import { daysOverdue, todayISO } from "@/lib/date";
import { sortFloorsDesc } from "@/lib/floors";

// Gom danh sách công tác trễ thành "hạng mục trễ" = cặp (sheet, tầng) — cùng cách đếm
// totalDelayed/kpi[].delayed ở API dashboard (nhiều công tác trễ cùng (sheet, tầng) vẫn
// tính 1 hạng mục). Dùng chung cho dashboard, schedule-control, progress/[system] và báo cáo.

// Trường tối thiểu một công tác cần có để gom nhóm.
export type DelayedTaskLike = {
  sheetType: string;
  floorLabel: string | null;
  endDate: string;
  progressPercent: number | null;
  delayReason?: string | null;
};

export type ReasonCount = { reason: string | null; count: number };

export type DelayedGroup<T extends DelayedTaskLike> = {
  key: string;
  sheetType: string;
  floorLabel: string;
  name: string;
  count: number;
  earliestEndDate: string; // hạn sớm nhất trong nhóm (trễ nhiều nhất)
  maxDaysOverdue: number; // số ngày trễ lớn nhất
  avgProgress: number; // 0..1 — tiến độ TOÀN BỘ hạng mục (mọi công tác, không chỉ công tác
  // đang trễ) khi có `groupProgress`; nếu không, tạm suy từ trung bình các công tác trễ.
  reasons: ReasonCount[]; // lý do trễ tổng hợp, sắp giảm dần theo số lượng (null = chưa gán)
  tasks: T[];
};

// Khoá gom nhóm (sheet, tầng) — dùng chung để tra `groupProgress` truyền từ ngoài vào.
export const delayedGroupKey = (sheetType: string, floorLabel: string | null): string =>
  `${sheetType}::${floorLabel ?? ""}`;

/**
 * Gom công tác trễ theo (sheet, tầng). `sheetLabel` map mã sheet → tên hiển thị cho `name`
 * (mặc định dùng luôn mã). `today` để tính số ngày trễ (mặc định hôm nay theo giờ VN).
 * `groupProgress` (tuỳ chọn): map khoá `delayedGroupKey(sheetType, floorLabel)` → tiến độ
 * trung bình của TOÀN BỘ công tác thuộc hạng mục đó (kể cả không trễ) — truyền vào để cột
 * "Tiến độ TB" phản ánh đúng cả hạng mục thay vì chỉ trung bình các công tác đang trễ.
 */
export function groupDelayedTasks<T extends DelayedTaskLike>(
  tasks: T[],
  opts: {
    sheetLabel?: (sheetType: string) => string;
    today?: string;
    groupProgress?: Map<string, number>;
  } = {},
): DelayedGroup<T>[] {
  const today = opts.today ?? todayISO();
  const sheetLabel = opts.sheetLabel ?? ((s: string) => s);
  const map = new Map<string, DelayedGroup<T>>();

  for (const t of tasks) {
    const floorLabel = t.floorLabel ?? "";
    const key = delayedGroupKey(t.sheetType, floorLabel);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        sheetType: t.sheetType,
        floorLabel,
        name: `Thi công ${sheetLabel(t.sheetType)}${floorLabel ? ` tầng ${floorLabel}` : ""}`,
        count: 0,
        earliestEndDate: t.endDate,
        maxDaysOverdue: 0,
        avgProgress: 0,
        reasons: [],
        tasks: [],
      };
      map.set(key, g);
    }
    g.tasks.push(t);
    g.count += 1;
    if (t.endDate < g.earliestEndDate) g.earliestEndDate = t.endDate;
  }

  const reasonOrder = new Map<string, number>(); // giữ thứ tự gặp để ổn định khi cùng count
  for (const g of map.values()) {
    g.maxDaysOverdue = daysOverdue(g.earliestEndDate, today);
    const fullGroupProgress = opts.groupProgress?.get(g.key);
    g.avgProgress =
      fullGroupProgress ??
      g.tasks.reduce((s, t) => s + (t.progressPercent ?? 0), 0) / (g.tasks.length || 1);

    const counts = new Map<string, number>();
    reasonOrder.clear();
    for (const t of g.tasks) {
      const r = t.delayReason ?? "__none";
      counts.set(r, (counts.get(r) ?? 0) + 1);
      if (!reasonOrder.has(r)) reasonOrder.set(r, reasonOrder.size);
    }
    g.reasons = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || reasonOrder.get(a[0])! - reasonOrder.get(b[0])!)
      .map(([r, count]) => ({ reason: r === "__none" ? null : r, count }));
  }

  return [...map.values()].sort(
    (a, b) => a.sheetType.localeCompare(b.sheetType) || sortFloorsDesc(a.floorLabel, b.floorLabel),
  );
}
