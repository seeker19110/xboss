"use client";
import { useEffect, useState } from "react";
import { Activity, ExternalLink } from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { formatDateVN } from "@/lib/date";
import type { CriticalRow } from "@/lib/schedule-control";

// Panel "Nhóm việc trên đường găng" — tách từ trang /schedule-control (M36 PR3) thành
// component dùng chung để nhúng vào Dashboard tổng. Không truyền `critical` → tự fetch
// /api/schedule-control (kèm `system` nếu có); trang /schedule-control truyền thẳng
// data đã fetch sẵn để không gọi API (tính CPM) hai lần.
export default function ScheduleControlPanel({
  critical,
  system = "",
}: {
  critical?: CriticalRow[];
  system?: string;
}) {
  const [fetched, setFetched] = useState<CriticalRow[] | null>(null);
  const selfFetch = critical === undefined;

  useEffect(() => {
    if (!selfFetch) return;
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/schedule-control${qs}`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      setFetched(j?.critical ?? []);
    });
  }, [selfFetch, system]);

  const rows = critical ?? fetched;
  if (!rows) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
        <Activity className="w-4 h-4 text-amber-400 shrink-0" />
        <h2 className="font-semibold text-sm">Nhóm việc trên đường găng</h2>
        <span className="text-xs font-normal text-zinc-400">({rows.length})</span>
        {/* Link sang trang đầy đủ chỉ hiện khi nhúng ở Dashboard (tự fetch) — trên chính
            trang /schedule-control (truyền `critical`) thì thừa. */}
        {selfFetch && (
          <a
            href="/schedule-control"
            className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400 transition shrink-0"
          >
            Đường găng &amp; Chậm tiến độ <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      {/* tabIndex={0} để vùng cuộn ngang truy cập được bằng bàn phím kể cả khi bảng rỗng
          (không có link/ô focus bên trong) — axe scrollable-region-focusable, thấy rõ ở
          mobile khi nhúng panel vào Dashboard tổng. */}
      <div className="overflow-x-auto" tabIndex={0} aria-label="Bảng nhóm việc trên đường găng">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800/80">
              <th className="text-left px-5 py-3">Nhóm việc</th>
              <th className="text-left px-4 py-3">Tầng</th>
              <th className="text-left px-4 py-3">BĐ → KT</th>
              <th className="text-left px-4 py-3 w-32">Tiến độ</th>
              <th className="text-left px-4 py-3">Float (ngày)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.map((c) => {
              const pct = Math.round((c.progress ?? 0) * 100);
              const nearZero = c.float <= 0.5;
              const url = c.sheetSlug
                ? `/gantt?sheet=${encodeURIComponent(c.sheetType)}`
                : "/gantt";
              return (
                <tr
                  key={c.id}
                  className={`hover:bg-zinc-800/40 transition-colors ${nearZero ? "bg-amber-950/30" : ""}`}
                >
                  <td className="px-5 py-3.5 font-medium max-w-[260px]">
                    <a
                      href={url}
                      title="Mở trên Gantt"
                      className="flex items-center gap-1.5 hover:text-emerald-400 transition group"
                    >
                      <span className="font-mono text-xs text-zinc-400 shrink-0">{c.code}</span>
                      <span className="truncate">{c.name}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 text-zinc-600 group-hover:text-emerald-400 transition" />
                    </a>
                  </td>
                  <td className="px-4 py-3.5 text-zinc-400 text-xs whitespace-nowrap">
                    {c.floorLabel || "—"}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-zinc-400 whitespace-nowrap">
                    {formatDateVN(c.startDate)} → {formatDateVN(c.endDate)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="bg-zinc-800 rounded-full h-1.5 w-16 shrink-0 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-zinc-300">{pct}%</span>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3.5 text-xs tabular-nums font-medium ${nearZero ? "text-amber-400" : "text-zinc-300"}`}
                  >
                    {c.float}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-zinc-400 text-sm">
                  Không có nhóm việc nào trên đường găng (cần ít nhất 1 phụ thuộc giữa các nhóm).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
