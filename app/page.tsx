"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  Clock,
  FileDown,
  GripVertical,
  Gauge,
  LineChart,
  List,
  ListChecks,
  Map as MapIcon,
  Plus,
  Printer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { slugFromCode } from "@/lib/nen/sheets";
import AppHeader from "@/app/components/AppHeader";
import { appAlert, appConfirm } from "@/app/components/dialogs";
import { PageSkeleton, Skeleton } from "@/app/components/Skeleton";
import EditableText from "@/app/components/EditableText";
import { fetchMe, type Me } from "@/app/lib/me";
import { sortFloorsDesc } from "@/lib/nen/floors";
import DelayedGroupsTable from "@/app/components/DelayedGroupsTable";
import HomeRail from "@/app/components/HomeRail";
import NewSheetModal from "@/app/components/NewSheetModal";
import ProgressRow from "@/app/components/ProgressRow";
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  DocToolbar,
  Section,
  StatCard,
  Tabs,
  TabPanel,
  type TabItem,
} from "@/app/components/ui";
import { systemColorClasses } from "@/lib/nen/systemColors";
import { STATUS_LABEL, type StatusSlug } from "@/lib/tien-do/status";
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

// Thẻ "Tiến độ" gom 5 cách nhìn cùng một dữ liệu vào tab (M125) — mỗi lần chỉ mount tab
// đang mở nên các panel nặng (bản đồ, S-curve, EVM) không còn tự fetch khi chưa ai xem.
// Tab đang mở ghi vào URL `?tab=` để reload/chia sẻ link giữ nguyên.
const TABS: TabItem[] = [
  { id: "sheets", label: "Trang tracking", icon: List },
  { id: "map", label: "Bản đồ", icon: MapIcon },
  { id: "scurve", label: "S-curve", icon: TrendingUp },
  { id: "evm", label: "EVM", icon: LineChart },
  { id: "chart", label: "Biểu đồ", icon: BarChart3 },
];
// Tab mặc định là S-curve: đây là cách nhìn "tiến độ toàn dự án" duy nhất trả lời ngay
// câu hỏi "đang nhanh hay chậm so với kế hoạch", và cũng là panel e2e trang chủ dùng làm
// mốc "đã hydrate + nạp xong dữ liệu" (`e2e/authed/dashboard.spec.ts`).
const DEFAULT_TAB = "scurve";

// Thanh hành động đáy chỉ dành cho màn hẹp: desktop đã có `DocToolbar` ở đầu trang.
// `AppHeader` tự ẩn thanh đáy dưới `md` KHI trang không truyền `bottomActions`, nên trang
// chủ chỉ truyền bộ nút lúc màn hẹp — truyền cả ở desktop sẽ để lại thanh trống dính đáy.
function useIsCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

