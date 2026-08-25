"use client";

import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle } from "lucide-react";
import type { DelayParetoRow } from "@/lib/tien-do/schedule-control";

/**
 * Biểu đồ Pareto nguyên nhân trễ — bấm thanh để lọc bảng trễ theo lý do.
 *
 * Trước đây khối này chép giống hệt nhau ở `app/progress/[system]/page.tsx` và
 * `app/schedule-control/page.tsx` (chỉ khác tên biến nguồn dữ liệu và tiêu đề), kèm
 * hai bản `maxParetoCount`/`totalDelayed` tính y hệt. Nay tính luôn trong component
 * để nơi gọi không phải nhớ.
 *
 * Lưu ý: `app/schedule/page.tsx` cũng vẽ Pareto nhưng là bản KHÁC — chỉ hiển thị,
 * không bấm lọc được, bố cục dọc. Cố ý không gộp vào đây: ép chung một component sẽ
 * phải thêm cờ bật/tắt tương tác và làm hỏng cả hai.
 */
export default function ParetoLyDoTre({
  rows,
  soViecTre,
  reasonFilter,
  setReasonFilter,
  tieuDe = "Nguyên nhân trễ",
}: {
  rows: DelayParetoRow[];
  /** Tổng số việc đang trễ — mẫu số để tính tỷ lệ phần trăm mỗi lý do. */
  soViecTre: number;
  /** Lý do đang lọc; `null`/rỗng = không lọc. */
  reasonFilter: string | null;
  setReasonFilter: Dispatch<SetStateAction<string | null>>;
  tieuDe?: string;
}) {
  if (rows.length === 0) return null;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <h2 className="text-sm font-semibold text-zinc-200">{tieuDe}</h2>
      </div>
      <p className="text-xs text-zinc-400 mb-4">Bấm thanh để lọc bảng trễ theo lý do</p>
      <div className="space-y-2">
        {rows.map((r) => {
          const slugKey = r.slug ?? "__none";
          const active = reasonFilter === slugKey;
          return (
            <button
              key={slugKey}
              onClick={() => setReasonFilter((f) => (f === slugKey ? "" : slugKey))}
              aria-pressed={active}
              className={`w-full flex items-center gap-3 group transition ${active ? "opacity-100" : reasonFilter ? "opacity-40" : ""}`}
            >
              <span
                className="text-xs text-zinc-400 w-24 sm:w-32 text-right shrink-0 truncate"
                title={r.label}
              >
                {r.label}
              </span>
              <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${r.slug ? "bg-amber-500/70 group-hover:bg-amber-400" : "bg-zinc-600 group-hover:bg-zinc-500"}`}
                  style={{ width: `${(r.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-zinc-300 w-20 text-left shrink-0 tabular-nums">
                {r.count}{" "}
                <span className="text-zinc-400">
                  ({soViecTre > 0 ? Math.round((r.count / soViecTre) * 100) : 0}%)
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
