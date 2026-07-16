"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Clock,
  Upload,
  ChevronRight,
  FileDown,
  Printer,
  Plus,
  Trash2,
  TrendingDown,
  GripVertical,
} from "lucide-react";
import { slugFromCode, toSlug } from "@/lib/sheets";
import AppHeader from "@/app/components/AppHeader";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { PageSkeleton, Skeleton } from "@/app/components/Skeleton";
import EditableText from "@/app/components/EditableText";
import { DELAY_REASON_LABEL } from "@/lib/delay";
import { fetchMe, type Me } from "@/app/lib/me";
import { sortFloorsDesc } from "@/lib/floors";
import DelayedGroupsTable from "@/app/components/DelayedGroupsTable";
import { systemColorClasses } from "@/lib/systemColors";
import { STATUS_LABEL, type StatusSlug } from "@/lib/status";
import type {
  QualityBlock,
  VoBlock,
  WorkfrontBlock,
  SystemCrossRow,
  ApprovalsBlock,
} from "@/app/components/DashboardExtCards";

// Lazy-load các component nặng (recharts, nhiều fetch) — chỉ load khi đã render shell
const ProgressMap = dynamic(() => import("@/app/components/ProgressMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-xl" />,
});
const BlockedPanel = dynamic(() => import("@/app/components/BlockedPanel"), {
  ssr: false,
  loading: () => <Skeleton className="h-24 rounded-xl" />,
});
const NormsOverPanel = dynamic(() => import("@/app/components/NormsOverPanel"), {
  ssr: false,
  loading: () => <Skeleton className="h-24 rounded-xl" />,
});
const SpiCards = dynamic(() => import("@/app/components/SpiCards"), {
  ssr: false,
  loading: () => <Skeleton className="h-28 rounded-xl" />,
});
const ForecastCards = dynamic(() => import("@/app/components/ForecastCards"), {
  ssr: false,
  loading: () => <Skeleton className="h-28 rounded-xl" />,
});
const SCurveChart = dynamic(() => import("@/app/components/SCurveChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-xl" />,
});
const DashboardBarChart = dynamic(() => import("@/app/components/DashboardBarChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 rounded-xl" />,
});
const EvmChart = dynamic(() => import("@/app/components/EvmChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-xl" />,
});
const DashboardExtCards = dynamic(() => import("@/app/components/DashboardExtCards"), {
  ssr: false,
  loading: () => <Skeleton className="h-28 rounded-xl" />,
});
const ScheduleControlPanel = dynamic(() => import("@/app/components/ScheduleControlPanel"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 rounded-xl" />,
});

type DelayedTask = {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string;
  sheetType: string;
  sheetSlug: string | null;
  delayReason: string | null;
  delayNote: string | null;
};
type KPI = {
  sheetId: number;
  sheetType: string;
  sheetSlug: string | null;
  total: number;
  avgProgress: number;
  delayed: number;
};
type SheetNav = { id: number; code: string; name: string; slug: string };
type SystemCard = {
  id: number;
  code: string;
  name: string;
  color: string | null;
  sheetCount: number;
  avgProgress: number;
  delayed: number;
};

