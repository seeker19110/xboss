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
  Sparkles,
  HardHat,
  CalendarCheck,
  Package,
  Coins,
  Brain,
  Landmark,
  ArrowUpRight,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { slugFromCode, toSlug } from "@/lib/nen/sheets";
import AppHeader from "@/app/components/AppHeader";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { PageSkeleton, Skeleton } from "@/app/components/Skeleton";
import EditableText from "@/app/components/EditableText";
import { fetchMe, type Me } from "@/app/lib/me";
import { sortFloorsDesc } from "@/lib/tien-do/floors";
import DelayedGroupsTable from "@/app/components/DelayedGroupsTable";
import { Button, Card, CardLink, Chip, Section, StatCard } from "@/app/components/ui";
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

// 7 phân hệ hợp nhất + 6 giai đoạn vòng đời: dữ liệu điều hướng thuần (không phải số liệu
// dự án) nên tách khỏi JSX cho gọn. Trước đây khai ngay trong render kèm các chip trạng thái
// cắm cứng ("100% Khớp", "LOD 400", "Quyết toán kỳ 6") — số liệu giả, không đọc từ DB, dễ
// khiến người xem tin nhầm là tình trạng thật; đã bỏ hẳn, chỉ giữ phần điều hướng.
const HUBS: {
  title: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  color: string;
  colSpan?: string;
}[] = [
  {
    title: "1. MEPF CAD/BIM Studio",
    desc: "3D/4D BIM WebGPU, LiDAR Scan-to-BIM, BCF 3.0, CNC G-Code & Auto-Routing",
    href: "/engineering/god-tier-studio",
    icon: Sparkles,
    color: "text-amber-300",
  },
  {
    title: "2. Chỉ huy hiện trường & An toàn",
    desc: "Việc của tôi, Nhật ký TT06, Nghiệm thu, Mặt bằng & AI HSE",
    href: "/site",
    icon: HardHat,
    color: "text-emerald-300",
  },
  {
    title: "3. Kế hoạch & Tiến độ WBS",
    desc: "Lưới 6 hệ, CPM Gantt, Lookahead, EVM SPI/CPI & Báo cáo A4",
    href: "/schedule",
    icon: CalendarCheck,
    color: "text-sky-300",
  },
  {
    title: "4. Chuỗi cung ứng & Vật tư",
    desc: "Định mức BOQ, Đấu thầu Vendor, Đơn hàng PO & QR GRN",
    href: "/procurement",
    icon: Package,
    color: "text-blue-300",
  },
  {
    title: "5. Hợp đồng, Chi phí & FIDIC",
    desc: "Hợp đồng A-B, Chứng chỉ IPC, Phát sinh VO, Claims & Dòng tiền",
    href: "/commercial",
    icon: Coins,
    color: "text-violet-300",
  },
  {
    title: "6. Trí tuệ AI & Digital Twin",
    desc: "Zalo/Voice Copilot, Gate 0, AI Swarm Debates & IoT Telemetry",
    href: "/engineering-intelligence",
    icon: Brain,
    color: "text-rose-300",
  },
  {
    title: "7. Quản trị dự án & Hệ thống",
    desc: "Khởi công Đ107, Bàn giao Đ24, CDE Hồ sơ, Nhân sự & Audit Log",
    href: "/governance",
    icon: Landmark,
    color: "text-zinc-300",
    colSpan: "sm:col-span-2",
  },
];

