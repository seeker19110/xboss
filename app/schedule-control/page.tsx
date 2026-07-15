"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Activity, Clock, ExternalLink, Printer } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import { formatDateVN, daysOverdue } from "@/lib/date";
import { DELAY_REASON_LABEL } from "@/lib/delay";
import SystemFilter from "@/app/components/SystemFilter";

type Critical = {
  id: number;
  code: string;
  name: string;
  floorLabel: string | null;
  startDate: string;
  endDate: string;
  progress: number;
  sheetType: string;
  sheetSlug: string | null;
  float: number;
};
type Delayed = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug: string | null;
  delayReason: string | null;
  delayNote: string | null;
};
type ParetoRow = { slug: string | null; label: string; count: number };
type Data = { critical: Critical[]; delayed: Delayed[]; delayPareto: ParetoRow[] };

export default function ScheduleControlPage() {
  const [data, setData] = useState<Data | null>(null);
  const [system, setSystem] = useState("");
  // Chặn effect fetch bên dưới chạy lần đầu với `system=""` trước khi effect đọc URL kịp
  // cập nhật state (race condition — xem M36).
  const [systemReady, setSystemReady] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<string | null>("");

  // Đọc `?system=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    setSystem(new URLSearchParams(window.location.search).get("system") ?? "");
    setSystemReady(true);
  }, []);

  useEffect(() => {
    if (!systemReady) return;
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/schedule-control${qs}`).then(async (r) => {
      if (r.status === 401) {
        redirectToLogin();
        return;
      }
      setData(await r.json());
    });
  }, [system, systemReady]);

  const maxParetoCount = useMemo(
    () => Math.max(1, ...(data?.delayPareto ?? []).map((r) => r.count)),
    [data],
  );
  const totalDelayed = data?.delayed.length ?? 0;

  const filteredDelayed = useMemo(() => {
    if (!data) return [];
    if (!reasonFilter) return data.delayed;
    if (reasonFilter === "__none") return data.delayed.filter((t) => !t.delayReason);
    return data.delayed.filter((t) => t.delayReason === reasonFilter);
  }, [data, reasonFilter]);

  if (!data) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white schedule-control-print">
      <AppHeader title="Đường găng & Chậm tiến độ">
        <SystemFilter value={system} onChange={setSystem} />
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 min-h-10 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <Printer className="w-4 h-4" /> In
        </button>
      </AppHeader>

      <main className="px-3 sm:px-6 py-4 w-full max-w-6xl mx-auto space-y-6">
        {/* ── Đường găng ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="font-semibold text-sm">Nhóm việc trên đường găng</h2>
            <span className="text-xs font-normal text-zinc-400">({data.critical.length})</span>
          </div>
          <div className="overflow-x-auto">
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
                {data.critical.map((c) => {
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
                {data.critical.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-400 text-sm">
                      Không có nhóm việc nào trên đường găng (cần ít nhất 1 phụ thuộc giữa các
                      nhóm).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Pareto nguyên nhân trễ ── */}
        {data.delayPareto.length > 0 && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-sm font-semibold text-zinc-200">Nguyên nhân trễ (Pareto)</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Bấm thanh để lọc bảng trễ theo lý do</p>
            <div className="space-y-2">
              {data.delayPareto.map((r) => {
                const slugKey = r.slug ?? "__none";
                const active = reasonFilter === slugKey;
                return (
                  <button
                    key={slugKey}
                    onClick={() => setReasonFilter((f) => (f === slugKey ? "" : slugKey))}
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
                        style={{ width: `${(r.count / maxParetoCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-300 w-20 text-left shrink-0 tabular-nums">
                      {r.count}{" "}
                      <span className="text-zinc-400">
                        ({totalDelayed > 0 ? Math.round((r.count / totalDelayed) * 100) : 0}%)
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Bảng trễ ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-400 shrink-0" />
            <h2 className="font-semibold text-sm">Danh sách công việc đang trễ</h2>
            <span className="text-xs font-normal text-zinc-400">
              ({filteredDelayed.length}/{totalDelayed})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800/80">
                  <th className="text-left px-5 py-3">Công việc</th>
                  <th className="text-left px-4 py-3">Hệ</th>
                  <th className="text-left px-4 py-3">Hạn</th>
                  <th className="text-left px-4 py-3">Trễ (ngày)</th>
                  <th className="text-left px-4 py-3 w-32">Tiến độ</th>
                  <th className="text-left px-4 py-3">Lý do trễ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredDelayed.map((t) => {
                  const pct = Math.round((t.progressPercent ?? 0) * 100);
                  return (
                    <tr key={t.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium max-w-[240px]">
                        <span className="font-mono text-xs text-zinc-400 mr-1.5">{t.code}</span>
                        <span className="truncate">{t.name}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 bg-zinc-800 rounded-md text-[11px] font-medium text-zinc-300">
                          {t.sheetType}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums">
                        {formatDateVN(t.endDate)}
                      </td>
                      <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums font-medium">
                        {daysOverdue(t.endDate)}
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
                      <td className="px-4 py-3.5 text-xs" title={t.delayNote ?? undefined}>
                        {t.delayReason ? (
                          <span className="text-amber-300">
                            {DELAY_REASON_LABEL[t.delayReason as keyof typeof DELAY_REASON_LABEL] ??
                              t.delayReason}
                          </span>
                        ) : (
                          <span className="text-zinc-500">— Chưa gán —</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredDelayed.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-400 text-sm">
                      Không có công việc trễ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .schedule-control-print {
            background: #fff !important;
            color: #18181b !important;
          }
          @page {
            margin: 12mm;
          }
          tr {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
