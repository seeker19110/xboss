"use client";
import { useMemo, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { formatDateVN, daysOverdue } from "@/lib/date";
import { DELAY_REASON_LABEL } from "@/lib/delay";
import { groupDelayedTasks, type DelayedTaskLike, type ReasonCount } from "@/lib/delayed-groups";

// Công tác trễ tối thiểu để bảng render được (mở rộng từ DelayedTaskLike).
type TaskRow = DelayedTaskLike & {
  id: number;
  name: string;
  code?: string;
  sheetSlug?: string | null;
  delayNote?: string | null;
};

type Props<T extends TaskRow> = {
  tasks: T[];
  /** Map mã sheet → tên hiển thị cho tên hạng mục. */
  sheetLabel?: (sheetType: string) => string;
  /** Link mở công tác trên lưới tracking; trả null nếu không có. */
  taskHref?: (t: T) => string | null;
  /** Hiện mã Excel (t.code) trước tên công tác. */
  showTaskCode?: boolean;
  /** Cho sửa lý do trễ (dashboard) — có thì render ô select thay vì text. */
  editReason?: { canEdit: boolean; onChange: (taskId: number, reason: string) => void };
  /** Danh mục nguyên nhân trễ (đọc từ code_lists qua getList('delay_reason')); không
   * truyền thì fallback về hằng DELAY_REASON_LABEL tĩnh. */
  delayReasons?: { code: string; label: string }[];
  /** Tiến độ trung bình TOÀN BỘ công tác mỗi hạng mục (khoá `delayedGroupKey`) — không
   * truyền thì cột "Tiến độ TB" tạm suy từ trung bình các công tác trễ trong nhóm. */
  groupProgress?: Map<string, number>;
  today?: string;
  emptyMessage?: React.ReactNode;
};

type ReasonOption = { code: string; label: string };
type ReasonLabelFn = (slug: string | null) => string | null;

// Danh mục nguyên nhân trễ: ưu tiên prop (từ code_lists) → fallback hằng tĩnh.
function toReasonOptions(delayReasons?: ReasonOption[]): ReasonOption[] {
  return (
    delayReasons ?? Object.entries(DELAY_REASON_LABEL).map(([code, label]) => ({ code, label }))
  );
}

function buildReasonLabel(options: ReasonOption[]): ReasonLabelFn {
  const map = new Map(options.map((o) => [o.code, o.label]));
  return (slug) => (slug ? (map.get(slug) ?? slug) : null);
}

// Tóm tắt lý do trễ của cả nhóm: "Chờ vật tư (3), Nhân lực (1)…" — ưu tiên đã gán trước.
function ReasonsSummary({
  reasons,
  reasonLabel,
}: {
  reasons: ReasonCount[];
  reasonLabel: ReasonLabelFn;
}) {
  const assigned = reasons.filter((r) => r.reason);
  const none = reasons.find((r) => !r.reason);
  if (assigned.length === 0) return <span className="text-zinc-500">— Chưa gán —</span>;
  const shown = assigned.slice(0, 2);
  const extra = assigned.length - shown.length;
  return (
    <span className="text-amber-300">
      {shown.map((r) => `${reasonLabel(r.reason)} (${r.count})`).join(", ")}
      {extra > 0 && <span className="text-zinc-400"> +{extra} khác</span>}
      {none && <span className="text-zinc-500"> · {none.count} chưa gán</span>}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-zinc-800 rounded-full h-1.5 w-16 shrink-0 overflow-hidden">
        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-zinc-300">{pct}%</span>
    </div>
  );
}

export default function DelayedGroupsTable<T extends TaskRow>({
  tasks,
  sheetLabel,
  taskHref,
  showTaskCode,
  editReason,
  delayReasons,
  groupProgress,
  today,
  emptyMessage,
}: Props<T>) {
  const reasonOptions = useMemo(() => toReasonOptions(delayReasons), [delayReasons]);
  const reasonLabel = useMemo(() => buildReasonLabel(reasonOptions), [reasonOptions]);
  const groups = useMemo(
    () => groupDelayedTasks(tasks, { sheetLabel, today, groupProgress }),
    [tasks, sheetLabel, today, groupProgress],
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800/80">
            <th className="text-left px-5 py-3">Hạng mục</th>
            <th className="text-left px-4 py-3">Số công tác</th>
            <th className="text-left px-4 py-3">Hạn sớm nhất</th>
            <th className="text-left px-4 py-3">Trễ (ngày)</th>
            <th className="text-left px-4 py-3 w-32">Tiến độ TB</th>
            <th className="text-left px-4 py-3">Lý do trễ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {groups.map((g) => {
            const isOpen = open.has(g.key);
            const avgPct = Math.round(g.avgProgress * 100);
            return (
              <FragmentGroup key={g.key}>
                <tr
                  className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  onClick={() => toggle(g.key)}
                >
                  <td className="px-5 py-3.5 font-medium max-w-[260px]">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? "Thu gọn công tác trễ" : "Xem công tác trễ"}
                      className="flex items-center gap-1.5 text-left hover:text-emerald-400 transition"
                    >
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 text-zinc-500 transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                      <span className="truncate">{g.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 bg-zinc-800 rounded-md text-[11px] font-medium text-zinc-300 whitespace-nowrap">
                      {g.count} công tác
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums">
                    {formatDateVN(g.earliestEndDate)}
                  </td>
                  <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums font-medium">
                    {g.maxDaysOverdue}
                  </td>
                  <td className="px-4 py-3.5">
                    <ProgressBar pct={avgPct} />
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    <ReasonsSummary reasons={g.reasons} reasonLabel={reasonLabel} />
                  </td>
                </tr>

                {isOpen &&
                  g.tasks.map((t) => {
                    const href = taskHref?.(t) ?? null;
                    const tpct = Math.round((t.progressPercent ?? 0) * 100);
                    return (
                      <tr key={t.id} className="bg-zinc-950/40 text-zinc-300">
                        <td className="pl-11 pr-5 py-2.5 max-w-[260px]">
                          {href ? (
                            <a
                              href={href}
                              title="Mở trên lưới tracking"
                              className="flex items-center gap-1.5 hover:text-emerald-400 transition group"
                            >
                              {showTaskCode && t.code && (
                                <span className="font-mono text-xs text-zinc-500 shrink-0">
                                  {t.code}
                                </span>
                              )}
                              <span className="truncate">{t.name}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 text-zinc-600 group-hover:text-emerald-400 transition" />
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              {showTaskCode && t.code && (
                                <span className="font-mono text-xs text-zinc-500 shrink-0">
                                  {t.code}
                                </span>
                              )}
                              <span className="truncate">{t.name}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-red-400 text-xs whitespace-nowrap tabular-nums">
                          {formatDateVN(t.endDate)}
                        </td>
                        <td className="px-4 py-2.5 text-red-400 text-xs whitespace-nowrap tabular-nums">
                          {daysOverdue(t.endDate, today)}
                        </td>
                        <td className="px-4 py-2.5">
                          <ProgressBar pct={tpct} />
                        </td>
                        <td className="px-4 py-2.5 text-xs" title={t.delayNote ?? undefined}>
                          {editReason?.canEdit ? (
                            <select
                              value={t.delayReason ?? ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => editReason.onChange(t.id, e.target.value)}
                              aria-label="Nguyên nhân trễ"
                              className={`text-xs rounded-md px-2 py-1.5 outline-none border w-full max-w-[160px] transition ${
                                t.delayReason
                                  ? "bg-amber-950 border-amber-900/60 text-amber-200"
                                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                              }`}
                            >
                              <option value="">— Chưa gán —</option>
                              {reasonOptions.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          ) : t.delayReason ? (
                            <span className="text-amber-300">{reasonLabel(t.delayReason)}</span>
                          ) : (
                            <span className="text-zinc-500">— Chưa gán —</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </FragmentGroup>
            );
          })}
          {groups.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-12 text-center text-zinc-400 text-sm">
                {emptyMessage ?? "Không có công việc trễ."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Nhóm nhiều <tr> chung một key mà không chèn DOM wrapper (giữ cấu trúc bảng hợp lệ).
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
