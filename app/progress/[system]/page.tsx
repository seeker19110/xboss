"use client";
import { use, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  ClipboardList,
  ExternalLink,
  Plus,
  TrendingDown,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { fetchMe, redirectToLogin, type Me } from "@/app/lib/me";
import { toSlug } from "@/lib/sheets";
import SCurveChart from "@/app/components/SCurveChart";
import ProgressMap from "@/app/components/ProgressMap";
import SpiCards from "@/app/components/SpiCards";
import ForecastCards from "@/app/components/ForecastCards";
import { formatDateVN, daysOverdue } from "@/lib/date";
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
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sheetKpi, setSheetKpi] = useState<SheetKpi[]>([]);
  const [totalDelayedItems, setTotalDelayedItems] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reasonFilter, setReasonFilter] = useState<string | null>("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [sheetNameByCode, setSheetNameByCode] = useState<Map<string, string>>(new Map());
  const [newSheetName, setNewSheetName] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [createSheetErr, setCreateSheetErr] = useState("");

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
      fetch("/api/sheets").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, summaryData, scheduleData, dashData, sheetsData]) => {
        if (!meData) {
          redirectToLogin();
          return;
        }
        setMe(meData);
        if (!summaryData) {
          setNotFound(true);
          return;
        }
        setSummary(summaryData);
        setSchedule(scheduleData);
        setSheetKpi(dashData?.kpi ?? []);
        setTotalDelayedItems(dashData?.totalDelayed ?? 0);
        setSheetNameByCode(
          new Map(
            (sheetsData?.sheets ?? []).map((s: { code: string; name: string }) => [s.code, s.name]),
          ),
        );
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
    return schedule.delayed.filter(
      (t) =>
        (!sheetFilter || t.sheetType === sheetFilter) &&
        (!floorFilter || t.floorLabel === floorFilter) &&
        (!reasonFilter ||
          (reasonFilter === "__none" ? !t.delayReason : t.delayReason === reasonFilter)),
    );
  }, [schedule, sheetFilter, floorFilter, reasonFilter]);
  // Hạng mục trễ = cặp (sheet, tầng), khớp cách đếm totalDelayedItems ở API — 1 hạng mục
  // dù có nhiều công việc trễ vẫn gộp thành 1 dòng trong danh sách này.
  const delayedGroups = useMemo(() => {
    const map = new Map<
      string,
      { sheetType: string; floorLabel: string; name: string; count: number }
    >();
    for (const t of schedule?.delayed ?? []) {
      const key = `${t.sheetType}::${t.floorLabel ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          sheetType: t.sheetType,
          floorLabel: t.floorLabel ?? "",
          name: `Thi công ${sheetNameByCode.get(t.sheetType) ?? t.sheetType}${t.floorLabel ? ` tầng ${t.floorLabel}` : ""}`,
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.sheetType.localeCompare(b.sheetType));
  }, [schedule, sheetNameByCode]);

  const canManage = me?.role === "admin" || me?.role === "pm";

  async function createSheet() {
    if (!newSheetName.trim() || !summary) return;
    setCreatingSheet(true);
    setCreateSheetErr("");
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSheetName.trim(), systemId: summary.system.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateSheetErr(j?.error ?? "Không tạo được hạng mục");
        return;
      }
      window.location.href = `/tracking/${j.sheet.slug}`;
    } catch {
      setCreateSheetErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setCreatingSheet(false);
    }
  }

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
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2 className="font-semibold text-sm text-zinc-200">Tổng quan tiến độ</h2>
            </div>
            {canManage && (
              <button
                onClick={() => {
                  setCreateSheetErr("");
                  setNewSheetName("");
                  setAddingSheet(true);
                }}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm hạng mục
              </button>
            )}
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

          {/* Banner trễ — cùng bố cục với Dashboard tổng (app/page.tsx), đếm theo HẠNG MỤC
              (mỗi task trễ tính riêng, đã lọc theo hệ này qua ?system=). */}
          {totalDelayedItems > 0 && (
            <a
              href="#delayed-table"
              className="flex items-center gap-4 bg-orange-950/20 border border-orange-900/50 rounded-xl px-5 py-4 mt-3 hover:bg-orange-950/30 transition"
            >
              <div className="p-2.5 bg-orange-950/30 rounded-lg shrink-0">
                <TrendingDown className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium mb-0.5">
                  Tổng số hạng mục đang trễ
                </p>
                <p className="text-4xl font-bold leading-none">{totalDelayedItems}</p>
              </div>
              <span className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition shrink-0">
                Xem chi tiết <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </a>
          )}

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
                        <span className="flex items-center gap-0.5 text-[10px] text-red-950 bg-orange-500 px-1.5 py-0.5 rounded-full shrink-0 font-medium">
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

        {/* ── 2. Biểu đồ kế hoạch so với thực tế ── (SCurveChart tự có tiêu đề riêng) */}
        <section>
          <SCurveChart system={system} />
        </section>

        {/* ── 3. Timeline ── (ProgressMap tự có tiêu đề riêng) */}
        <section>
          <ProgressMap system={system} hideControls />
        </section>

        {/* ── 4. Chỉ số tiến độ SPI ── (SpiCards tự có tiêu đề riêng) */}
        <section>
          <SpiCards system={system} />
        </section>

        {/* ── 5. Dự báo hoàn thành ── (ForecastCards tự có tiêu đề riêng) */}
        <section>
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
        <section
          id="delayed-table"
          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
        >
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
                      <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums font-medium">
                        {daysOverdue(t.endDate)}
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
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-400 text-sm">
                      Không có công việc trễ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Danh sách hạng mục trễ (cặp sheet + tầng) — bấm để lọc bảng phía trên về đúng
              nhóm đó, hiện toàn bộ công việc trễ thuộc hạng mục. Đặt dưới bảng để không
              chắn ngang trước khi thấy được nội dung chính. */}
          {delayedGroups.length > 0 && (
            <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap gap-2">
              {delayedGroups.map((g) => {
                const active = sheetFilter === g.sheetType && floorFilter === g.floorLabel;
                return (
                  <button
                    key={`${g.sheetType}::${g.floorLabel}`}
                    onClick={() => {
                      if (active) {
                        setSheetFilter("");
                        setFloorFilter("");
                      } else {
                        setSheetFilter(g.sheetType);
                        setFloorFilter(g.floorLabel);
                      }
                    }}
                    title={`Xem toàn bộ công việc trễ của ${g.name}`}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition ${
                      active
                        ? "bg-orange-500 border-orange-500 text-red-950 font-medium"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-orange-700/60 hover:text-orange-300"
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Modal tạo hạng mục (sheet tracking) mới trong hệ này — cùng field tối thiểu với
          form ở /system/[code] khi hệ chưa có sheet nào, chỉ khác đã gán sẵn systemId hiện tại. */}
      {addingSheet && (
        <Modal onClose={() => setAddingSheet(false)}>
          <div className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Thêm hạng mục cho hệ {label}
            </h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Tên hạng mục</label>
              <input
                autoFocus
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createSheet();
                }}
                placeholder="VD: ACMV Zone 3"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Đường dẫn tracking tự sinh từ tên: /tracking/{toSlug(newSheetName) || "…"}
              </p>
            </div>
            {createSheetErr && <p className="text-xs text-red-400 mt-3">{createSheetErr}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setAddingSheet(false)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition"
              >
                Huỷ
              </button>
              <button
                onClick={createSheet}
                disabled={creatingSheet || !newSheetName.trim()}
                className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg font-semibold transition text-on-accent"
              >
                {creatingSheet ? "Đang tạo…" : "Tạo hạng mục"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
