"use client";
import { use, useEffect, useMemo, useState } from "react";
import {
  Gauge,
  TrendingUp,
  Map as MapIcon,
  AlertTriangle,
  Clock,
  ClipboardList,
  ExternalLink,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import SCurveChart from "@/app/components/SCurveChart";
import ProgressMap from "@/app/components/ProgressMap";
import SpiCards from "@/app/components/SpiCards";
import ForecastCards from "@/app/components/ForecastCards";
import { formatDateVN } from "@/lib/date";
import { DELAY_REASON_LABEL } from "@/lib/delay";

// Trang gộp toàn bộ tiến độ 1 hệ (M-tiến-độ-6-hệ): thay 5 view chung Timeline/Gantt/
// Lookahead/S-Curve/Đường găng bằng 6 trang theo hệ đang thi công, mỗi trang đủ 7 khối
// tiến độ của riêng hệ đó — cuộn xuống xem hết, không phải tab ẩn/hiện.

// Nhãn hiển thị cứng — KHÔNG dùng summary.system.name vì DB ghi "Nước" chứ không
// phải "Cấp thoát nước" theo yêu cầu hiển thị.
const SYSTEM_LABEL: Record<string, string> = {
  acmv: "ACMV",
  dien: "Điện",
  nuoc: "Cấp thoát nước",
  pccc: "PCCC",
  ket_cau: "Kết cấu",
  xay_to: "Xây tô",
};

type Summary = {
  system: { id: number; code: string; name: string; color: string | null };
  progressPercent: number;
  totalTasks: number;
  delayedCount: number;
  waitingApprovalCount: number;
  ncrOpen: number;
};

type SheetKpi = {
  sheetId: number;
  sheetType: string;
  sheetSlug: string | null;
  total: number;
  avgProgress: number;
  delayed: number;
};
type Critical = { id: number; float: number };
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
type ScheduleData = { critical: Critical[]; delayed: Delayed[]; delayPareto: ParetoRow[] };

function KpiTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3 min-w-[110px] shrink-0">
      <p className="text-[11px] text-zinc-400">{label}</p>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

export default function ProgressSystemPage({ params }: { params: Promise<{ system: string }> }) {
  const { system } = use(params);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sheetKpi, setSheetKpi] = useState<SheetKpi[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reasonFilter, setReasonFilter] = useState<string | null>("");

  const validSystem = Object.prototype.hasOwnProperty.call(SYSTEM_LABEL, system);

  useEffect(() => {
    if (!validSystem) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchMe(),
      fetch(`/api/systems/${system}/summary`).then((r) =>
        r.status === 404 ? null : r.ok ? r.json() : Promise.reject(new Error("fetch failed")),
      ),
      fetch(`/api/schedule-control?system=${encodeURIComponent(system)}`).then((r) =>
        r.status === 401 ? null : r.ok ? r.json() : Promise.reject(new Error("fetch failed")),
      ),
      // Cards theo từng sheet trong hệ (giống lưới "Tổng quan tiến độ" ở Dashboard tổng,
      // nhưng /api/dashboard?system= đã tự lọc chỉ còn sheet của hệ này).
      fetch(`/api/dashboard?system=${encodeURIComponent(system)}`).then((r) =>
        r.status === 401 ? null : r.ok ? r.json() : Promise.reject(new Error("fetch failed")),
      ),
    ])
      .then(([meData, summaryData, scheduleData, dashData]) => {
        if (!meData) {
          redirectToLogin();
          return;
        }
        if (!summaryData) {
          setNotFound(true);
          return;
        }
        setSummary(summaryData);
        setSchedule(scheduleData);
        setSheetKpi(dashData?.kpi ?? []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [system, validSystem]);

  const maxParetoCount = useMemo(
    () => Math.max(1, ...(schedule?.delayPareto ?? []).map((r) => r.count)),
    [schedule],
  );
  const totalDelayed = schedule?.delayed.length ?? 0;
  const filteredDelayed = useMemo(() => {
    if (!schedule) return [];
    if (!reasonFilter) return schedule.delayed;
    if (reasonFilter === "__none") return schedule.delayed.filter((t) => !t.delayReason);
    return schedule.delayed.filter((t) => t.delayReason === reasonFilter);
  }, [schedule, reasonFilter]);

  if (loading) return <PageSkeleton />;

  const label = SYSTEM_LABEL[system];

  if (notFound || !summary || !label) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Không tìm thấy hệ" />
        <main className="p-4 sm:p-6">
          <EmptyState message={`Không tìm thấy hệ "${system}".`} />
        </main>
      </div>
    );
  }

  // Hệ chưa có sheet tracking nào (vd Điện/Nước/PCCC/Kết cấu/Xây tô trước khi tạo sheet đầu
  // tiên) — báo rõ thay vì render 7 khối gần như trống (S-curve/SPI/dự báo/timeline tự ẩn
  // khi rỗng, KPI toàn 0%) khiến trang trông như bị lỗi.
  if (summary.totalTasks === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title={`Tiến độ — ${label}`} back />
        <main className="px-3 sm:px-6 py-4 w-full max-w-6xl mx-auto">
          <EmptyState
            icon={ClipboardList}
            title={`Hệ ${label} chưa có sheet tracking nào`}
            message="Tạo sheet đầu tiên để bắt đầu theo dõi tiến độ hệ này."
            action={
              <a
                href={`/system/${system}`}
                className="mt-1 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-on-accent text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                Tạo sheet cho hệ {label}
              </a>
            }
          />
        </main>
      </div>
    );
  }

  const pct = Math.round(summary.progressPercent * 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title={`Tiến độ — ${label}`} back />
      <main className="px-3 sm:px-6 py-4 w-full max-w-6xl mx-auto space-y-8">
        {/* ── 1. Tổng quan tiến độ ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="font-semibold text-sm text-zinc-200">Tổng quan tiến độ</h2>
          </div>
          <div
            className="flex gap-3 overflow-x-auto scrollbar-none"
            tabIndex={0}
            role="region"
            aria-label={`Chỉ số KPI hệ ${label}`}
          >
            <KpiTile label="Tiến độ" value={`${pct}%`} accent="text-emerald-300" />
            <KpiTile label="Task trễ" value={String(summary.delayedCount)} accent="text-rose-300" />
            <KpiTile
              label="Chờ nghiệm thu"
              value={String(summary.waitingApprovalCount)}
              accent="text-amber-300"
            />
            <KpiTile
              label="NCR mở"
              value={String(summary.ncrOpen)}
              accent={summary.ncrOpen > 0 ? "text-rose-300" : "text-zinc-300"}
            />
          </div>

          {/* Card theo từng sheet trong hệ — cùng bố cục với lưới sheet ở Dashboard tổng,
              chỉ khác nguồn dữ liệu đã lọc sẵn theo hệ (?system=). */}
          {sheetKpi.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {sheetKpi.map((k) => {
                const spct = Math.round((k.avgProgress ?? 0) * 100);
                const hasDelay = k.delayed > 0;
                const card = (
                  <div className="flex flex-col h-full gap-3">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide leading-snug">
                        {k.sheetType}
                      </span>
                      {hasDelay && (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-200 bg-red-950 px-1.5 py-0.5 rounded-full shrink-0 font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" /> {k.delayed}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-3xl font-bold leading-none">{spct}%</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{k.total} công việc</p>
                    </div>
                    <div className="mt-auto">
                      <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all ${spct >= 80 ? "bg-emerald-500" : spct >= 50 ? "bg-sky-500" : "bg-amber-500"}`}
                          style={{ width: `${spct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
                return k.sheetSlug ? (
                  <a
                    key={k.sheetId}
                    href={`/tracking/${k.sheetSlug}`}
                    className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700/60 rounded-xl p-4 flex flex-col transition min-h-[120px]"
                  >
                    {card}
                  </a>
                ) : (
                  <div
                    key={k.sheetId}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col min-h-[120px]"
                  >
                    {card}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. Biểu đồ kế hoạch so với thực tế ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="font-semibold text-sm text-zinc-200">Biểu đồ kế hoạch so với thực tế</h2>
          </div>
          <SCurveChart system={system} />
        </section>

        {/* ── 3. Timeline ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <MapIcon className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="font-semibold text-sm text-zinc-200">Timeline</h2>
          </div>
          <ProgressMap system={system} />
        </section>

        {/* ── 4. Chỉ số tiến độ SPI ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="font-semibold text-sm text-zinc-200">Chỉ số tiến độ SPI</h2>
          </div>
          <SpiCards system={system} />
        </section>

        {/* ── 5. Dự báo hoàn thành ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="font-semibold text-sm text-zinc-200">Dự báo hoàn thành</h2>
          </div>
          <ForecastCards system={system} />
        </section>

        {/* ── 6. Nguyên nhân trễ ── */}
        {schedule && schedule.delayPareto.length > 0 && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-sm font-semibold text-zinc-200">Nguyên nhân trễ</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Bấm thanh để lọc bảng trễ theo lý do</p>
            <div className="space-y-2">
              {schedule.delayPareto.map((r) => {
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

        {/* ── 7. Danh sách công việc đang trễ ── */}
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
                  <th className="text-left px-4 py-3 w-32">Tiến độ</th>
                  <th className="text-left px-4 py-3">Lý do trễ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredDelayed.map((t) => {
                  const tpct = Math.round((t.progressPercent ?? 0) * 100);
                  const url = t.sheetSlug ? `/tracking/${t.sheetSlug}` : "#";
                  return (
                    <tr key={t.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium max-w-[240px]">
                        <a
                          href={url}
                          title="Mở trên lưới tracking"
                          className="flex items-center gap-1.5 hover:text-emerald-400 transition group"
                        >
                          <span className="font-mono text-xs text-zinc-400 shrink-0">{t.code}</span>
                          <span className="truncate">{t.name}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 text-zinc-600 group-hover:text-emerald-400 transition" />
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 bg-zinc-800 rounded-md text-[11px] font-medium text-zinc-300">
                          {t.sheetType}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums">
                        {formatDateVN(t.endDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="bg-zinc-800 rounded-full h-1.5 w-16 shrink-0 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${tpct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-zinc-300">{tpct}%</span>
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
                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-400 text-sm">
                      Không có công việc trễ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
