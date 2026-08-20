"use client";
import { Suspense, useState, useEffect } from "react";
import {
  Sparkles,
  Building2,
  Layers,
  Scissors,
  Scan,
  Route,
  Upload,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  QrCode,
  Download,
  Eye,
  Sliders,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

export default function CadBimStudioPage() {
  return (
    <Suspense fallback={<CadBimSkeleton />}>
      <CadBimStudioContent />
    </Suspense>
  );
}

function CadBimSkeleton() {
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

function CadBimStudioContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Mô Hình 3D BIM",
      value: "8 Khối",
      change: "100% LOD 400",
      isPositive: true,
      icon: Building2,
    },
    {
      label: "Va Chạm Không Gian",
      value: "0 Hard Clash",
      change: "Đã nắn tuyến",
      isPositive: true,
      icon: AlertTriangle,
    },
    {
      label: "Tỷ Lệ Tiết Kiệm Phôi",
      value: "98.4%",
      change: "Hao hụt < 1.6%",
      isPositive: true,
      icon: Scissors,
    },
    {
      label: "Sai Lệch Thực Địa (Δ)",
      value: "≤ 8mm",
      change: "Pass QCVN",
      isPositive: true,
      icon: Scan,
    },
  ]);

  const [activeDiscipline, setActiveDiscipline] = useState<string>("all");
  const [floorLevel, setFloorLevel] = useState<string>("FL08");

  // Tab 1: 3D/4D BIM & Digital Twin
  const bimViewerTab = (
    <div className="space-y-4">
      {/* 3D Canvas Mockup & Controls */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Hệ Cơ Điện:
            </span>
            {["all", "hvac", "plumbing", "electrical", "fire"].map((disc) => (
              <button
                key={disc}
                onClick={() => setActiveDiscipline(disc)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeDiscipline === disc
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {disc === "all" ? "Tất cả hệ" : disc.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">Tầng:</span>
            <select
              value={floorLevel}
              onChange={(e) => setFloorLevel(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
            >
              <option value="FL06">Tầng 6 (FL06)</option>
              <option value="FL07">Tầng 7 (FL07)</option>
              <option value="FL08">Tầng 8 (FL08 - Tháp A)</option>
              <option value="FL09">Tầng 9 (FL09)</option>
            </select>
          </div>
        </div>

        {/* Viewport 3D Interactive Canvas Simulation */}
        <div className="relative w-full h-[420px] rounded-xl bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border border-zinc-800/80 flex flex-col items-center justify-center overflow-hidden group">
          {/* Spatial Grid Simulation */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, #3f3f46 1px, transparent 1px), linear-gradient(to bottom, #3f3f46 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* 3D Model Wireframe & Axis */}
          <div className="relative z-10 text-center space-y-3">
            <div className="inline-flex p-4 rounded-2xl bg-zinc-900/90 border border-amber-500/30 shadow-2xl text-amber-400 animate-pulse">
              <Building2 className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">
                WebGPU Instanced Mesh Viewer — TT AVIO Tháp A ({floorLevel})
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                LOD 400 MEPF Digital Twin • Tải trọng 12,450 Draw Calls • Tỷ lệ khung hình 60 FPS
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <a
                href="/engineering/bim-viewer"
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
              >
                <Eye className="w-3.5 h-3.5" /> Mở Trình Xem Fullscreen 3D/4D
              </a>
              <a
                href="/engineering/god-tier-studio"
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors flex items-center gap-1.5 border border-zinc-700"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> God-Tier 4D Studio
              </a>
            </div>
          </div>

          {/* Overlay Status Bar */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-950/80 backdrop-blur border border-zinc-800/80 text-[11px] text-zinc-400 font-mono">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              openBIM BCF 3.0 Live Sync Active
            </span>
            <span>Camera: 3D Perspective (FOV 45°)</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 2: 2D CAD & Shopdrawing Canvas
  const cadShopdrawingTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Drawing Library & Categories */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Phân Loại Bản Vẽ (5 Nhóm)</span>
            <a href="/drawings" className="text-amber-400 hover:underline lowercase font-normal">
              Xem kho lưu trữ
            </a>
          </h3>
          <div className="space-y-1.5">
            {[
              {
                label: "Bản Vẽ Thiết Kế (Design)",
                count: 24,
                href: "/drawings?kind=design",
                color: "text-sky-400",
              },
              {
                label: "Biện Pháp Thi Công (BPTC)",
                count: 12,
                href: "/drawings?kind=method",
                color: "text-amber-400",
              },
              {
                label: "Mô Hình Phối Hợp BIM",
                count: 8,
                href: "/drawings?kind=bim",
                color: "text-emerald-400",
              },
              {
                label: "Shop Drawing Chi Tiết",
                count: 46,
                href: "/drawings?kind=shop",
                color: "text-violet-400",
              },
              {
                label: "Bản Vẽ Hoàn Công (As-Built)",
                count: 18,
                href: "/drawings?kind=asbuilt",
                color: "text-rose-400",
              },
            ].map((item, idx) => (
              <a
                key={idx}
                href={item.href}
                className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/60 border border-zinc-800/80 transition-all text-xs"
              >
                <span className={`font-medium ${item.color}`}>{item.label}</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                  {item.count} bản
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* 2D Canvas & AutoLISP Studio Shortcut */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-amber-400" />
                2D Vector CAD Studio & AutoLISP Generator
              </h3>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                DXF / DWG v2024
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Tự động hóa bóc tách khối lượng từ CAD (Block Attributes & Polyline Length), sinh mã
              AutoLISP tự động vẽ côn chuyển tiết diện ống gió, chấm mốc không gian (Spatial
              Annotations) và đối soát khối lượng 3 chiều với BOQ.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
            <a
              href="/engineering/cad"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-center text-xs font-medium text-zinc-200 transition-colors block"
            >
              Mở CAD Studio (M65)
            </a>
            <a
              href="/engineering/spatial-viewer"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-center text-xs font-medium text-zinc-200 transition-colors block"
            >
              Spatial Pinning (M74)
            </a>
            <a
              href="/drawings"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-center text-xs font-medium text-zinc-200 transition-colors block col-span-2 sm:col-span-1"
            >
              Kho Bản Vẽ Toàn Dự Án
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 3: Generative MEPF & Auto-Routing
  const generativeRoutingTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Route className="w-4 h-4 text-amber-400" />
              Generative Multi-Tier Corridor & 3D A* Auto-Routing
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quy hoạch ma trận cao độ hành lang kỹ thuật, tự động nắn tuyến tránh dầm và giải quyết
              va chạm lỗ khoét.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/engineering/auto-routing"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              3D Auto-Routing (M77)
            </a>
            <a
              href="/engineering/cad-corridor"
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              Hành Lang & Giá Treo (M92)
            </a>
          </div>
        </div>

        {/* Corridor Altitude Tier Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-sky-400">
              Tier 1 — Top (+3200mm)
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">Ống Gió Lớn HVAC</h4>
            <p className="text-[11px] text-zinc-400">Tuyến chính cấp/hồi gió tươi</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-amber-400">
              Tier 2 — Mid (+2850mm)
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">Máng Cáp Điện & ELV</h4>
            <p className="text-[11px] text-zinc-400">Khay cáp nguồn và tín hiệu</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-emerald-400">
              Tier 3 — Bot (+2550mm)
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">Ống Cấp/Thoát Nước</h4>
            <p className="text-[11px] text-zinc-400">Độ dốc trọng lực 1.5% – 2.0%</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-rose-400">
              Tier 4 — Ceil (+2400mm)
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">PCCC Sprinkler</h4>
            <p className="text-[11px] text-zinc-400">Đầu phun tự động đạt chuẩn QCVN 06</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: DfMA Pre-Fabrication & Nesting
  const dfmaNestingTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-amber-400" />
              1D Pipe Cutting & 2D Duct Guillotine Nesting
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              FFD Algorithm
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Thuật toán tối ưu hóa cắt ống thép 1D (First-Fit Decreasing) khống chế hao hụt dưới 1.6%
            và xếp phôi tôn ống gió 2D khổ 1200x2400mm, tự động sinh mã QR tem xưởng phục vụ lắp ráp
            cụm Spool tiền chế.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/cad-nesting"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Mở Studio Cắt Phôi & Thủy Lực (M89)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              CNC G-Code Generator & QR Spool Tracking
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Plasma / Laser</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Xuất tập lệnh điều khiển máy cắt Plasma CNC (G00, G01, M03, M05) từ mô hình 3D, trừ bù
            độ ngập âm Socket Depth và mã hóa tem QR truy xuất nguồn gốc từng cụm Spooling.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/qr-logistics"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Quản Lý QR Logistics & GRN (M78)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 5: Reality Capture & Scan-to-BIM
  const scanToBimTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Scan className="w-4 h-4 text-amber-400" />
              LiDAR Reality Capture, Scan-to-BIM & As-Built Certification
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Thuật toán RANSAC 3D Cylinder Fitting so khớp đám mây điểm thực địa so với BIM thiết
              kế.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/engineering/scan-to-bim"
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              Scan-to-BIM Engine (M70)
            </a>
            <a
              href="/engineering/pipe-stash-hunter"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              Pipe Stash Hunter (M95)
            </a>
          </div>
        </div>

        {/* Deviation Threshold Gauge */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <span className="text-[10px] font-mono uppercase font-bold">
              Dung Sai Cho Phép (Pass)
            </span>
            <div className="text-lg font-bold font-mono mt-1">Δ ≤ 15mm</div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Tự động nghiệm thu vào hồ sơ hoàn công
            </p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <span className="text-[10px] font-mono uppercase font-bold">
              Cảnh Báo Lệch Tuyến (Warning)
            </span>
            <div className="text-lg font-bold font-mono mt-1">15mm &lt; Δ ≤ 35mm</div>
            <p className="text-[11px] text-zinc-400 mt-0.5">Yêu cầu TVGS kiểm tra và nắn chỉnh</p>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
            <span className="text-[10px] font-mono uppercase font-bold">
              Vi Phạm Không Gian (Critical)
            </span>
            <div className="text-lg font-bold font-mono mt-1">Δ &gt; 35mm</div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Tự động khóa và lập phiếu NCR hiện trường
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "bim",
      label: "3D/4D BIM Viewer",
      icon: Building2,
      badge: "LOD 400",
      description:
        "Mô hình 3D WebGPU, bộ lọc hệ MEPF, mặt cắt 3D, va chạm BCF và mô phỏng 4D WBS thời gian thực.",
      content: bimViewerTab,
    },
    {
      id: "cad",
      label: "2D CAD & Shopdrawing",
      icon: Layers,
      badge: "5 Nhóm",
      description:
        "Canvas vector 2D, Block catalog, Spatial Pinning, AutoLISP và kho bản vẽ toàn dự án.",
      content: cadShopdrawingTab,
    },
    {
      id: "routing",
      label: "Generative & Routing",
      icon: Route,
      badge: "3D A*",
      description:
        "Tự động tìm tuyến nắn ống tránh dầm, ma trận lỗ khoét Beam Sleeve và giá treo Trapeze.",
      content: generativeRoutingTab,
    },
    {
      id: "dfma",
      label: "DfMA & Nesting CNC",
      icon: Scissors,
      badge: "98.4%",
      description: "Tối ưu hóa cắt ống 1D, xếp tôn 2D, xuất G-Code CNC và in mã QR Spool tiền chế.",
      content: dfmaNestingTab,
    },
    {
      id: "scan",
      label: "Scan-to-BIM & As-Built",
      icon: Scan,
      badge: "LiDAR",
      description:
        "So khớp đám mây điểm Point Cloud với BIM, tính sai lệch Δ và đóng dấu hoàn công NĐ 06.",
      content: scanToBimTab,
    },
  ];

  return (
    <HubShell
      title="God-Tier 4D CAD/BIM Studio (M96)"
      subtitle="Phân hệ đỉnh cao công nghệ hợp nhất WebGPU 3D/4D, LiDAR Scan-to-BIM, openBIM BCF 3.0, CNC G-Code & Auto-Routing"
      icon={Sparkles}
      badge="God-Tier Apex"
      tabs={tabs}
      defaultTab="bim"
      stats={stats}
    />
  );
}
