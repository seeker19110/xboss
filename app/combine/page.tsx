"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Split,
  Box,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  RefreshCw,
  Copy,
  Check,
  Plus,
  Trash2,
  Maximize2,
  Route,
  Activity,
  Workflow,
  Sparkles,
  ArrowRight,
  TrendingUp,
  FileCheck,
  Compass,
  Zap,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import { showToast } from "@/app/components/Toast";
import { redirectToLogin } from "@/app/lib/me";

interface CorridorSystem {
  id: string;
  systemCode: string;
  name: string;
  discipline: "hvac" | "electrical" | "plumbing" | "firefighting";
  widthMm: number;
  heightOrDiaMm: number;
  weightKgPerM: number;
  insulationThicknessMm: number;
  elevationBopMm: number;
  lateralPositionMm: number;
  corridorTier: "Tier 1 (Gió)" | "Tier 2 (Điện)" | "Tier 3 (Nước)" | "Sprinkler Sát Trần";
  combineStatus: "clean" | "clash_risk" | "verified";
  soffitClearanceMm: number;
}

interface ClashIssue {
  id: string;
  code: string;
  type: "hard_clash" | "soft_clearance" | "beam_interference" | "slope_violation";
  elementA: string;
  elementB: string;
  disciplineA: string;
  disciplineB: string;
  location: [number, number, number];
  severity: "critical" | "high" | "medium";
  clearanceMm: number;
  status: "open" | "resolved" | "reviewing";
  proposedAction: string;
  rerouteSolutions: Array<{
    optionName: string;
    description: string;
    fittingAngleDeg: number;
    extraCostVnd: number;
    headLossDeltaPa: number;
    isOptimal: boolean;
  }>;
}

interface BeamSleeve {
  id: string;
  code: string;
  beamRef: string;
  beamSpanMm: number;
  beamDepthMm: number;
  sleeveDiameterMm: number;
  positionX: number; // distance from beam start
  positionRatio: number; // x / L
  topClearanceMm: number;
  bottomClearanceMm: number;
  isCompliant: boolean;
  system: string;
  status: "approved" | "pending_structural" | "rejected";
}

