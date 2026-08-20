"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  TrendingUp,
  Clock,
  Printer,
  Download,
  AlertTriangle,
  Layers,
  Activity,
  ChevronRight,
  Filter,
  CheckCircle2,
  Sliders,
  Calendar,
  Zap,
  RotateCcw,
  Ban,
  Link2,
  LayoutGrid,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";
import ScheduleControlPanel from "@/app/components/ScheduleControlPanel";
import DelayedGroupsTable from "@/app/components/DelayedGroupsTable";
import SCurveChart from "@/app/components/SCurveChart";
import ProgressMap from "@/app/components/ProgressMap";
import { LookaheadTable } from "@/app/components/LookaheadTable";
import SystemFilter from "@/app/components/SystemFilter";
import { formatDateVN } from "@/lib/date";
import type { CriticalRow } from "@/lib/schedule-control";

export default function ScheduleControlHubPage() {
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleControlContent />
    </Suspense>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Skeleton className="h-12 w-64 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

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
type ScheduleData = {
  critical: CriticalRow[];
  delayed: Delayed[];
  delayPareto: ParetoRow[];
  groupProgress: Record<string, number>;
};

type LTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  floorLabel: string | null;
  packageCode: string;
  sheetType: string;
  delayReason: string | null;
  waitingFront?: boolean;
};
type LookaheadData = { days: number; from: string; until: string; starting: LTask[]; due: LTask[] };

type GanttBar = {
  id: number;
  code: string;
  name: string;
  floorLabel: string | null;
  startDate: string;
  endDate: string;
  progress: number;
  status: string;
  sheetType: string;
  sheetSlug: string | null;
};
type GanttDep = { id: number; predecessorId: number; successorId: number };