export default function Dashboard() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [fetchedAt, setFetchedAt] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [kpiOrder, setKpiOrder] = useState<KPI[]>([]);
  const [systems, setSystems] = useState<SystemCard[]>([]);
  // Danh mục nguyên nhân trễ đọc từ code_lists (thay hằng DELAY_REASON_LABEL tĩnh).
  const [delayReasons, setDelayReasons] = useState<{ code: string; label: string }[]>([]);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const compact = useIsCompact();

  // Tab đang mở: state cục bộ + ghi vào URL (cùng khuôn với `HubShell`) — đọc thẳng từ
  // URL sẽ phụ thuộc vào việc điều hướng mềm có giữ được state của trang hay không.
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(() =>
    TABS.some((t) => t.id === tabParam) ? (tabParam as string) : DEFAULT_TAB,
  );
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    Promise.all([
      fetchMe(),
      fetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/sheets").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/systems").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/code-lists?domain=delay_reason").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, dash, sh, sys, cl]) => {
        if (!meData) return;
        setMe(meData);
        setData(dash);
        setKpiOrder(dash?.kpi ?? []);
        setSheets(sh?.sheets ?? []);
        setSystems((sys?.systems ?? []).filter((d: SystemCard) => d.sheetCount > 0));
        setDelayReasons(
          (cl?.items ?? []).map((i: { code: string; label: string }) => ({
            code: i.code,
            label: i.label,
          })),
        );
        setFetchedAt(
          new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        );
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
  // Tổng quan đầu trang: % tiến độ bình quân CÓ TRỌNG SỐ theo số công việc mỗi trang
  // (trung bình cộng thuần sẽ để trang 5 việc nặng ngang trang 500 việc).
  const overview = useMemo(() => {
    const kpi = data?.kpi ?? [];
    const totalTasks = kpi.reduce((sum, k) => sum + k.total, 0);
    const done = kpi.reduce((sum, k) => sum + (k.avgProgress ?? 0) * k.total, 0);
    return {
      totalTasks,
      pct: totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0,
      delayed: data?.totalDelayed ?? 0,
    };
  }, [data]);
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
    const counts = delayReasons
      .map(({ code, label }) => ({
        slug: code,
        label,
        count: allDelayed.filter((t) => t.delayReason === code).length,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    const none = allDelayed.filter((t) => !t.delayReason).length;
    return {
      reasonCounts: counts,
      noReason: none,
      maxReason: Math.max(1, ...counts.map((r) => r.count), none),
    };
  }, [allDelayed, delayReasons]);

  if (loading) return <PageSkeleton />;

  const canImport = me?.role === "admin" || me?.role === "pm";
  const approvals = data?.approvals ?? null;

  const trackingUrl = (t: DelayedTask) => {
    const slug = t.sheetSlug ?? slugFromCode(t.sheetType);
    return slug
      ? `/tracking/${slug}${t.floorLabel ? `?floor=${encodeURIComponent(t.floorLabel)}` : ""}`
      : null;
  };

  function selectTab(id: string) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`?${params.toString()}`, { scroll: false });
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
          compact ? (
            <div className="flex items-center gap-2 shrink-0">
              {canImport && (
                <ButtonLink
                  href="/api/export/excel"
                  icon={FileDown}
                  labelOnDesktopOnly
                  aria-label="Xuất Excel"
                >
                  Excel
                </ButtonLink>
              )}
              <ButtonLink
                href="/report"
                icon={Printer}
                labelOnDesktopOnly
                aria-label="Xem báo cáo PDF"
              >
                PDF
              </ButtonLink>
              {canImport && (
                <ButtonLink
                  href="/import"
                  variant="primary"
                  icon={Upload}
                  labelOnDesktopOnly
                  aria-label="Import Excel"
                >
                  Import
                </ButtonLink>
              )}
            </div>
          ) : undefined
        }
      />

      {/* pb-24 chừa chỗ cho thanh cố định dưới đáy (tìm kiếm/Excel/PDF/Import trên mobile) */}
      <main className="px-4 sm:px-6 py-6 pb-24 space-y-6 max-w-screen-xl mx-auto">
        {/* ── Z0: thanh công cụ ngữ cảnh (desktop; mobile dùng thanh đáy) ── */}
        <DocToolbar
          trailing={
            fetchedAt ? <span className="text-xs text-zinc-400">Cập nhật {fetchedAt}</span> : null
          }
        >
          {canImport && (
            <ButtonLink href="/import" variant="primary" icon={Upload}>
              Import Excel
            </ButtonLink>
          )}
          {canImport && (
            <ButtonLink href="/api/export/excel" icon={FileDown}>
              Excel
            </ButtonLink>
          )}
          <ButtonLink href="/report" icon={Printer}>
            Báo cáo PDF
          </ButtonLink>
          <DocToolbar.Sep />
          <ButtonLink href="/approvals" icon={CheckCheck}>
            Nghiệm thu
          </ButtonLink>
          <ButtonLink href="/lookahead" icon={CalendarDays}>
            Lookahead
          </ButtonLink>
          {canImport && (
            <>
              <DocToolbar.Sep />
              <Button icon={Plus} onClick={() => setNewSheetOpen(true)}>
                Thêm trang
              </Button>
            </>
          )}
        </DocToolbar>

        {/* ── Z1: dải số liệu hành động — mở trang là thấy ngay, không phải cuộn ── */}
        <Section
          title="Tổng quan dự án"
          description="Số liệu tổng hợp toàn bộ trang tracking đang theo dõi"
          actions={
            canImport && (
              // Desktop có nút "Thêm trang" trong thanh công cụ; nút này dành cho màn hẹp.
              <Button
                size="sm"
                icon={Plus}
                onClick={() => setNewSheetOpen(true)}
                className="md:hidden"
              >
                Thêm trang
              </Button>
            )
          }
        >
          <div
            className={`grid grid-cols-2 gap-3 ${approvals ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
          >
            <StatCard
              label="Tiến độ tổng"
              value={overview.pct}
              unit="%"
              progress={overview.pct / 100}
              tone={overview.pct >= 80 ? "success" : overview.pct >= 50 ? "info" : "warning"}
              hint="Bình quân có trọng số theo số công việc"
              icon={Gauge}
            />
            <StatCard
              label="Hạng mục trễ"
              value={overview.delayed}
              tone={overview.delayed > 0 ? "danger" : "success"}
              hint={
                overview.delayed > 0
                  ? `${allDelayed.length} công tác · bấm để xem danh sách`
                  : "Toàn bộ đúng hạn"
              }
              icon={TrendingDown}
              href={overview.delayed > 0 ? "#delayed-table" : undefined}
            />
            {approvals && (
              <StatCard
                label="Chờ duyệt"
                value={approvals.pendingProposals + approvals.pendingPurchaseRequests}
                tone="neutral"
                hint={`${approvals.pendingProposals} đề xuất · ${approvals.pendingPurchaseRequests} yêu cầu mua`}
                icon={CalendarCheck}
                href="/approvals"
              />
            )}
            <StatCard
              label="Công tác theo dõi"
              value={overview.totalTasks.toLocaleString("vi-VN")}
              tone="neutral"
              hint={`${sheets.length} trang tracking`}
              icon={ListChecks}
            />
          </div>
        </Section>

        {/* ── Z2: thân 2 cột — cột chính (tiến độ → đường găng → bảng trễ) + cột phải ── */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="min-w-0 space-y-6">
            {/* Thẻ "Tiến độ" — 5 cách nhìn cùng dữ liệu, chỉ mount tab đang mở */}
            <Card pad="none">
              <Tabs
                group="home-progress"
                label="Cách nhìn tiến độ"
                items={TABS}
                value={tab}
                onChange={selectTab}
                className="px-2"
              />
              <TabPanel group="home-progress" value={tab} className="p-3">
                {tab === "sheets" && (
                  <div className="space-y-0.5">
                    {canImport && (
                      <p className="px-2 pb-1 text-[11px] text-zinc-400">
                        Kéo thả hàng để đổi thứ tự hiển thị
                      </p>
                    )}
                    {kpiOrder.map((k, i) => {
                      const slug = k.sheetSlug ?? slugFromCode(k.sheetType);
                      return (
                        <div
                          key={k.sheetId}
                          draggable={canImport}
                          onDragStart={() => onDragStart(i)}
                          onDragOver={(e) => onDragOver(e, i)}
                          onDrop={onDrop}
                        >
                          <ProgressRow
                            href={slug ? `/tracking/${slug}` : undefined}
                            label={k.sheetType}
                            hint={`${k.total} công việc`}
                            percent={(k.avgProgress ?? 0) * 100}
                            badge={
                              k.delayed > 0 ? (
                                <Chip tone="danger" icon={AlertTriangle}>
                                  <span className="tabular-nums">{k.delayed}</span> trễ
                                </Chip>
                              ) : (
                                <Chip tone="success">Đúng tiến độ</Chip>
                              )
                            }
                            leading={
                              canImport ? (
                                <GripVertical
                                  className="w-3.5 h-3.5 shrink-0 text-zinc-700 cursor-grab active:cursor-grabbing"
                                  aria-hidden="true"
                                />
                              ) : undefined
                            }
                            trailing={
                              canImport ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  icon={Trash2}
                                  title="Xoá trang tracking"
                                  aria-label={`Xoá trang ${k.sheetType}`}
                                  onClick={() => deleteSheet(k.sheetId, k.sheetType)}
                                  className="shrink-0 hover:text-red-300"
                                />
                              ) : undefined
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {tab === "map" && <ProgressMap />}
                {tab === "scurve" && <SCurveChart />}
                {tab === "evm" && <EvmChart />}
                {tab === "chart" && <DashboardBarChart data={chartData} />}
              </TabPanel>
            </Card>

            {/* ── Theo hệ thi công (M15) — CỐ Ý để ngoài thẻ tab: đây là đường vào duy
                nhất còn lại tới trang hệ /system/[code] từ trang chủ (sidebar đã bỏ mục
                này), giấu sau một tab sẽ thành ngõ cụt điều hướng. ── */}
            {systems.length > 0 && (
              <Section title="Theo hệ thi công" description={`${systems.length} hệ đang theo dõi`}>
                <Card pad="sm" className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                  {systems.map((d) => {
                    const c = systemColorClasses(d.color);
                    return (
                      <ProgressRow
                        key={d.code}
                        href={`/system/${d.code}`}
                        label={d.name}
                        hint={`${d.sheetCount} bảng`}
                        percent={(d.avgProgress ?? 0) * 100}
                        badge={
                          d.delayed > 0 ? (
                            <Chip tone="danger" icon={AlertTriangle}>
                              <span className="tabular-nums">{d.delayed}</span> trễ
                            </Chip>
                          ) : (
                            <Chip tone="success">Đúng hạn</Chip>
                          )
                        }
                        leading={
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`}
                            aria-hidden="true"
                          />
                        }
                      />
                    );
                  })}
                </Card>
              </Section>
            )}

            {/* ── Đường găng (nhúng từ /schedule-control — panel tự fetch API riêng) ── */}
            <ScheduleControlPanel />

            {/* ── Bảng trễ ── */}
            <Section
              id="delayed-table"
              icon={Clock}
              title={
                <EditableText tkey="dashboard.delayed.title">Danh sách hạng mục trễ</EditableText>
              }
              description={`${delayedGroupCount} hạng mục · ${delayed.length} công tác`}
              actions={
                <div className="flex flex-wrap gap-2">
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
                      options: statuses.map((s) => ({
                        v: s,
                        l: STATUS_LABEL[s as StatusSlug] ?? s,
                      })),
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
              }
            >
              {/* Danh sách hạng mục trễ (cặp sheet + tầng) — bấm 1 hạng mục để mở ra các công
                  tác trễ bên trong. Cuộn ngang trên mobile. */}
              <Card pad="none" className="overflow-hidden">
                <DelayedGroupsTable
                  tasks={delayed}
                  sheetLabel={(s) => sheetNameByCode.get(s) ?? s}
                  taskHref={trackingUrl}
                  editReason={{ canEdit: !!me && me.role !== "subcon", onChange: setReason }}
                  delayReasons={delayReasons}
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
              </Card>
            </Section>

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

            {/* ── Chỉ số tiến độ (SPI) + dự báo hoàn thành — để ở cột chính chứ không
                phải cột phải: hai panel này chia lưới theo BREAKPOINT VIEWPORT
                (`lg:grid-cols-5`), nhét vào rail 320px sẽ vỡ lưới mà sửa panel thì phạm
                guardrail "không đổi component panel" của M125. ── */}
            <SpiCards />
            <ForecastCards />
          </div>

          {/* Cột phải: điều hướng phân hệ + Pareto nguyên nhân trễ */}
          <div className="lg:sticky lg:top-4">
            <HomeRail
              pareto={{
                rows: reasonCounts,
                noReason,
                max: maxReason,
                total: allDelayed.length,
                value: reasonFilter,
                onToggle: (slug) => setReasonFilter((f) => (f === slug ? "" : slug)),
              }}
            />
          </div>
        </div>
      </main>

      {/* Hộp thoại tạo trang tracking mới (Admin/PM) */}
      {newSheetOpen && <NewSheetModal sheets={sheets} onClose={() => setNewSheetOpen(false)} />}
    </div>
  );
}