const LIFECYCLE = [
  {
    stage: "GĐ 0",
    title: "Khởi động & Pháp lý",
    desc: "Điều 107 · ĐTM · BOQ TT12",
    href: "/governance?tab=lifecycle",
  },
  {
    stage: "GĐ 1",
    title: "Kỹ thuật không gian",
    desc: "3D BIM · Routing · Nesting",
    href: "/engineering/god-tier-studio",
  },
  {
    stage: "GĐ 2",
    title: "Cung ứng & Vật tư",
    desc: "PO 6 bước · QR GRN cổng",
    href: "/procurement",
  },
  {
    stage: "GĐ 3",
    title: "Hiện trường & HSE",
    desc: "Nhật ký TT06 · AI Vision",
    href: "/site",
  },
  {
    stage: "GĐ 4",
    title: "Nghiệm thu & IPC",
    desc: "Ký số e-Sign · TT96 · FIDIC",
    href: "/commercial",
  },
  {
    stage: "GĐ 5",
    title: "Hoàn công & Bàn giao",
    desc: "T&C · Điều 24 · Digital Twin",
    href: "/governance?tab=lifecycle",
  },
];

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
  // Danh mục nguyên nhân trễ đọc từ code_lists (thay hằng DELAY_REASON_LABEL tĩnh).
  const [delayReasons, setDelayReasons] = useState<{ code: string; label: string }[]>([]);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

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
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition text-on-accent"
              >
                <Upload className="w-4 h-4" />{" "}
                <span className="hidden sm:inline">Import Excel</span>
              </a>
            )}
          </div>
        }
      />

      {/* pb-24 chừa chỗ cho thanh cố định dưới đáy (tìm kiếm/Nghiệm thu/Excel/PDF/Import) */}
      <main className="px-4 sm:px-6 py-6 pb-24 space-y-8 max-w-screen-xl mx-auto">
        {/* ── Tổng quan nhanh — số liệu thật lên đầu trang, trước mọi khối điều hướng ── */}
        <Section
          title="Tổng quan dự án"
          description="Số liệu tổng hợp toàn bộ trang tracking đang theo dõi"
          actions={
            canImport && (
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setNewSheetErr("");
                  setNewSheet({
                    name: "",
                    slug: "",
                    code: "",
                    copyFromId: sheets[sheets.length - 1]?.id ?? "",
                  });
                }}
              >
                Thêm trang
              </Button>
            )
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Tiến độ tổng"
              value={overview.pct}
              unit="%"
              progress={overview.pct / 100}
              tone={overview.pct >= 80 ? "success" : overview.pct >= 50 ? "info" : "warning"}
              hint={`${overview.totalTasks.toLocaleString("vi-VN")} công việc · ${kpiOrder.length} trang`}
              icon={Gauge}
            />
            <StatCard
              label="Đang trễ hạn"
              value={overview.delayed}
              unit="việc"
              tone={overview.delayed > 0 ? "danger" : "success"}
              hint={overview.delayed > 0 ? "Bấm để xem danh sách" : "Toàn bộ đúng hạn"}
              icon={TrendingDown}
              href={overview.delayed > 0 ? "#delayed-table" : undefined}
            />
            <StatCard
              label="NCR đang mở"
              value={data?.quality.ncrOpen ?? 0}
              tone={(data?.quality.ncrOverdue ?? 0) > 0 ? "warning" : "neutral"}
              hint={
                (data?.quality.ncrOverdue ?? 0) > 0
                  ? `${data?.quality.ncrOverdue} phiếu quá hạn xử lý`
                  : "Không có phiếu quá hạn"
              }
              icon={AlertTriangle}
              href="/quality"
            />
            <StatCard
              label="Chờ duyệt của tôi"
              value={
                (data?.approvals?.pendingProposals ?? 0) +
                (data?.approvals?.pendingPurchaseRequests ?? 0)
              }
              tone="neutral"
              hint={`${data?.approvals?.pendingProposals ?? 0} đề xuất · ${data?.approvals?.pendingPurchaseRequests ?? 0} yêu cầu mua`}
              icon={CalendarCheck}
              href="/approvals"
            />
          </div>
        </Section>

        {/* ── Tiến độ từng trang tracking — kéo thả để sắp xếp (Admin/PM) ── */}
        <Section
          title="Tiến độ theo trang tracking"
          description={canImport ? "Kéo thả thẻ để đổi thứ tự hiển thị" : undefined}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {kpiOrder.map((k, i) => {
              const slug = k.sheetSlug ?? slugFromCode(k.sheetType);
              const pct = Math.round((k.avgProgress ?? 0) * 100);
              return (
                <div
                  key={k.sheetId}
                  className="relative group/wrap"
                  draggable={canImport}
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDrop={onDrop}
                >
                  <StatCard
                    label={k.sheetType}
                    value={pct}
                    unit="%"
                    progress={pct / 100}
                    tone={pct >= 80 ? "success" : pct >= 50 ? "info" : "warning"}
                    hint={`${k.total} công việc`}
                    href={slug ? `/tracking/${slug}` : undefined}
                    badge={
                      k.delayed > 0 ? (
                        // Chừa chỗ cho nút xoá nổi ở góc phải khi được sửa (Admin/PM)
                        <Chip
                          tone="danger"
                          icon={AlertTriangle}
                          className={canImport ? "mr-8" : ""}
                        >
                          <span className="tabular-nums">{k.delayed}</span>
                          <span className="sr-only"> hạng mục đang trễ</span>
                        </Chip>
                      ) : undefined
                    }
                    className={canImport ? "pl-6" : undefined}
                  />
                  {canImport && (
                    <>
                      {/* Tay cầm kéo */}
                      <div className="absolute top-4 left-2 text-zinc-700 group-hover/wrap:text-zinc-500 cursor-grab active:cursor-grabbing transition z-10 pointer-events-none">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          deleteSheet(k.sheetId, k.sheetType);
                        }}
                        title="Xoá trang tracking"
                        aria-label={`Xoá trang ${k.sheetType}`}
                        className="absolute top-3 right-2 p-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-500 hover:text-red-300 hover:bg-red-950/50 hover:border-red-800/60 opacity-100 sm:opacity-0 sm:group-hover/wrap:opacity-100 transition z-10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Card hệ (M15) — nhìn nhanh từng hệ, bấm vào trang hub riêng ── */}
        {systems.length > 0 && (
          <Section title="Theo hệ thi công" description={`${systems.length} hệ đang theo dõi`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {systems.map((d) => {
                const c = systemColorClasses(d.color);
                const dpct = Math.round((d.avgProgress ?? 0) * 100);
                return (
                  <CardLink
                    key={d.code}
                    href={`/system/${d.code}`}
                    tone="sunken"
                    pad="sm"
                    className={`flex flex-col justify-between border-l-4 ${c.border} group`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`}
                        aria-hidden="true"
                      />
                      <p className="text-xs font-semibold truncate text-zinc-200 group-hover:text-zinc-50 transition-colors">
                        {d.name}
                      </p>
                    </div>
                    <div className="mt-3">
                      <p
                        className={`text-2xl font-bold font-mono tabular-nums leading-none ${c.text}`}
                      >
                        {dpct}%
                      </p>
                      <div className="flex items-center justify-between mt-1.5 text-[11px]">
                        <span className="text-zinc-400">{d.sheetCount} bảng</span>
                        {d.delayed > 0 ? (
                          <span className="font-semibold text-red-300">{d.delayed} trễ</span>
                        ) : (
                          <span className="text-emerald-300 font-medium">Đúng hạn</span>
                        )}
                      </div>
                    </div>
                  </CardLink>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Trung tâm điều hành: lối tắt tới 7 phân hệ hợp nhất + dải 6 giai đoạn vòng đời.
            Đặt SAU các khối số liệu thật (điều hướng đầy đủ đã có ở sidebar) để trang chủ
            mở ra là thấy ngay tiến độ/việc trễ thay vì hai khối điều hướng cỡ lớn. ── */}
        <Section
          title="Trung tâm điều hành"
          description="7 phân hệ hợp nhất của XBoss — bấm để mở đúng cockpit"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {HUBS.map((hub) => {
              const HubIcon = hub.icon;
              return (
                <CardLink
                  key={hub.href}
                  href={hub.href}
                  tone="sunken"
                  pad="sm"
                  className={`group flex items-start gap-3 ${hub.colSpan ?? ""}`}
                >
                  <span className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0">
                    <HubIcon
                      className={`w-4 h-4 ${hub.color}`}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {hub.title}
                      </span>
                      <ArrowUpRight
                        className="w-3.5 h-3.5 shrink-0 text-zinc-600 group-hover:text-emerald-400 transition-colors"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {hub.desc}
                    </span>
                  </span>
                </CardLink>
              );
            })}
          </div>

          {/* Dải 6 giai đoạn vòng đời — thuần điều hướng theo quy trình, cuộn ngang trên mobile */}
          <div className="overflow-x-auto scrollbar-none">
            <ol className="flex items-stretch gap-2 min-w-max sm:min-w-0">
              {LIFECYCLE.map((stg, idx) => (
                <li key={stg.stage} className="flex items-center gap-2 flex-1">
                  <a
                    href={stg.href}
                    className="flex-1 min-w-[150px] rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 hover:border-zinc-700 hover:bg-zinc-900/80 transition interactive-press"
                  >
                    <span className="block text-[10px] font-mono font-bold uppercase text-zinc-400">
                      {stg.stage}
                    </span>
                    <span className="block text-xs font-semibold text-zinc-200 truncate">
                      {stg.title}
                    </span>
                    <span className="block text-[11px] text-zinc-400 truncate">{stg.desc}</span>
                  </a>
                  {idx < LIFECYCLE.length - 1 && (
                    <ChevronRight
                      className="w-3.5 h-3.5 shrink-0 text-zinc-700 hidden sm:block"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Section>

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
          <Section
            icon={AlertTriangle}
            title={
              <EditableText tkey="dashboard.pareto.title">Nguyên nhân trễ (Pareto)</EditableText>
            }
            description="Bấm thanh để lọc bảng trễ theo lý do"
          >
            <Card pad="lg" className="space-y-2">
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
            </Card>
          </Section>
        )}

        {/* ── Bảng trễ ── */}
        <Section
          id="delayed-table"
          icon={Clock}
          title={<EditableText tkey="dashboard.delayed.title">Danh sách hạng mục trễ</EditableText>}
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
                className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 rounded-lg font-semibold transition text-on-accent"
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