export default function CombinePage() {
  const [activeTab, setActiveTab] = useState<
    "corridor" | "clash_solver" | "auto_routing" | "beam_sleeves"
  >("clash_solver");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Tab 1: Multi-Tier Corridor Planner State ──
  const [corridorWidth, setCorridorWidth] = useState(2400);
  const [corridorClearHeight, setCorridorClearHeight] = useState(2600);
  const [slabElevation, setSlabElevation] = useState(3500);
  const [beamBottomElevation, setBeamBottomElevation] = useState(3100);
  const [ceilingElevation, setCeilingElevation] = useState(2600);

  const [corridorSystems, setCorridorSystems] = useState<CorridorSystem[]>([
    {
      id: "SYS-01",
      systemCode: "M-DUCT-SUPPLY-01",
      name: "Tuyến ống gió cấp chính AHU-01",
      discipline: "hvac",
      widthMm: 800,
      heightOrDiaMm: 300,
      weightKgPerM: 25.0,
      insulationThicknessMm: 25,
      elevationBopMm: 2750,
      lateralPositionMm: 150,
      corridorTier: "Tier 1 (Gió)",
      combineStatus: "verified",
      soffitClearanceMm: 225,
    },
    {
      id: "SYS-02",
      systemCode: "M-DUCT-RETURN-01",
      name: "Tuyến ống gió hồi hành lang",
      discipline: "hvac",
      widthMm: 600,
      heightOrDiaMm: 300,
      weightKgPerM: 20.0,
      insulationThicknessMm: 25,
      elevationBopMm: 2750,
      lateralPositionMm: 1050,
      corridorTier: "Tier 1 (Gió)",
      combineStatus: "verified",
      soffitClearanceMm: 225,
    },
    {
      id: "SYS-03",
      systemCode: "E-TRAY-POWER-01",
      name: "Máng cáp động lực hạ thế 3P+N",
      discipline: "electrical",
      widthMm: 400,
      heightOrDiaMm: 100,
      weightKgPerM: 35.0,
      insulationThicknessMm: 0,
      elevationBopMm: 2800,
      lateralPositionMm: 1750,
      corridorTier: "Tier 2 (Điện)",
      combineStatus: "verified",
      soffitClearanceMm: 450,
    },
    {
      id: "SYS-04",
      systemCode: "P-CHW-SUPPLY-DN150",
      name: "Ống Chiller cấp nước lạnh DN150",
      discipline: "plumbing",
      widthMm: 168,
      heightOrDiaMm: 168,
      weightKgPerM: 32.0,
      insulationThicknessMm: 32,
      elevationBopMm: 2368,
      lateralPositionMm: 200,
      corridorTier: "Tier 3 (Nước)",
      combineStatus: "clean",
      soffitClearanceMm: 600,
    },
    {
      id: "SYS-05",
      systemCode: "P-DRAIN-SOIL-D114",
      name: "Ống thoát nước thải sinh hoạt dốc 1.5%",
      discipline: "plumbing",
      widthMm: 114,
      heightOrDiaMm: 114,
      weightKgPerM: 14.0,
      insulationThicknessMm: 0,
      elevationBopMm: 2250,
      lateralPositionMm: 500,
      corridorTier: "Tier 3 (Nước)",
      combineStatus: "clash_risk",
      soffitClearanceMm: 150,
    },
    {
      id: "SYS-06",
      systemCode: "F-SPK-MAIN-DN65",
      name: "Tuyến ống chữa cháy Sprinkler",
      discipline: "firefighting",
      widthMm: 76,
      heightOrDiaMm: 76,
      weightKgPerM: 15.0,
      insulationThicknessMm: 0,
      elevationBopMm: 2680,
      lateralPositionMm: 800,
      corridorTier: "Sprinkler Sát Trần",
      combineStatus: "verified",
      soffitClearanceMm: 420,
    },
  ]);

  // Trapeze Hanger State
  const [hangerSpanMm, setHangerSpanMm] = useState(1600);
  const [hangerDropMm, setHangerDropMm] = useState(800);
  const [hangerSpacingM, setHangerSpacingM] = useState(1.5);
  const [trapezeResult, setTrapezeResult] = useState({
    totalLoadN: 2450,
    bendingStressMpa: 82.5,
    maxAllowedStressMpa: 160.0,
    deflectionMm: 1.45,
    maxAllowedDeflectionMm: 4.44, // L / 360
    selectedProfile: "Unistrut P1000 (41x41x2.5mm)",
    selectedRod: "Ty ren M12 (Cấp bền 4.8)",
    isStructuralSafe: true,
  });

  // ── Tab 2: Clash Solver & Priority Matrix State ──
  const [clashList, setClashList] = useState<ClashIssue[]>([
    {
      id: "CLASH-01",
      code: "CL-M-P-001",
      type: "hard_clash",
      elementA: "Ống Chiller Cấp Nước Lạnh DN150 (P-CHW-01)",
      elementB: "Tuyến Ống Gió Hồi 600x400 (M-DUCT-RET-02)",
      disciplineA: "Cấp Thoát Nước (P)",
      disciplineB: "Điều Hòa Thông Gió (M)",
      location: [5400, 2400, 2650],
      severity: "critical",
      clearanceMm: -35,
      status: "open",
      proposedAction:
        "Áp dụng Invariant 1: Tuyến ống nước Chiller uốn né 45° đi xuống dưới ống gió.",
      rerouteSolutions: [
        {
          optionName: "Phương án 1 (Tối ưu)",
          description: "Ống Chiller DN150 uốn né 45° luồn xuống dưới ống gió (BOP=+2350mm)",
          fittingAngleDeg: 45,
          extraCostVnd: 1200000,
          headLossDeltaPa: 12.5,
          isOptimal: true,
        },
        {
          optionName: "Phương án 2",
          description: "Chuyển tiết diện ống gió sang 800x250 dẹt để tăng tĩnh không",
          fittingAngleDeg: 0,
          extraCostVnd: 2800000,
          headLossDeltaPa: 24.0,
          isOptimal: false,
        },
        {
          optionName: "Phương án 3",
          description: "Né ngang sang Trục C (Tăng chiều dài ống Chiller +1.2m)",
          fittingAngleDeg: 45,
          extraCostVnd: 3500000,
          headLossDeltaPa: 35.0,
          isOptimal: false,
        },
      ],
    },
    {
      id: "CLASH-02",
      code: "CL-E-P-002",
      type: "soft_clearance",
      elementA: "Thang Máng Cáp Động Lực 400x100 (E-TRAY-01)",
      elementB: "Ống Cấp Nước Lạnh PPR DN50 (P-DOM-COLD)",
      disciplineA: "Điện (E)",
      disciplineB: "Cấp Thoát Nước (P)",
      location: [8200, 3200, 2800],
      severity: "high",
      clearanceMm: 45,
      status: "open",
      proposedAction:
        "Áp dụng Invariant 8: Khoảng cách cách ly giữa máng điện và ống nước phải ≥ 150mm.",
      rerouteSolutions: [
        {
          optionName: "Phương án 1 (Tối ưu)",
          description:
            "Dịch chuyển máng điện sang mép phải hành lang thêm 120mm (Đạt khoảng hở 165mm)",
          fittingAngleDeg: 0,
          extraCostVnd: 450000,
          headLossDeltaPa: 0,
          isOptimal: true,
        },
      ],
    },
    {
      id: "CLASH-03",
      code: "CL-STR-M-003",
      type: "beam_interference",
      elementA: "Dầm Kết Cấu Chính D2 (Khổ 400x750)",
      elementB: "Ống Gió Cấp Chính 800x400 (M-DUCT-SUPP)",
      disciplineA: "Kết Cấu (S)",
      disciplineB: "Điều Hòa Thông Gió (M)",
      location: [11200, 2400, 2950],
      severity: "critical",
      clearanceMm: -80,
      status: "resolved",
      proposedAction:
        "Áp dụng Invariant 2: Chuyển ống gió luồn dưới đáy dầm và chuyển tiết diện dẹt 1000x250.",
      rerouteSolutions: [
        {
          optionName: "Phương án 1 (Đã duyệt)",
          description: "Côn chuyển tiết diện dẹt 1000x250 đi sát đáy dầm (Tĩnh không +2700mm)",
          fittingAngleDeg: 15,
          extraCostVnd: 1850000,
          headLossDeltaPa: 16.0,
          isOptimal: true,
        },
      ],
    },
  ]);

  // ── Tab 3: 3D Auto-Routing State ──
  const [startPoint, setStartPoint] = useState({ x: 1200, y: 2000, z: 2800 });
  const [endPoint, setEndPoint] = useState({ x: 15400, y: 3800, z: 2600 });
  const [routingResult, setRoutingResult] = useState({
    totalLengthMm: 16800,
    elbowCount45: 2,
    elbowCount90: 2,
    clashFree: true,
    waypoints: [
      { step: 1, x: 1200, y: 2000, z: 2800, note: "Điểm xuất phát AHU-01" },
      { step: 2, x: 5400, y: 2000, z: 2800, note: "Tuyến thẳng trục A-B" },
      { step: 3, x: 5800, y: 2400, z: 2550, note: "Né dầm D2 uốn 45° hạ cao độ" },
      { step: 4, x: 11200, y: 2400, z: 2550, note: "Tuyến dưới dầm" },
      { step: 5, x: 15400, y: 3800, z: 2600, note: "Điểm nối trục đứng Shaft" },
    ],
  });

  // ── Tab 4: Beam Sleeve Safety Guard State ──
  const [sleeves, setSleeves] = useState<BeamSleeve[]>([
    {
      id: "SL-01",
      code: "SL-M-D2-01",
      beamRef: "Dầm Chính D2 (Trục 3 / A-B)",
      beamSpanMm: 6000,
      beamDepthMm: 750,
      sleeveDiameterMm: 200,
      positionX: 2500,
      positionRatio: 0.417, // 2500 / 6000 = 41.7% (Nằm trong 1/3 giữa nhịp 33% - 67%)
      topClearanceMm: 80,
      bottomClearanceMm: 70,
      isCompliant: true,
      system: "Ống Cấp Nước Lạnh Chiller DN150",
      status: "approved",
    },
    {
      id: "SL-02",
      code: "SL-P-D3-02",
      beamRef: "Dầm Phụ D3 (Trục 4 / B-C)",
      beamSpanMm: 5000,
      beamDepthMm: 600,
      sleeveDiameterMm: 150,
      positionX: 2200,
      positionRatio: 0.44, // 44% (An toàn)
      topClearanceMm: 65,
      bottomClearanceMm: 65,
      isCompliant: true,
      system: "Ống Thoát Nước Mưa D114",
      status: "approved",
    },
    {
      id: "SL-03",
      code: "SL-E-D1-03",
      beamRef: "Dầm Biên D1 (Trục 1 / C-D)",
      beamSpanMm: 6000,
      beamDepthMm: 700,
      sleeveDiameterMm: 280, // Quá lớn (H/3 = 233mm)
      positionX: 800, // Quá gần gối dầm (800/6000 = 13.3% < 33.3%)
      positionRatio: 0.133,
      topClearanceMm: 35,
      bottomClearanceMm: 40,
      isCompliant: false,
      system: "Máng Cáp Điện Nguồn",
      status: "rejected",
    },
  ]);

  const handleResolveClash = (clashId: string) => {
    setClashList((prev) => prev.map((c) => (c.id === clashId ? { ...c, status: "resolved" } : c)));
    showToast("Đã đánh dấu trên bản mô phỏng này (không ghi vào hồ sơ dự án).");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Split className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-zinc-100 text-sm sm:text-base uppercase">
                  PHỐI HỢP COMBINE & NÉ TRÁNH VA CHẠM (CLASH SOLVER)
                </span>
                <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400 border border-amber-500/20">
                  LOD 350–400 • TT AVIO
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 line-clamp-1">
                Quy Hoạch Hành Lang Đa Tầng (Tier 1/2/3), Ma Trận Ưu Tiên 12 Invariants & Giải Thuật
                Né Xung Đột Không Gian Tự Động
              </span>
            </div>
          </div>
        }
        bottomActions={
          <div className="flex items-center gap-2">
            <Link
              href="/mo-hinh-bim"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
            >
              <Box className="w-3.5 h-3.5 text-sky-400" />
              <span>Mô hình BIM 3D</span>
            </Link>
          </div>
        }
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        <ThuNghiemBanner moduleKey="combine" />
        {/* ── METRICS SUMMARY CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Tỷ Lệ Xử Lý Clash</span>
            <div className="text-2xl font-bold font-mono text-emerald-400">96.4%</div>
            <span className="text-[10px] text-zinc-400">Đã né va chạm tự động</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Va Chạm Cứng (Hard)</span>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {clashList.filter((c) => c.status === "open").length} Cần Xử Lý
            </div>
            <span className="text-[10px] text-zinc-400">Ưu tiên hệ thoát nước</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Lỗ Mở Dầm Hợp Lệ</span>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {sleeves.filter((s) => s.isCompliant).length} / {sleeves.length}
            </div>
            <span className="text-[10px] text-zinc-400">Vùng L/3 giữa nhịp dầm</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Độ Dốc Thoát Nước</span>
            <div className="text-2xl font-bold font-mono text-sky-400">1.50%</div>
            <span className="text-[10px] text-emerald-400">Bảo toàn 100% không gãy</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Tĩnh Không Hoàn Thiện</span>
            <div className="text-2xl font-bold font-mono text-zinc-200">2,600 mm</div>
            <span className="text-[10px] text-zinc-400">Đạt chuẩn kiến trúc</span>
          </div>
        </div>

        {/* ── NAVIGATION TABS ── */}
        <div className="p-2 sm:p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab("clash_solver")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                activeTab === "clash_solver"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>1. Động Cơ Né Va Chạm (Clash Solver)</span>
            </button>

            <button
              onClick={() => setActiveTab("corridor")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                activeTab === "corridor"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>2. Quy Hoạch Hành Lang Đa Tầng (Multi-Tier & Trapeze)</span>
            </button>

            <button
              onClick={() => setActiveTab("auto_routing")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                activeTab === "auto_routing"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Route className="w-3.5 h-3.5" />
              <span>3. Tự Động Định Tuyến 3D (Auto-Routing)</span>
            </button>

            <button
              onClick={() => setActiveTab("beam_sleeves")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 min-h-[40px] ${
                activeTab === "beam_sleeves"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>4. Sổ Bộ Lỗ Mở Xuyên Dầm (Beam Sleeves)</span>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: ĐỘNG CƠ GIẢI QUYẾT XUNG ĐỘT & NÉ VA CHẠM (CLASH SOLVER)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "clash_solver" && (
          <div className="space-y-4">
            {/* 12 Invariants Checklist Banner */}
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Bộ Quy Tắc Bất Biến Né Va Chạm (The 12 Apex Invariants)</span>
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">
                  ISO 19650 / QCVN 18:2021
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Bảo toàn Độ dốc Trọng lực</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Ống thoát nước giữ nguyên độ dốc 1.0% - 2.0%. Cấm bẻ cong làm mất dốc. Hệ áp lực
                    (Cấp nước/Chiller/PCCC) bắt buộc uốn né 45° qua hệ thoát nước.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Vùng An Toàn Xuyên Dầm (Sleeve)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Lỗ mở xuyên dầm chỉ đặt tại 1/3 giữa nhịp (L/3 ≤ x ≤ 2L/3), đường kính Dsleeve ≤
                    Hdầm/3, cách mép trên/dưới dầm tối thiểu 50mm.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Bù Trừ Dài Tuyến & Gót Miệng Gió</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Gót hộp gió rộng hơn cổ miệng gió đúng +10mm; bù trừ chiều dài tích lũy từ bích
                    TDC để giữ 100% tim miệng gió vào ô trần 600x600mm.
                  </p>
                </div>
              </div>
            </div>

            {/* Clash Detection & Automated Rerouting List */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Danh Sách Xung Đột Không Gian & Giải Pháp Nắn Tuyến Tự Động
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Phát hiện tự động các điểm giao cắt, vi phạm tĩnh không và đề xuất 3 phương án
                    nắn tuyến tối ưu.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  {clashList.length} xung đột ghi nhận • Tầng 4 Tháp A
                </span>
              </div>

              <div className="space-y-4">
                {clashList.map((clash) => (
                  <div
                    key={clash.id}
                    className={`p-4 rounded-xl border space-y-3 transition ${
                      clash.status === "resolved"
                        ? "bg-zinc-950/40 border-zinc-800/80 opacity-80"
                        : "bg-zinc-950 border-rose-500/30"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-bold">
                          {clash.code}
                        </span>
                        <span className="text-xs font-bold text-zinc-100">{clash.elementA}</span>
                        <span className="text-xs text-zinc-400">↔</span>
                        <span className="text-xs font-bold text-zinc-200">{clash.elementB}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-400">
                          Tọa độ: [{clash.location.join(", ")}]
                        </span>
                        {clash.status === "resolved" ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Đã Nắn Tuyến
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolveClash(clash.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-on-accent text-xs font-semibold shadow-xs transition"
                          >
                            Đánh Dấu Đã Xem
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-amber-300 font-sans">{clash.proposedAction}</p>

                    {/* 3 Rerouting Solutions Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                      {clash.rerouteSolutions.map((sol, sIdx) => (
                        <div
                          key={sIdx}
                          className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                            sol.isOptimal
                              ? "bg-amber-500/5 border-amber-500/40 text-zinc-200"
                              : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-bold ${sol.isOptimal ? "text-amber-400" : "text-zinc-300"}`}
                            >
                              {sol.optionName}
                            </span>
                            {sol.isOptimal && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                Khuyến nghị
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] line-clamp-2">{sol.description}</p>
                          <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-zinc-400 border-t border-zinc-800/80">
                            <span>Chi phí: +{sol.extraCostVnd.toLocaleString("vi-VN")} đ</span>
                            <span>Tổn thất: +{sol.headLossDeltaPa} Pa</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: QUY HOẠCH HÀNH LANG ĐA TẦNG (MULTI-TIER & TRAPEZE)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "corridor" && (
          <div className="space-y-4">
            {/* Corridor Geometric Controls */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                    Tham Số Không Gian Thông Thủy Hành Lang Kỹ Thuật
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Phân bổ cao độ 3 tầng kỹ thuật bảo đảm tĩnh không hoàn thiện và khoảng cách an
                    toàn cách ly điện - nước.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400">Chiều Rộng Hành Lang (mm)</label>
                  <input
                    type="number"
                    value={corridorWidth}
                    onChange={(e) => setCorridorWidth(Number(e.target.value))}
                    className="w-full mt-1 p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400">Cao Độ Đáy Sàn (mm)</label>
                  <input
                    type="number"
                    value={slabElevation}
                    onChange={(e) => setSlabElevation(Number(e.target.value))}
                    className="w-full mt-1 p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400">Cao Độ Đáy Dầm (mm)</label>
                  <input
                    type="number"
                    value={beamBottomElevation}
                    onChange={(e) => setBeamBottomElevation(Number(e.target.value))}
                    className="w-full mt-1 p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400">Cao Độ Trần Hoàn Thiện (mm)</label>
                  <input
                    type="number"
                    value={ceilingElevation}
                    onChange={(e) => setCeilingElevation(Number(e.target.value))}
                    className="w-full mt-1 p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400">Không Gian Khả Dụng (mm)</label>
                  <div className="w-full mt-1 p-2 rounded-xl bg-zinc-950 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-400">
                    +{beamBottomElevation - ceilingElevation} mm
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-Tier Assignment Table */}
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Phân Tầng Tuyến Kỹ Thuật Đa Tầng (Tier 1: Gió • Tier 2: Điện • Tier 3: Nước)
                </h4>
                <span className="text-[11px] font-mono text-zinc-400">
                  {corridorSystems.length} tuyến trong hành lang
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Mã Tuyến</th>
                      <th className="py-2.5 px-3">Tên Tuyến Kỹ Thuật</th>
                      <th className="py-2.5 px-3">Tiết Diện</th>
                      <th className="py-2.5 px-3">Phân Tầng</th>
                      <th className="py-2.5 px-3 text-right">Cao Độ Đáy (BOP)</th>
                      <th className="py-2.5 px-3 text-right">Tọa Độ Ngang (X)</th>
                      <th className="py-2.5 px-3 text-right">Khoảng Sáng Đáy Dầm</th>
                      <th className="py-2.5 px-3 text-right">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {corridorSystems.map((sys) => (
                      <tr key={sys.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-amber-400">{sys.systemCode}</td>
                        <td className="py-2.5 px-3 font-sans text-zinc-200">
                          <div>{sys.name}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Tải trọng: {sys.weightKgPerM} kg/m • Bảo ôn: {sys.insulationThicknessMm}
                            mm
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          {sys.widthMm} × {sys.heightOrDiaMm} mm
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] font-sans">
                            {sys.corridorTier}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-amber-300 font-bold text-right tabular-nums">
                          +{sys.elevationBopMm} mm
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300 text-right tabular-nums">
                          {sys.lateralPositionMm} mm
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={
                              sys.soffitClearanceMm < 200
                                ? "text-rose-400 font-bold"
                                : "text-emerald-400"
                            }
                          >
                            {sys.soffitClearanceMm} mm
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Đạt Combine
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trapeze Hanger Calculation Engine */}
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-amber-400" />
                    Tính Toán Tải Trọng & Kết Cấu Giá Đỡ Trapeze Hanger Đa Tầng
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Kiểm tra ứng suất uốn σ ≤ 160MPa và độ võng f ≤ L/360 tự động lựa chọn profile
                    Unistrut và ty ren phù hợp.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                  ✓ Kết Cấu An Toàn
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Tổng Tải Trọng Tính Toán</span>
                  <div className="text-lg font-bold font-mono text-zinc-100">
                    {trapezeResult.totalLoadN} N (250 kg)
                  </div>
                  <span className="text-[10px] text-zinc-400">Hệ số an toàn 1.4x</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Ứng Suất Uốn Thanh Xà</span>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {trapezeResult.bendingStressMpa} MPa
                  </div>
                  <span className="text-[10px] text-zinc-400">Giới hạn ≤ 160 MPa</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-400">Độ Võng Tối Đa (f)</span>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {trapezeResult.deflectionMm} mm
                  </div>
                  <span className="text-[10px] text-zinc-400">Cho phép ≤ 4.44 mm</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-1">
                  <span className="text-[11px] text-zinc-400">Quy Cách Profile Đề Xuất</span>
                  <div className="text-xs font-bold font-mono text-amber-300">
                    {trapezeResult.selectedProfile}
                  </div>
                  <span className="text-[10px] text-zinc-400">{trapezeResult.selectedRod}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: TỰ ĐỘNG ĐỊNH TUYẾN 3D (AUTO-ROUTING & PATHFINDING)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "auto_routing" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <Route className="w-4 h-4 text-amber-400" />
                    Thuật Toán Tìm Tuyến Tối Ưu Không Gian 3D (3D A* Pathfinding)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Tự động tìm đường ống đi né dầm, né cột và né các hệ thống MEPF khác với số
                    lượng co cút uốn 45°/90° ít nhất.
                  </p>
                </div>
              </div>

              {/* Waypoints Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Bước Điểm</th>
                      <th className="py-2.5 px-3">Tọa Độ X (mm)</th>
                      <th className="py-2.5 px-3">Tọa Độ Y (mm)</th>
                      <th className="py-2.5 px-3">Cao Độ Z (mm)</th>
                      <th className="py-2.5 px-3">Mô Tả Thao Tác Nắn Tuyến</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {routingResult.waypoints.map((wp) => (
                      <tr key={wp.step} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-amber-400">Point #{wp.step}</td>
                        <td className="py-2.5 px-3 text-zinc-200">{wp.x}</td>
                        <td className="py-2.5 px-3 text-zinc-200">{wp.y}</td>
                        <td className="py-2.5 px-3 text-amber-300 font-bold">+{wp.z}</td>
                        <td className="py-2.5 px-3 font-sans text-zinc-300">{wp.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 4: SỔ BỘ LỖ MỞ XUYÊN DẦM KẾT CẤU (BEAM SLEEVE REGISTER)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "beam_sleeves" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    Sổ Bộ Kiểm Soát Lỗ Mở Xuyên Dầm Kết Cấu (Beam Sleeve Safety Register)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Bảo đảm mọi lỗ mở đặt trong vùng 1/3 giữa nhịp dầm (L/3 ≤ x ≤ 2L/3) và Dsleeve ≤
                    Hdầm/3 theo TCVN 5574:2018.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                      <th className="py-2.5 px-3">Mã Sleeve</th>
                      <th className="py-2.5 px-3">Dầm Kết Cấu</th>
                      <th className="py-2.5 px-3">Đường Kính Lỗ</th>
                      <th className="py-2.5 px-3">Vị Trí (x / Nhịp Dầm)</th>
                      <th className="py-2.5 px-3">Khoảng Hở Mép Trên/Dưới</th>
                      <th className="py-2.5 px-3">Hệ Kỹ Thuật Đi Qua</th>
                      <th className="py-2.5 px-3 text-right">Trạng Thái Phê Duyệt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {sleeves.map((sl) => (
                      <tr key={sl.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-amber-400">{sl.code}</td>
                        <td className="py-2.5 px-3 font-sans text-zinc-200">
                          <div>{sl.beamRef}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Nhịp L={sl.beamSpanMm}mm • Cao H={sl.beamDepthMm}mm
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">Ø{sl.sleeveDiameterMm} mm</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-bold ${sl.isCompliant ? "text-emerald-400" : "text-rose-400"}`}
                            >
                              {(sl.positionRatio * 100).toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-zinc-500">(x={sl.positionX}mm)</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          Trên: {sl.topClearanceMm}mm • Dưới: {sl.bottomClearanceMm}mm
                        </td>
                        <td className="py-2.5 px-3 font-sans text-zinc-300">{sl.system}</td>
                        <td className="py-2.5 px-3 text-right font-sans">
                          {sl.status === "approved" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Đã Phê Duyệt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-semibold">
                              <AlertTriangle className="w-3 h-3" /> Vi Phạm Vùng Cắt
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