export default function Dashboard() {
  const [data, setData] = useState<{
    delayedTasks: DelayedTask[];
    groupProgress: Record<string, number>;
    kpi: KPI[];
    totalDelayed: number;
    quality: QualityBlock;
    vo: VoBlock | null;
    workfront: WorkfrontBlock | null;
    bySystem: SystemCrossRow[];
    approvals: ApprovalsBlock | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetFilter, setSheetFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [newSheet, setNewSheet] = useState<{
    name: string;
    slug: string;
    code: string;
    copyFromId: number | "";
  } | null>(null);
  const [newSheetErr, setNewSheetErr] = useState("");
  const [kpiOrder, setKpiOrder] = useState<KPI[]>([]);
  const [systems, setSystems] = useState<SystemCard[]>([]);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetchMe(),
      fetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/sheets").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/systems").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, dash, sh, sys]) => {
        if (!meData) return;
        setMe(meData);
        setData(dash);
        setKpiOrder(dash?.kpi ?? []);
        setSheets(sh?.sheets ?? []);
        setSystems((sys?.systems ?? []).filter((d: SystemCard) => d.sheetCount > 0));
      })
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(
    () =>
      (data?.kpi ?? []).map((k) => ({
        name: k.sheetType,
        value: Math.round((k.avgProgress ?? 0) * 100),
        delayed: k.delayed,
      })),
    [data],
  );
  const floors = useMemo(
    () =>
      [...new Set((data?.delayedTasks ?? []).map((t) => t.floorLabel).filter(Boolean))].sort(
        sortFloorsDesc,
      ),
    [data],
  );
  const statuses = useMemo(
    () => [...new Set((data?.delayedTasks ?? []).map((t) => t.status).filter(Boolean))],
    [data],
  );
  const sheetNameByCode = useMemo(() => new Map(sheets.map((s) => [s.code, s.name])), [sheets]);
  const delayed = useMemo(
    () =>
      (data?.delayedTasks ?? []).filter(
        (t) =>
          (!sheetFilter || t.sheetType === sheetFilter) &&
          (!floorFilter || t.floorLabel === floorFilter) &&
          (!statusFilter || t.status === statusFilter) &&
          (!reasonFilter ||
            (reasonFilter === "__none" ? !t.delayReason : t.delayReason === reasonFilter)),
      ),
    [data, sheetFilter, floorFilter, statusFilter, reasonFilter],
  );
  // Số hạng mục trễ = số cặp (sheet, tầng) trong danh sách đã lọc — khớp cách đếm ở KPI.
  const delayedGroupCount = useMemo(
    () => new Set(delayed.map((t) => `${t.sheetType}::${t.floorLabel ?? ""}`)).size,
    [delayed],
  );
  const groupProgressMap = useMemo(
    () => new Map(Object.entries(data?.groupProgress ?? {})),
    [data],
  );

  const allDelayed = useMemo(() => data?.delayedTasks ?? [], [data]);
  const { reasonCounts, noReason, maxReason } = useMemo(() => {
    const counts = Object.keys(DELAY_REASON_LABEL)
      .map((slug) => ({
        slug,
        label: DELAY_REASON_LABEL[slug as keyof typeof DELAY_REASON_LABEL],
        count: allDelayed.filter((t) => t.delayReason === slug).length,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    const none = allDelayed.filter((t) => !t.delayReason).length;
    return {
      reasonCounts: counts,
      noReason: none,
      maxReason: Math.max(1, ...counts.map((r) => r.count), none),
    };
  }, [allDelayed]);

  if (loading) return <PageSkeleton />;

  const canImport = me?.role === "admin" || me?.role === "pm";

  const trackingUrl = (t: DelayedTask) => {
    const slug = t.sheetSlug ?? slugFromCode(t.sheetType);
    return slug
      ? `/tracking/${slug}${t.floorLabel ? `?floor=${encodeURIComponent(t.floorLabel)}` : ""}`
      : null;
  };

  async function createSheet() {
    if (!newSheet?.name.trim()) return;
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSheet.name.trim(),
        code: newSheet.code.trim() || undefined,
        slug: newSheet.slug.trim() || undefined,
        copyFromId: newSheet.copyFromId || undefined,
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setNewSheetErr(j?.error ?? "Không tạo được trang");
      return;
    }
    window.location.href = `/tracking/${j.sheet.slug}`;
  }

  async function deleteSheet(sheetId: number, sheetName: string) {
    if (
      !(await appConfirm(
        `Xoá trang "${sheetName}"?\n\nToàn bộ nhóm, công việc, tiến độ và vật tư của trang này sẽ bị xoá vĩnh viễn. Thao tác không thể hoàn tác.`,
        { danger: true, confirmLabel: "Xoá" },
      ))
    )
      return;
    const res = await fetch(`/api/sheets/${sheetId}`, { method: "DELETE" });
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
      return;
    }
    window.location.reload();
  }

  function onDragStart(i: number) {
    dragIdx.current = i;
  }
  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    dragOverIdx.current = i;
  }
  function onDrop() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from === null || to === null || from === to) return;
    const next = [...kpiOrder];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setKpiOrder(next);
    dragIdx.current = null;
    dragOverIdx.current = null;
    fetch("/api/sheets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((k) => k.sheetId) }),
    });
  }

  async function setReason(taskId: number, reason: string) {
    const res = await fetch(`/api/tasks/${taskId}/delay-reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || null }),
    });
    if (!res.ok) return;
    setData(
      (d) =>
        d && {
          ...d,
          delayedTasks: d.delayedTasks.map((t) =>
            t.id === taskId ? { ...t, delayReason: reason || null } : t,
          ),
        },
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        bottomActions={
          <div className="flex items-center gap-2 shrink-0">
            {canImport && (
              <a
                href="/api/export/excel"
                aria-label="Xuất Excel"
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Excel</span>
              </a>
            )}
            <a
              href="/report"
              aria-label="Xem báo cáo PDF"
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">PDF</span>
            </a>
            {canImport && (
              <a
                href="/import"
                aria-label="Import Excel"
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition text-on-accent"
              >
                <Upload className="w-4 h-4" />{" "}
                <span className="hidden sm:inline">Import Excel</span>
              </a>
            )}
          </div>
        }
      />

      {/* pb-24 chừa chỗ cho thanh cố định dưới đáy (tìm kiếm/Nghiệm thu/Excel/PDF/Import) */}
      <main className="px-4 sm:px-6 py-6 pb-24 space-y-6 max-w-screen-xl mx-auto">
        {/* ── Card hệ (M15) — nhìn nhanh từng hệ, bấm vào trang hub riêng ── */}
        {systems.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
              Theo hệ thi công
            </h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
              {systems.map((d) => {
                const c = systemColorClasses(d.color);
                const dpct = Math.round((d.avgProgress ?? 0) * 100);
                return (
                  <a
                    key={d.code}
                    href={`/system/${d.code}`}
                    className={`shrink-0 w-40 bg-zinc-900 border border-zinc-800 border-l-4 ${c.border} rounded-xl p-3 hover:border-zinc-600 transition`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`}
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium truncate">{d.name}</p>
                    </div>
                    <p className={`text-2xl font-bold mt-1 ${c.text}`}>{dpct}%</p>
                    {d.delayed > 0 && (
                      <p className="text-xs text-rose-300 mt-0.5">{d.delayed} trễ</p>
                    )}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* ── KPI ── */}
        <section>
          {/* Tổng trễ — banner nổi bật */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Tổng quan tiến độ
            </h2>
            {canImport && (
              <button
                onClick={() => {
                  setNewSheetErr("");
                  setNewSheet({
                    name: "",
                    slug: "",
                    code: "",
                    copyFromId: sheets[sheets.length - 1]?.id ?? "",
                  });
                }}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm trang
              </button>
            )}
          </div>

          {/* Banner trễ */}
          {(data?.totalDelayed ?? 0) > 0 && (
            <a
              href="#delayed-table"
              className="flex items-center gap-4 bg-orange-950/20 border border-orange-900/50 rounded-xl px-5 py-4 mb-4 hover:bg-orange-950/30 transition"
            >
              <div className="p-2.5 bg-orange-950/30 rounded-lg shrink-0">
                <TrendingDown className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                {/* Nền tint mờ (bg-orange-950/20) đổi độ sáng nhiều theo theme — chữ màu (vd
                    text-orange-400) không đủ tương phản AA trên nền đã sáng ở theme sáng (đo axe:
                    2.93 < 4.5 khi từng thử với đỏ). Dùng token zinc thích ứng cho chữ (đảm bảo AA
                    mọi theme), giữ sắc cam ở icon/nền/viền. */}
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium mb-0.5">
                  Tổng số hạng mục đang trễ
                </p>
                <p className="text-4xl font-bold leading-none">{data?.totalDelayed ?? 0}</p>
              </div>
              <span className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition shrink-0">
                Xem chi tiết <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </a>
          )}

          {/* Grid sheet cards — draggable để sắp xếp (Admin/PM) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {kpiOrder.map((k, i) => {
              const slug = k.sheetSlug ?? slugFromCode(k.sheetType);
              const pct = Math.round((k.avgProgress ?? 0) * 100);
              const hasDelay = k.delayed > 0;
              const cardContent = (
                <div className="flex flex-col h-full gap-3">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide leading-snug">
                      {k.sheetType}
                    </span>
                    {hasDelay && (
                      <span
                        title={`${k.delayed} hạng mục đang trễ`}
                        className="flex items-center gap-0.5 text-[10px] text-red-950 bg-orange-500 px-1.5 py-0.5 rounded-full shrink-0 font-medium"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> {k.delayed}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-3xl font-bold leading-none">{pct}%</p>
                    <p className="text-[11px] text-zinc-400 mt-1">{k.total} công việc</p>
                  </div>
                  <div className="mt-auto">
                    <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-amber-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );

              const cardCls = `relative group/card bg-zinc-900 border rounded-xl p-4 flex flex-col transition min-h-[120px] ${
                slug
                  ? "hover:border-emerald-700/60 cursor-pointer border-zinc-800"
                  : "border-zinc-800"
              }`;

              return (
                <div
                  key={k.sheetId}
                  className="relative group/wrap"
                  draggable={canImport}
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDrop={onDrop}
                >
                  {slug ? (
                    <a href={`/tracking/${slug}`} className={cardCls}>
                      {cardContent}
                    </a>
                  ) : (
                    <div className={cardCls}>{cardContent}</div>
                  )}
                  {canImport && (
                    <>
                      {/* Tay cầm kéo */}
                      <div className="absolute top-2 left-2 p-0.5 text-zinc-700 group-hover/wrap:text-zinc-500 cursor-grab active:cursor-grabbing transition z-10 pointer-events-none">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          deleteSheet(k.sheetId, k.sheetType);
                        }}
                        title="Xoá trang tracking"
                        className="absolute top-2 right-2 p-1 rounded-md bg-zinc-800/80 text-zinc-500 hover:text-red-300 hover:bg-red-950/40 opacity-100 sm:opacity-0 sm:group-hover/wrap:opacity-100 transition z-10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Bản đồ tiến độ Tháp A (tầng × hệ + lịch sử) ── */}
        <ProgressMap />

        {/* ── M9: KPI chất lượng + so sánh chéo hệ ── */}
        {data && (
          <DashboardExtCards
            quality={data.quality}
            vo={data.vo}
            workfront={data.workfront}
            bySystem={data.bySystem}
            approvals={data.approvals}
          />
        )}

        {/* ── Việc bị chặn (phụ thuộc chưa thông) ── */}
        <BlockedPanel />

        {/* ── M18: vật tư vượt định mức theo hạng mục ── */}
        {me?.role !== "subcon" && <NormsOverPanel />}

        {/* ── Chỉ số tiến độ (SPI) ── */}
        <SpiCards />

        {/* ── Dự báo hoàn thành ── */}
        <ForecastCards />

        {/* ── S-curve ── */}
        <SCurveChart />

        {/* ── M47: EVM (PV/EV/AC → SPI/CPI/EAC) — API tự chặn role không xem tiền ── */}
        <EvmChart />

        {/* ── Bar chart tiến độ ── */}
        <DashboardBarChart data={chartData} />

        {/* ── Đường găng (nhúng từ /schedule-control — panel tự fetch /api/schedule-control) ── */}
        <ScheduleControlPanel />

        {/* ── Pareto nguyên nhân trễ ── */}
        {allDelayed.length > 0 && (reasonCounts.length > 0 || noReason > 0) && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-base font-semibold text-zinc-100">
                <EditableText tkey="dashboard.pareto.title">Nguyên nhân trễ (Pareto)</EditableText>
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Bấm thanh để lọc bảng trễ theo lý do</p>
            <div className="space-y-2">
              {reasonCounts.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => setReasonFilter((f) => (f === r.slug ? "" : r.slug))}
                  className={`w-full flex items-center gap-3 group transition ${reasonFilter === r.slug ? "opacity-100" : reasonFilter ? "opacity-40" : ""}`}
                >
                  <span
                    className="text-xs text-zinc-400 w-24 sm:w-32 text-right shrink-0 truncate"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-amber-500/70 group-hover:bg-amber-400 rounded-full transition-all"
                      style={{ width: `${(r.count / maxReason) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-300 w-20 text-left shrink-0 tabular-nums">
                    {r.count}{" "}
                    <span className="text-zinc-400">
                      ({Math.round((r.count / allDelayed.length) * 100)}%)
                    </span>
                  </span>
                </button>
              ))}
              {noReason > 0 && (
                <button
                  onClick={() => setReasonFilter((f) => (f === "__none" ? "" : "__none"))}
                  className={`w-full flex items-center gap-3 group transition ${reasonFilter === "__none" ? "opacity-100" : reasonFilter ? "opacity-40" : ""}`}
                >
                  <span className="text-xs text-zinc-400 w-24 sm:w-32 text-right shrink-0">
                    Chưa gán lý do
                  </span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-zinc-600 group-hover:bg-zinc-500 rounded-full transition-all"
                      style={{ width: `${(noReason / maxReason) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-20 text-left shrink-0 tabular-nums">
                    {noReason}{" "}
                    <span className="text-zinc-400">
                      ({Math.round((noReason / allDelayed.length) * 100)}%)
                    </span>
                  </span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Bảng trễ ── */}
        <section
          id="delayed-table"
          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
        >
          {/* Header + filter */}
          <div className="px-5 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="flex items-center gap-2 font-semibold text-base text-zinc-100 shrink-0">
              <Clock className="w-4 h-4 text-red-400" />
              <EditableText tkey="dashboard.delayed.title">Danh sách hạng mục trễ</EditableText>
              <span className="ml-1 text-xs font-normal text-zinc-400">
                ({delayedGroupCount} hạng mục · {delayed.length} công tác)
              </span>
            </h2>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {[
                {
                  value: sheetFilter,
                  onChange: setSheetFilter,
                  placeholder: "Tất cả sheet",
                  options: data?.kpi.map((k) => ({ v: k.sheetType, l: k.sheetType })) ?? [],
                },
                {
                  value: floorFilter,
                  onChange: setFloorFilter,
                  placeholder: "Tất cả tầng",
                  options: floors.map((f) => ({ v: f, l: f })),
                },
                {
                  value: statusFilter,
                  onChange: setStatusFilter,
                  placeholder: "Tất cả trạng thái",
                  options: statuses.map((s) => ({ v: s, l: STATUS_LABEL[s as StatusSlug] ?? s })),
                },
              ].map((sel, i) => (
                <select
                  key={i}
                  value={sel.value}
                  onChange={(e) => sel.onChange(e.target.value)}
                  aria-label={sel.placeholder}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-zinc-500 transition"
                >
                  <option value="">{sel.placeholder}</option>
                  {sel.options.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>

          {/* Danh sách hạng mục trễ (cặp sheet + tầng) — bấm 1 hạng mục để mở ra các công
              tác trễ bên trong. Cuộn ngang trên mobile. */}
          <DelayedGroupsTable
            tasks={delayed}
            sheetLabel={(s) => sheetNameByCode.get(s) ?? s}
            taskHref={trackingUrl}
            editReason={{ canEdit: !!me && me.role !== "subcon", onChange: setReason }}
            groupProgress={groupProgressMap}
            emptyMessage={
              <>
                Không có công việc trễ.{" "}
                {canImport && (
                  <a href="/import" className="text-emerald-400 hover:underline">
                    Import file Excel
                  </a>
                )}
                {!canImport && "Hãy liên hệ Admin/PM để cập nhật dữ liệu."}
              </>
            }
          />
        </section>
      </main>

      {/* Modal tạo trang tracking mới */}
      {newSheet && (
        <Modal onClose={() => setNewSheet(null)}>
          <div className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Thêm trang tracking
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tên trang</label>
                <input
                  autoFocus
                  value={newSheet.name}
                  onChange={(e) =>
                    setNewSheet(
                      (ns) =>
                        ns && {
                          ...ns,
                          name: e.target.value,
                          slug: toSlug(e.target.value),
                          code: e.target.value,
                        },
                    )
                  }
                  placeholder="VD: Ống nước cấp Zone 3"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mã sheet</label>
                <input
                  value={newSheet.code}
                  onChange={(e) => setNewSheet((ns) => ns && { ...ns, code: e.target.value })}
                  placeholder="VD: ONC Z3"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Đường dẫn</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-zinc-400 shrink-0">/tracking/</span>
                  <input
                    value={newSheet.slug}
                    onChange={(e) => setNewSheet((ns) => ns && { ...ns, slug: e.target.value })}
                    placeholder="ong-nuoc-cap-zone-3"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 font-mono transition"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Chỉ dùng chữ thường a–z, số và gạch nối.
                </p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Sao chép cấu trúc từ</label>
                <select
                  value={newSheet.copyFromId}
                  onChange={(e) =>
                    setNewSheet(
                      (ns) =>
                        ns && { ...ns, copyFromId: e.target.value ? Number(e.target.value) : "" },
                    )
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition"
                >
                  <option value="">— Trang trống —</option>
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Copy nhóm + công việc, tiến độ reset về 0.
                </p>
              </div>
            </div>
            {newSheetErr && <p className="text-xs text-red-400 mt-3">{newSheetErr}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setNewSheet(null)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition"
              >
                Huỷ
              </button>
              <button
                onClick={createSheet}
                disabled={!newSheet.name.trim()}
                className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg font-semibold transition text-on-accent"
              >
                Tạo trang
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