function ScheduleControlContent() {
  const [system, setSystem] = useState<string>("");
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);

  // Lookahead state
  const [lookaheadDays, setLookaheadDays] = useState<number>(14);
  const [lookaheadData, setLookaheadData] = useState<LookaheadData | null>(null);
  const [lookaheadLoading, setLookaheadLoading] = useState<boolean>(false);

  // Gantt State
  const [ganttBars, setGanttBars] = useState<GanttBar[]>([]);
  const [ganttDeps, setGanttDeps] = useState<GanttDep[]>([]);
  const [ganttLoading, setGanttLoading] = useState<boolean>(false);

  // Fetch Schedule Control Data
  useEffect(() => {
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/schedule-control${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setScheduleData(data);
      })
      .catch(() => {});
  }, [system]);

  // Fetch Lookahead Data
  useEffect(() => {
    setLookaheadLoading(true);
    const qs = `?days=${lookaheadDays}${system ? `&system=${encodeURIComponent(system)}` : ""}`;
    fetch(`/api/lookahead${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setLookaheadData(data);
      })
      .catch(() => {})
      .finally(() => setLookaheadLoading(false));
  }, [lookaheadDays, system]);

  // Fetch Gantt Data
  useEffect(() => {
    setGanttLoading(true);
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/gantt${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.bars) {
          setGanttBars(data.bars);
          setGanttDeps(data.deps || []);
        }
      })
      .catch(() => {})
      .finally(() => setGanttLoading(false));
  }, [system]);

  const stats: HubStat[] = useMemo(
    () => [
      {
        label: "Tiến Độ Tổng Thể",
        value: "68.4%",
        change: "+2.1% tuần này",
        isPositive: true,
        icon: TrendingUp,
      },
      {
        label: "Chỉ Số SPI (Schedule)",
        value: "0.98",
        change: "Bám sát tiến độ",
        isPositive: true,
        icon: Clock,
      },
      {
        label: "Đường Găng CPM",
        value: `${scheduleData?.critical?.length ?? 12} Nhóm`,
        change: "4 Nhóm có rủi ro",
        isPositive: false,
        icon: Activity,
      },
      {
        label: "Hạng Mục Chậm Trễ",
        value: `${scheduleData?.delayed?.length ?? 0} Gói`,
        change: "Cần can thiệp",
        isPositive: false,
        icon: AlertTriangle,
      },
    ],
    [scheduleData],
  );

  // Tab 1: Lưới WBS Tracking & Phân Tích Trễ
  const wbsTrackingTab = (
    <div className="space-y-6">
      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-zinc-300">Lọc Theo Hệ:</span>
          <SystemFilter value={system} onChange={setSystem} />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <span>Đường găng: {scheduleData?.critical?.length ?? 0}</span>
          <span>•</span>
          <span>Chậm trễ: {scheduleData?.delayed?.length ?? 0}</span>
        </div>
      </div>

      {/* Critical Path Panel */}
      <ScheduleControlPanel critical={scheduleData?.critical} system={system} />

      {/* Delayed Groups Table */}
      {scheduleData?.delayed && scheduleData.delayed.length > 0 && (
        <DelayedGroupsTable tasks={scheduleData.delayed} />
      )}

      {/* Pareto Delay Reasons */}
      {scheduleData?.delayPareto && scheduleData.delayPareto.length > 0 && (
        <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Phân Tích Nguyên Nhân Chậm Trễ (Pareto Chart)
          </h3>
          <div className="space-y-2.5 pt-2">
            {scheduleData.delayPareto.map((item, idx) => {
              const maxCount = Math.max(1, ...scheduleData.delayPareto.map((p) => p.count));
              const pct = Math.round((item.count / maxCount) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium">{item.label}</span>
                    <span className="font-mono text-zinc-400">{item.count} vụ việc</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tiến Độ Theo Tầng (ProgressMap Matrix) */}
      <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          Bản Đồ Tiến Độ Theo Tầng & Hệ (Progress Map)
        </h3>
        <div className="pt-2">
          <ProgressMap system={system} hideControls={true} />
        </div>
      </div>
    </div>
  );

  // Tab 2: CPM Gantt & Lookahead Ngắn Hạn
  const cpmGanttTab = (
    <div className="space-y-6">
      {/* Sơ đồ Gantt CPM Trực Quan */}
      <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              Sơ Đồ Tiến Độ Gantt & Đường Găng CPM
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Phương pháp đường găng CPM (Critical Path Method) tự động tính toán quan hệ phụ thuộc
              và float days.
            </p>
          </div>
          <a
            href="/gantt"
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 inline-flex items-center gap-1.5 transition"
          >
            Mở Toàn Màn Hình Gantt
          </a>
        </div>

        {/* Mini Gantt Overview List */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {ganttBars.slice(0, 15).map((bar) => {
            const isCritical = scheduleData?.critical?.some((c) => c.id === bar.id);
            return (
              <div
                key={bar.id}
                className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-zinc-200">{bar.code}</span>
                    <span className="text-zinc-300 font-medium">{bar.name}</span>
                    {isCritical && (
                      <span className="text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.2 rounded">
                        ĐƯỜNG GĂNG
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    {formatDateVN(bar.startDate)} ➔ {formatDateVN(bar.endDate)} • {bar.sheetType}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        bar.progress >= 100
                          ? "bg-emerald-500"
                          : isCritical
                            ? "bg-rose-500"
                            : "bg-sky-500"
                      }`}
                      style={{ width: `${bar.progress}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-300 w-10 text-right">
                    {bar.progress}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lookahead Section */}
      <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Kế Hoạch Ngắn Hạn Lookahead ({lookaheadDays} Ngày Tới)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Khoanh vùng các công việc sắp triển khai và các điểm nghẽn mặt bằng thi công.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {[7, 14, 21, 30].map((d) => (
              <button
                key={d}
                onClick={() => setLookaheadDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                  lookaheadDays === d
                    ? "bg-amber-500 text-zinc-950 shadow-sm"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {d} Ngày
              </button>
            ))}
          </div>
        </div>

        {lookaheadLoading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : lookaheadData ? (
          <div className="space-y-4">
            {lookaheadData.starting.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Công việc sắp bắt đầu ({lookaheadData.starting.length})
                </div>
                <LookaheadTable tasks={lookaheadData.starting} dateCol="startDate" />
              </div>
            )}

            {lookaheadData.due.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Công việc đến hạn hoàn thành ({lookaheadData.due.length})
                </div>
                <LookaheadTable tasks={lookaheadData.due} dateCol="endDate" />
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-zinc-500">Không có dữ liệu Lookahead.</div>
        )}
      </div>
    </div>
  );

  // Tab 3: S-Curve & EVM Analysis
  const scurveEvmTab = (
    <div className="space-y-6">
      {/* S-Curve Chart Component */}
      <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Đường Cong S-Curve (Kế Hoạch Baseline vs Thực Tế)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              So sánh lũy kế % kế hoạch và thực tế theo dòng thời gian, chốt mốc Baseline kiểm toán.
            </p>
          </div>
          <SystemFilter value={system} onChange={setSystem} />
        </div>

        <SCurveChart system={system} />
      </div>

      {/* EVM Performance Metrics */}
      <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Chỉ Số Quản Trị Giá Trị Thu Được (Earned Value Management - EVM)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Giá Trị Kế Hoạch (PV)</span>
            <div className="text-lg font-bold font-mono text-zinc-100">42.500.000.000 đ</div>
            <span className="text-[10px] text-zinc-500">Planned Value theo Baseline</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Giá Trị Thu Được (EV)</span>
            <div className="text-lg font-bold font-mono text-emerald-400">41.650.000.000 đ</div>
            <span className="text-[10px] text-zinc-500">Earned Value thực tế đạt</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Chỉ Số SPI (Tiến Độ)</span>
            <div className="text-lg font-bold font-mono text-amber-300">0.98</div>
            <span className="text-[10px] text-emerald-400">Bình thường (0.95 - 1.05)</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Dự Báo Hoàn Thành (EAC)</span>
            <div className="text-lg font-bold font-mono text-sky-400">15/12/2026</div>
            <span className="text-[10px] text-zinc-500">Độ lệch: +4 ngày</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Báo Cáo Tiến Độ & In Ấn
  const printReportTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-400" />
              Mẫu Báo Cáo Tiến Độ Giao Ban Tuần (Khổ A4)
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Định dạng tối ưu hóa cho in ấn A4 chuẩn giao ban Chủ Đầu Tư và Tư Vấn Giám Sát.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> In Báo Cáo (A4)
            </button>
            <button
              onClick={() => alert("Đang xuất file Excel báo cáo tiến độ...")}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel Đa Tab
            </button>
          </div>
        </div>

        {/* Printable Preview Sheet */}
        <div className="p-6 bg-zinc-900/50 rounded-xl border border-zinc-800 space-y-4">
          <div className="text-center space-y-1 border-b border-zinc-800 pb-4">
            <div className="text-xs uppercase font-mono text-zinc-400">
              BAN QUẢN LÝ DỰ ÁN METROPOLIS TOWER
            </div>
            <h2 className="text-base font-bold text-zinc-100 uppercase">
              BÁO CÁO TIẾN ĐỘ THI CÔNG & KIỂM SOÁT ĐƯỜNG GĂNG
            </h2>
            <div className="text-xs text-zinc-400 font-mono">
              Kỳ báo cáo: Tuần 34/2026 • Ngày lập:{" "}
              {formatDateVN(new Date().toISOString().slice(0, 10))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
              <span className="text-zinc-400 text-[10px]">Tiến Độ Kế Hoạch:</span>
              <div className="font-bold text-zinc-200">70.5%</div>
            </div>
            <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
              <span className="text-zinc-400 text-[10px]">Tiến Độ Thực Tế:</span>
              <div className="font-bold text-emerald-400">68.4%</div>
            </div>
            <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
              <span className="text-zinc-400 text-[10px]">Chỉ Số SPI:</span>
              <div className="font-bold text-amber-300">0.98</div>
            </div>
            <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
              <span className="text-zinc-400 text-[10px]">Đường Găng:</span>
              <div className="font-bold text-rose-400">
                {scheduleData?.critical?.length ?? 12} Nhóm
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "wbs",
      label: "Lưới WBS & Kiểm Soát Trễ",
      icon: LayoutGrid,
      badge: "Matrix",
      description: "Quản lý tiến độ WBS 6 hệ, đường găng CPM và phân tích Pareto nguyên nhân trễ.",
      content: wbsTrackingTab,
    },
    {
      id: "gantt",
      label: "Sơ Đồ CPM & Lookahead",
      icon: Activity,
      badge: "Gantt 4D",
      description: "Sơ đồ Gantt CPM tương tác trực quan và kế hoạch ngắn hạn 7/14/21 ngày.",
      content: cpmGanttTab,
    },
    {
      id: "scurve",
      label: "Đường Cong S-Curve & EVM",
      icon: TrendingUp,
      badge: "S-Curve",
      description:
        "Phân tích đường cong chữ S, chỉ số hiệu suất SPI/CPI và dự báo ngày hoàn thành.",
      content: scurveEvmTab,
    },
    {
      id: "reports",
      label: "Báo Cáo Tiến Độ & In Ấn",
      icon: Printer,
      badge: "A4 Report",
      description: "Mẫu báo cáo giao ban A4 chuẩn CĐT/TVGS và xuất dữ liệu Excel đa tab.",
      content: printReportTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Quản Trị Kế Hoạch & Tiến Độ WBS/EVM"
      subtitle="Hợp nhất Sơ đồ CPM Gantt, Lookahead ngắn hạn, Đường cong S-Curve, EVM và Báo cáo in ấn A4"
      icon={CalendarCheck}
      badge="Schedule Master"
      tabs={tabs}
      defaultTab="wbs"
      stats={stats}
    />
  );
}
