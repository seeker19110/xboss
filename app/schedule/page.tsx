"use client";
import { Suspense, useState } from "react";
import {
  CalendarCheck,
  LayoutGrid,
  TrendingUp,
  FileText,
  Wind,
  Zap,
  Droplets,
  Flame,
  Building2,
  PaintRoller,
  Printer,
  Download,
  AlertTriangle,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

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

function ScheduleControlContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Tiến Độ Tổng Thể",
      value: "68.4%",
      change: "+2.1% tuần này",
      isPositive: true,
      icon: TrendingUp,
    },
    {
      label: "Chỉ Số Tiến Độ SPI",
      value: "0.98",
      change: "Bám sát kế hoạch",
      isPositive: true,
      icon: Clock,
    },
    {
      label: "Công Việc Trễ Hạn",
      value: "8 Task",
      change: "Cần xử lý bù tiến độ",
      isPositive: false,
      icon: AlertTriangle,
    },
    {
      label: "Số Hệ Đang Thi Công",
      value: "6 Hệ",
      change: "WBS Cấp 4",
      isPositive: true,
      icon: LayoutGrid,
    },
  ]);

  const systems = [
    {
      code: "acmv",
      name: "Hệ ACMV (Thông Gió & ĐHKK)",
      icon: Wind,
      color: "text-sky-400",
      progress: 72,
      href: "/progress/acmv",
    },
    {
      code: "dien",
      name: "Hệ Thống Điện & Chiếu Sáng",
      icon: Zap,
      color: "text-amber-400",
      progress: 65,
      href: "/progress/dien",
    },
    {
      code: "nuoc",
      name: "Cấp Thoát Nước (Plumbing)",
      icon: Droplets,
      color: "text-blue-400",
      progress: 78,
      href: "/progress/nuoc",
    },
    {
      code: "pccc",
      name: "PCCC & Báo Cháy Tự Động",
      icon: Flame,
      color: "text-rose-400",
      progress: 60,
      href: "/progress/pccc",
    },
    {
      code: "ket_cau",
      name: "Kết Cấu Bê Tông Cốt Thép",
      icon: Building2,
      color: "text-zinc-300",
      progress: 95,
      href: "/progress/ket_cau",
    },
    {
      code: "xay_to",
      name: "Xây Tô & Hoàn Thiện Tường",
      icon: PaintRoller,
      color: "text-emerald-400",
      progress: 84,
      href: "/progress/xay_to",
    },
  ];

  // Tab 1: WBS Tracking Grid Across 6 Systems
  const wbsTrackingTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-amber-400" />
              Ma Trận Theo Dõi Tiến Độ WBS 6 Hệ Thống
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Lưới checkbox dimension thời gian thực, tự động tính toán % hoàn thành và đồng bộ
              ngoại tuyến PWA.
            </p>
          </div>
          <a
            href="/schedule-control"
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
          >
            Trung Tâm Điều Khiển Tiến Độ
          </a>
        </div>

        {/* 6 Systems Bento Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
          {systems.map((sys) => {
            const SysIcon = sys.icon;
            return (
              <a
                key={sys.code}
                href={sys.href}
                className="p-4 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-zinc-800 transition-all space-y-3 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300 group-hover:text-amber-400 transition-colors">
                      <SysIcon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-200">{sys.name}</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Tiến độ thực tế</span>
                    <span className="font-bold font-mono text-zinc-100">{sys.progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${sys.progress}%` }}
                    />
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Tab 2: CPM Gantt & Lookahead
  const ganttLookaheadTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-amber-400" />
              Sơ Đồ Tiến Độ Gantt & Đường Găng CPM
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Critical Path
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Mô phỏng toàn bộ chuỗi công việc phụ thuộc (FS, SS, FF), xác định các công tác nằm trên
            đường găng ảnh hưởng trực tiếp đến mốc bàn giao công trình.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <a
              href="/gantt"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Mở Biểu Đồ Gantt
            </a>
            <a
              href="/timeline"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Dòng Thời Gian (Timeline)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              Kế Hoạch Ngắn Hạn Lookahead 7/14/21 Ngày
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Short-Term Plan</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Lập kế hoạch thi công tuần và 3 tuần tới, rà soát các điều kiện tiên quyết (Mặt bằng,
            Bản vẽ, Vật tư, Nhân lực) trước khi công việc bắt đầu ngoài hiện trường.
          </p>
          <div className="pt-2">
            <a
              href="/lookahead"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Xem Kế Hoạch Lookahead
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 3: EVM & S-Curve Analysis
  const evmScurveTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Phân Tích Giá Trị Thu Được EVM & Đường Cong S-Curve
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              So sánh đường kế hoạch (Planned Value) và đường thực tế (Earned Value) từ nhật ký lịch
              sử.
            </p>
          </div>
          <a
            href="/scurve"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
          >
            Mở Biểu Đồ S-Curve Toàn Màn Hình
          </a>
        </div>

        {/* EVM Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-zinc-400">
              Hiệu Suất Tiến Độ (SPI)
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400">0.98</div>
            <p className="text-[11px] text-zinc-400">EV / PV (Đạt 98% kế hoạch đề ra)</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-zinc-400">
              Hiệu Suất Chi Phí (CPI)
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400">1.02</div>
            <p className="text-[11px] text-zinc-400">EV / AC (Tiết kiệm 2% ngân sách)</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-zinc-400">
              Dự Báo Hoàn Thành (EAC)
            </span>
            <div className="text-xl font-bold font-mono text-zinc-100">15/12/2026</div>
            <p className="text-[11px] text-emerald-400 font-medium">
              Đúng hạn mốc cất nóc & hoàn thiện
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Reports & Excel Export
  const reportsTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              Tổng Hợp Báo Cáo Tiến Độ & Xuất Dữ Liệu
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Báo cáo ngày/tuần in A4 sạch đẹp theo tiêu chuẩn `@media print` và xuất file Excel đa
              sheet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/report"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Printer className="w-3.5 h-3.5" /> Bản In Báo Cáo A4
            </a>
            <a
              href="/reports"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              Kho Báo Cáo Lưu
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "wbs",
      label: "Lưới WBS 6 Hệ",
      icon: LayoutGrid,
      badge: "6 Hệ",
      description:
        "Ma trận theo dõi tiến độ chi tiết theo từng kích thước ống và căn hộ của 6 hệ cơ điện.",
      content: wbsTrackingTab,
    },
    {
      id: "gantt-cpm",
      label: "Gantt & Lookahead",
      icon: CalendarCheck,
      badge: "CPM",
      description:
        "Sơ đồ tiến độ đường găng CPM, phân tích Baseline và kế hoạch ngắn hạn 7/14/21 ngày.",
      content: ganttLookaheadTab,
    },
    {
      id: "evm-scurve",
      label: "EVM & S-Curve",
      icon: TrendingUp,
      badge: "SPI 0.98",
      description:
        "Phân tích giá trị thu được EVM, đường cong S-Curve và dự báo tiến độ hoàn thành EAC.",
      content: evmScurveTab,
    },
    {
      id: "reports",
      label: "Báo Cáo & In Ấn",
      icon: FileText,
      badge: "A4 / Excel",
      description: "Tổng hợp báo cáo tiến độ in ấn A4 và xuất dữ liệu tracking ra file Excel gốc.",
      content: reportsTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Quản Trị Kế Hoạch & Tiến Độ WBS"
      subtitle="Phân hệ hợp nhất 15 công cụ Theo dõi 6 hệ, Sơ đồ CPM Gantt, Lookahead, S-Curve, EVM và Báo cáo A4"
      icon={CalendarCheck}
      badge="Schedule Controller"
      tabs={tabs}
      defaultTab="wbs"
      stats={stats}
    />
  );
}
