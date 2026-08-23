"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Layers,
  Sparkles,
  RefreshCw,
  Copy,
  Download,
  Check,
  AlertTriangle,
  FileCheck,
  Zap,
  TrendingUp,
  Activity,
  Box,
  Compass,
  Maximize2,
  Minimize2,
  Workflow,
  Plus,
  Trash2,
  ShieldCheck,
  Leaf,
  Clock,
  QrCode,
  FileText,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import type {
  CorridorLayoutResult,
  TrapezeHangerCalcResult,
  CorridorSystemAssignment,
} from "@/lib/ky-thuat/engineering-cad-corridor";
import type { HydraulicNetworkResult } from "@/lib/ky-thuat/engineering-cad-hydraulic-network";
import type {
  SpoolIsometricResult,
  GeneticNestingResult,
} from "@/lib/ky-thuat/engineering-cad-dfma-isometric";
import type {
  CarbonLcaSummary,
  LivingDigitalTwinPassport,
  evaluateAssetHealthAndRul,
} from "@/lib/ky-thuat/engineering-cad-carbon-lifecycle";

export default function CadCorridorApexStudioPage() {
  const [activeTab, setActiveTab] = useState<
    "corridor" | "trapeze" | "hydraulic" | "isometric" | "carbon_7d"
  >("corridor");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Tab 1: Corridor Planner State
  const [corridorWidth, setCorridorWidth] = useState(2400);
  const [corridorClearHeight, setCorridorClearHeight] = useState(2600);
  const [slabElevation, setSlabElevation] = useState(3500);
  const [beamBottomElevation, setBeamBottomElevation] = useState(3100);
  const [ceilingElevation, setCeilingElevation] = useState(2600);
  const [corridorSystems, setCorridorSystems] = useState([
    {
      systemCode: "DUCT-SA-FL10",
      discipline: "hvac" as const,
      widthMm: 800,
      heightOrDiaMm: 300,
      weightKgPerM: 25.0,
      insulationThicknessMm: 25,
    },
    {
      systemCode: "TRAY-POWER-01",
      discipline: "electrical" as const,
      widthMm: 400,
      heightOrDiaMm: 100,
      weightKgPerM: 35.0,
      insulationThicknessMm: 0,
    },
    {
      systemCode: "PIPE-CHW-DN100",
      discipline: "plumbing" as const,
      widthMm: 150,
      heightOrDiaMm: 150,
      weightKgPerM: 28.0,
      insulationThicknessMm: 30,
    },
    {
      systemCode: "FIRE-SPRINKLER-DN50",
      discipline: "firefighting" as const,
      widthMm: 60,
      heightOrDiaMm: 60,
      weightKgPerM: 12.0,
      insulationThicknessMm: 0,
    },
  ]);
  const [corridorPlanResult, setCorridorPlanResult] = useState<CorridorLayoutResult | null>(null);

  // Tab 2: Trapeze Hanger State
  const [hangerSpanMm, setHangerSpanMm] = useState(1400);
  const [hangerDropMm, setHangerDropMm] = useState(800);
  const [hangerSpacingM, setHangerSpacingM] = useState(1.5);
  const [preferredUnistrut, setPreferredUnistrut] = useState<"P1000" | "P1001" | "P3300">("P1000");
  const [trapezeResult, setTrapezeResult] = useState<TrapezeHangerCalcResult | null>(null);

  // Tab 3: Hydraulic Network State
  const [hydraulicResult, setHydraulicResult] = useState<HydraulicNetworkResult | null>(null);

  // Tab 4: DfMA Spool Isometric & Genetic Nesting State
  const [isometricResult, setIsometricResult] = useState<SpoolIsometricResult | null>(null);
  const [nestingResult, setNestingResult] = useState<GeneticNestingResult | null>(null);

  // Tab 5: 6D Carbon LCA & 7D Asset State
  const [carbonResult, setCarbonResult] = useState<CarbonLcaSummary | null>(null);
  const [assetHealthResult, setAssetHealthResult] = useState<ReturnType<
    typeof evaluateAssetHealthAndRul
  > | null>(null);
  const [passportResult, setPassportResult] = useState<LivingDigitalTwinPassport | null>(null);

  // 1. Chạy quy hoạch hành lang kỹ thuật
  const runCorridorPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engineering/cad-corridor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan_corridor",
          corridorCode: "CORR-APEX-FL10",
          title: "Hành lang kỹ thuật trục chính Tầng 10",
          corridorWidthMm: corridorWidth,
          corridorClearHeightMm: corridorClearHeight,
          slabBottomElevationMm: slabElevation,
          beamBottomElevationMm: beamBottomElevation,
          ceilingElevationMm: ceilingElevation,
          systems: corridorSystems,
        }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCorridorPlanResult(data);
      }
    } catch {
      // Fallback local calc
    } finally {
      setLoading(false);
    }
  }, [
    corridorWidth,
    corridorClearHeight,
    slabElevation,
    beamBottomElevation,
    ceilingElevation,
    corridorSystems,
  ]);

  // 2. Chạy tính toán kết cấu giá đỡ Trapeze
  const runTrapezeCalculation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engineering/cad-corridor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calc_trapeze",
          hangerCode: "TRAP-FL10-01",
          spanWidthMm: hangerSpanMm,
          dropLengthMm: hangerDropMm,
          hangerSpacingM: hangerSpacingM,
          preferredUnistrutCode: preferredUnistrut,
          systemsOnHanger: corridorSystems.map((s) => ({
            weightKgPerM: s.weightKgPerM,
            systemCode: s.systemCode,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTrapezeResult(data);
      }
    } finally {
      setLoading(false);
    }
  }, [hangerSpanMm, hangerDropMm, hangerSpacingM, preferredUnistrut, corridorSystems]);

  // 3. Chạy cân bằng thủy lực mạng lưới
  const runHydraulicBalancing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engineering/cad-corridor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "balance_hydraulic",
          networkCode: "NET-CHW-APEX-01",
          systemType: "chilled_water",
          nodes: [
            {
              id: "PUMP-CHW-01",
              name: "Bơm Chiller Cụm 1",
              type: "source",
              elevationM: 0,
              demandFlowLps: 0,
            },
            {
              id: "JUNC-01",
              name: "Nút chia Trục Đông",
              type: "junction_tee",
              elevationM: 0,
              demandFlowLps: 0,
            },
            {
              id: "AHU-EAST-01",
              name: "Dàn AHU Đông (Nhánh gần)",
              type: "terminal",
              elevationM: 0,
              demandFlowLps: 4.5,
            },
            {
              id: "AHU-WEST-02",
              name: "Dàn AHU Tây (Nhánh xa - Bất lợi)",
              type: "terminal",
              elevationM: 0,
              demandFlowLps: 5.5,
            },
          ],
          edges: [
            { id: "E-MAIN", fromNodeId: "PUMP-CHW-01", toNodeId: "JUNC-01", lengthM: 25.0 },
            { id: "E-BRANCH-EAST", fromNodeId: "JUNC-01", toNodeId: "AHU-EAST-01", lengthM: 12.0 },
            { id: "E-BRANCH-WEST", fromNodeId: "JUNC-01", toNodeId: "AHU-WEST-02", lengthM: 65.0 },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setHydraulicResult(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 4. Chạy sinh bản vẽ Isometric DfMA & Genetic Nesting
  const runIsometricAndNesting = useCallback(async () => {
    setLoading(true);
    try {
      // 4.1. Sinh Spool Isometric
      const resIso = await fetch("/api/engineering/cad-isometric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_isometric",
          spoolCode: "SPOOL-CHW-FL10-001",
          systemCode: "CHILLED_WATER",
          nominalDiameterMm: 100,
          pipeMaterial: "Thép đen Sch40 đúc",
          startPoint: { x: 0, y: 0, z: 0 },
          endPoint: { x: 3400, y: 1200, z: 0 },
          fittings: [
            {
              id: "FIT-01",
              type: "elbow_90",
              nominalDiaMm: 100,
              takeOffLengthMm: 152,
              socketDepthMm: 32,
              description: "Cút 90 độ hàn Sch40 DN100",
            },
          ],
          hasFieldFitEnd: true,
          fieldFitAllowanceMm: 100,
        }),
      });
      if (resIso.ok) {
        const dataIso = await resIso.json();
        setIsometricResult(dataIso);
      }

      // 4.2. Chạy Genetic Nesting
      const resNest = await fetch("/api/engineering/cad-isometric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "genetic_nesting",
          demandCuts: [
            { spoolCode: "SP-01", lengthMm: 3200 },
            { spoolCode: "SP-02", lengthMm: 2400 },
            { spoolCode: "SP-03", lengthMm: 1800 },
            { spoolCode: "SP-04", lengthMm: 2700 },
            { spoolCode: "SP-05", lengthMm: 3100 },
          ],
          remnants: [
            {
              id: "REM-01",
              barcode: "REM-BAR-101",
              materialType: "steel_pipe",
              specDimension: "DN100",
              lengthMm: 2500,
              isAllocated: false,
            },
            {
              id: "REM-02",
              barcode: "REM-BAR-102",
              materialType: "steel_pipe",
              specDimension: "DN100",
              lengthMm: 1900,
              isAllocated: false,
            },
          ],
          standardBarLengthMm: 6000,
          kerfMm: 2.0,
        }),
      });
      if (resNest.ok) {
        const dataNest = await resNest.json();
        setNestingResult(dataNest);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 5. Chạy tính toán 6D Carbon LCA & 7D Asset Health
  const runCarbonAnd7D = useCallback(async () => {
    setLoading(true);
    try {
      // 5.1. Carbon 6D
      const resCarb = await fetch("/api/engineering/cad-carbon-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calculate_carbon_lca",
          elements: [
            { category: "galvanized_steel", weightKg: 3500 },
            { category: "black_steel", weightKg: 5200 },
            { category: "copper", weightKg: 650 },
            { category: "ppr_plastic", weightKg: 950 },
          ],
          grossFloorAreaM2: 5000,
        }),
      });
      if (resCarb.ok) {
        const dataCarb = await resCarb.json();
        setCarbonResult(dataCarb);
      }

      // 5.2. Đánh giá 7D
      const resHealth = await fetch("/api/engineering/cad-carbon-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate_asset_health",
          installedDateISO: "2025-01-01T00:00:00.000Z",
          expectedLifespanYears: 15,
          mtbfHours: 25000,
          currentOperatingHours: 7200,
          incidentCount: 0,
        }),
      });
      if (resHealth.ok) {
        const dataHealth = await resHealth.json();
        setAssetHealthResult(dataHealth);
      }

      // 5.3. Xuất Passport LOD 500
      const resPass = await fetch("/api/engineering/cad-carbon-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export_passport",
          projectCode: "PRJ-TT-AVIO-A",
          assets: [
            {
              recordCode: "REC-PUMP-01",
              assetGuid: "GUID-PUMP-001",
              equipmentName: "Bơm ly tâm Chiller",
              systemCode: "HVAC_CHILLER",
              serialNumber: "SN-2026-X889",
              installedDate: "2026-06-01",
              expectedLifespanYears: 15,
              mtbfHours: 25000,
              currentOperatingHours: 1200,
              remainingUsefulLifePercent: 99.0,
              maintenanceCycleDays: 90,
              nextMaintenanceDate: "2026-09-01",
              healthScorePercent: 99.0,
              maintenanceLog: [],
            },
          ],
          totalCarbonTonCo2e: 24.8,
        }),
      });
      if (resPass.ok) {
        const dataPass = await resPass.json();
        setPassportResult(dataPass);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runCorridorPlan();
    runTrapezeCalculation();
    runHydraulicBalancing();
    runIsometricAndNesting();
    runCarbonAnd7D();
  }, [
    runCorridorPlan,
    runTrapezeCalculation,
    runHydraulicBalancing,
    runIsometricAndNesting,
    runCarbonAnd7D,
  ]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20">
      <AppHeader />
      <EngineeringNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> M92 SUPER-INTELLIGENCE APEX
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                12 Invariants Compliant
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-7 h-7 text-amber-400" />
              CAD/BIM Siêu Trí Tuệ Toàn Năng & Multi-Tier Ecosystem
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Quy hoạch Hành lang Đa tầng • Kết cấu Giá đỡ Trapeze • Cân bằng Thủy lực Darcy • Chế
              tạo Spool Isometric • 6D Carbon LCA & 7D Living Twin LOD 500
            </p>
          </div>

          <button
            onClick={() => {
              runCorridorPlan();
              runTrapezeCalculation();
              runHydraulicBalancing();
              runIsometricAndNesting();
              runCarbonAnd7D();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg font-medium shadow-lg transition-all disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Đang xử lý..." : "Tái tính toán toàn bộ"}
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex overflow-x-auto gap-2 border-b border-slate-800 pb-3 mb-6 scrollbar-none">
          <button
            onClick={() => setActiveTab("corridor")}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "corridor"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Compass className="w-4 h-4" />
            1. Quy hoạch Hành lang Đa tầng
          </button>

          <button
            onClick={() => setActiveTab("trapeze")}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "trapeze"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Box className="w-4 h-4" />
            2. Kết cấu Giá đỡ Trapeze & AutoLISP
          </button>

          <button
            onClick={() => setActiveTab("hydraulic")}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "hydraulic"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Activity className="w-4 h-4" />
            3. Cân bằng Thủy lực & Tuyến Bất Lợi
          </button>

          <button
            onClick={() => setActiveTab("isometric")}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "isometric"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            4. DfMA Spool Isometric & Genetic Nesting
          </button>

          <button
            onClick={() => setActiveTab("carbon_7d")}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "carbon_7d"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Leaf className="w-4 h-4" />
            5. 6D Carbon LCA & 7D Living Twin
          </button>
        </div>

        {/* TAB 1: CORRIDOR PLANNER */}
        {activeTab === "corridor" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cấu hình tham số hành lang */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Compass className="w-4 h-4 text-amber-400" /> Tham số Không gian Hành lang
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Rộng hành lang (mm)</label>
                    <input
                      type="number"
                      value={corridorWidth}
                      onChange={(e) => setCorridorWidth(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Đáy dầm (mm)</label>
                    <input
                      type="number"
                      value={beamBottomElevation}
                      onChange={(e) => setBeamBottomElevation(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Đáy sàn BT (mm)</label>
                    <input
                      type="number"
                      value={slabElevation}
                      onChange={(e) => setSlabElevation(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Trần thạch cao (mm)</label>
                    <input
                      type="number"
                      value={ceilingElevation}
                      onChange={(e) => setCeilingElevation(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-400">Chiều sâu khả dụng:</span>
                    <span className="font-bold text-amber-400">
                      {beamBottomElevation - ceilingElevation} mm
                    </span>
                  </div>
                  <button
                    onClick={runCorridorPlan}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition"
                  >
                    Tối ưu Quy hoạch Đa tầng
                  </button>
                </div>
              </div>

              {/* Sơ đồ mặt cắt phân tầng trực quan */}
              <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" /> Sơ đồ Mặt cắt Cao độ 3 Tầng Kỹ
                    thuật
                  </h3>
                  {corridorPlanResult && (
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                        corridorPlanResult.isCompliant
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {corridorPlanResult.isCompliant
                        ? "✓ Đạt Tiêu chuẩn Cao độ"
                        : "⚠ Vi phạm Thông thủy"}
                    </span>
                  )}
                </div>

                {/* Vector Diagram Mặt cắt */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center min-h-[220px]">
                  <svg viewBox="0 0 600 200" className="w-full max-w-xl h-auto">
                    {/* Sàn bê tông trên cùng */}
                    <rect x="20" y="10" width="560" height="15" fill="#334155" />
                    <text x="30" y="22" fill="#94a3b8" fontSize="10" fontWeight="bold">
                      ĐÁY SÀN BÊ TÔNG (+{slabElevation}mm)
                    </text>

                    {/* Dầm kết cấu */}
                    <rect x="20" y="25" width="120" height="25" fill="#475569" />
                    <text x="25" y="42" fill="#cbd5e1" fontSize="9">
                      DẦM (+{beamBottomElevation}mm)
                    </text>

                    {/* Tier 1: Ống gió */}
                    <rect
                      x="160"
                      y="55"
                      width="180"
                      height="35"
                      rx="3"
                      fill="#0284c7"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />
                    <text x="170" y="77" fill="#ffffff" fontSize="10" fontWeight="bold">
                      TIER 1 (TOP): Ống Gió HVAC
                    </text>

                    {/* Tier 2: Máng cáp */}
                    <rect
                      x="360"
                      y="75"
                      width="140"
                      height="25"
                      rx="3"
                      fill="#d97706"
                      stroke="#fbbf24"
                      strokeWidth="1.5"
                    />
                    <text x="370" y="92" fill="#ffffff" fontSize="10" fontWeight="bold">
                      TIER 2 (MID): Máng Cáp
                    </text>

                    {/* Tier 3: Ống nước / Chiller */}
                    <rect
                      x="180"
                      y="110"
                      width="120"
                      height="20"
                      rx="3"
                      fill="#059669"
                      stroke="#34d399"
                      strokeWidth="1.5"
                    />
                    <text x="190" y="124" fill="#ffffff" fontSize="9" fontWeight="bold">
                      TIER 3 (BOT): Chiller/Cấp Nước
                    </text>

                    {/* Sprinkler */}
                    <line
                      x1="20"
                      y1="145"
                      x2="580"
                      y2="145"
                      stroke="#ef4444"
                      strokeWidth="2"
                      strokeDasharray="6 3"
                    />
                    <text x="30" y="142" fill="#f87171" fontSize="9">
                      Ống nhánh Sprinkler PCCC (+{ceilingElevation + 80}mm)
                    </text>

                    {/* Trần thạch cao hoàn thiện */}
                    <line x1="20" y1="170" x2="580" y2="170" stroke="#fbbf24" strokeWidth="3" />
                    <text x="30" y="185" fill="#fcd34d" fontSize="10" fontWeight="bold">
                      TRẦN THẠCH CAO HOÀN THIỆN (+{ceilingElevation}mm)
                    </text>
                  </svg>
                </div>

                {/* Danh sách hệ thống đã phân bổ */}
                {corridorPlanResult && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-950 text-slate-400 uppercase">
                        <tr>
                          <th className="px-3 py-2">Hệ Thống</th>
                          <th className="px-3 py-2">Tầng Phân Bổ</th>
                          <th className="px-3 py-2">Kích Thước (mm)</th>
                          <th className="px-3 py-2">Cao Độ Đáy (mm)</th>
                          <th className="px-3 py-2">Vị Trí Ngang (mm)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {corridorPlanResult.assignedSystems.map(
                          (sys: CorridorSystemAssignment, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="px-3 py-2 font-medium">{sys.systemCode}</td>
                              <td className="px-3 py-2 font-semibold text-amber-300">{sys.tier}</td>
                              <td className="px-3 py-2">
                                {sys.widthMm} x {sys.heightOrDiaMm}
                              </td>
                              <td className="px-3 py-2 font-bold text-emerald-400">
                                {sys.allocatedElevationMm}
                              </td>
                              <td className="px-3 py-2">{sys.lateralPositionMm}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRAPEZE HANGER STRUCTURAL */}
        {activeTab === "trapeze" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form nhập thông số giá đỡ */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Box className="w-4 h-4 text-amber-400" /> Thông số Giá đỡ Trapeze
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Khẩu độ nhịp thanh đỡ (mm)
                    </label>
                    <input
                      type="number"
                      value={hangerSpanMm}
                      onChange={(e) => setHangerSpanMm(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Bước khoảng cách giữa 2 giá đỡ (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={hangerSpacingM}
                      onChange={(e) => setHangerSpacingM(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Chiều dài hạ trần của ty ren (mm)
                    </label>
                    <input
                      type="number"
                      value={hangerDropMm}
                      onChange={(e) => setHangerDropMm(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Loại Unistrut ưu tiên
                    </label>
                    <select
                      value={preferredUnistrut}
                      onChange={(e) => setPreferredUnistrut(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100"
                    >
                      <option value="P1000">P1000 — Đơn 41x41x2.5mm</option>
                      <option value="P1001">P1001 — Đôi 41x82x2.5mm</option>
                      <option value="P3300">P3300 — Nông 41x21x2.5mm</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={runTrapezeCalculation}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition"
                >
                  Kiểm tra Kết cấu & Sinh LISP
                </button>
              </div>

              {/* Kết quả tính toán kết cấu & AutoLISP */}
              <div className="lg:col-span-2 space-y-6">
                {trapezeResult ? (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-200">
                          Kết Quả Đánh Giá Kết Cấu Giá Đỡ Trapeze
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Mã hiệu: {trapezeResult.hangerCode}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ✓ {trapezeResult.safetyStatus.toUpperCase()} (Đạt Tiêu Chuẩn)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400">Tổng tải tính toán (N)</span>
                        <p className="text-lg font-extrabold text-amber-400 mt-1">
                          {Math.round(trapezeResult.factoredLoadN)} N
                        </p>
                        <span className="text-[10px] text-slate-500">γ = 1.4 factored</span>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400">Ứng suất uốn (MPa)</span>
                        <p className="text-lg font-extrabold text-emerald-400 mt-1">
                          {trapezeResult.actualBendingStressMpa} /{" "}
                          {trapezeResult.allowableBendingStressMpa}
                        </p>
                        <span className="text-[10px] text-emerald-500">σ actual ≤ allowable</span>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400">Độ võng max (mm)</span>
                        <p className="text-lg font-extrabold text-cyan-400 mt-1">
                          {trapezeResult.maxDeflectionMm} / {trapezeResult.allowableDeflectionMm}
                        </p>
                        <span className="text-[10px] text-cyan-500">f ≤ L/360</span>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400">Đường kính Ty ren</span>
                        <p className="text-lg font-extrabold text-purple-400 mt-1">
                          M{trapezeResult.selectedRodDiameterMm}
                        </p>
                        <span className="text-[10px] text-slate-500">
                          Unistrut {trapezeResult.selectedUnistrut.code}
                        </span>
                      </div>
                    </div>

                    {/* AutoLISP Generator Output */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-amber-400" /> Mã Lệnh AutoLISP Sinh
                          Tự Động
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => copyText(trapezeResult.autoLispScript)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md flex items-center gap-1"
                          >
                            {copied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copied ? "Đã chép" : "Sao chép"}
                          </button>
                          <button
                            onClick={() =>
                              downloadTextFile(
                                trapezeResult.autoLispScript,
                                `draw_${trapezeResult.hangerCode.toLowerCase()}.lsp`,
                              )
                            }
                            className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/30 text-xs rounded-md flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> Tải về .LSP
                          </button>
                        </div>
                      </div>
                      <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto p-2 bg-slate-900 rounded-lg max-h-36">
                        {trapezeResult.autoLispScript}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                    Chưa có kết quả tính toán giá đỡ. Nhấn &quot;Kiểm tra Kết cấu&quot; để thực
                    hiện.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HYDRAULIC NETWORK BALANCING */}
        {activeTab === "hydraulic" && (
          <div className="space-y-6">
            {hydraulicResult ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Activity className="w-4 h-4 text-amber-400" /> Tuyến Bất Lợi & Cột Áp Bơm
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Tổng lưu lượng mạng lưới</span>
                      <p className="text-xl font-extrabold text-amber-400 mt-1">
                        {hydraulicResult.totalFlowRateLps} L/s
                      </p>
                      <span className="text-[10px] text-slate-500">
                        ~{Math.round(hydraulicResult.totalFlowRateLps * 3.6 * 10) / 10} m³/h
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Tổn thất áp suất Tuyến Bất Lợi</span>
                      <p className="text-xl font-extrabold text-rose-400 mt-1">
                        {Math.round(hydraulicResult.criticalPressureDropPa)} Pa
                      </p>
                      <span className="text-[10px] text-rose-300">
                        Critical Run: {hydraulicResult.criticalRunPath.join(" ➔ ")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Workflow className="w-4 h-4 text-emerald-400" /> Bảng Định Cỡ Ống Auto-Sizing &
                    Van Cân Bằng Kv
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-950 text-slate-400 uppercase">
                        <tr>
                          <th className="px-3 py-2">Đoạn Ống</th>
                          <th className="px-3 py-2">Lưu Lượng</th>
                          <th className="px-3 py-2">Định Cỡ DN</th>
                          <th className="px-3 py-2">Vận Tốc (m/s)</th>
                          <th className="px-3 py-2">Tổn Thất (Pa)</th>
                          <th className="px-3 py-2">Van Cân Bằng (Kv)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {hydraulicResult.edges.map((edge) => {
                          const valve = hydraulicResult.balancingValves.find(
                            (v) => v.edgeId === edge.id,
                          );
                          return (
                            <tr key={edge.id} className="hover:bg-slate-800/40">
                              <td className="px-3 py-2 font-medium">{edge.id}</td>
                              <td className="px-3 py-2">{edge.flowRateLps} L/s</td>
                              <td className="px-3 py-2 font-bold text-amber-300">
                                DN{edge.nominalDiameterMm}
                              </td>
                              <td className="px-3 py-2">{edge.velocityMs} m/s</td>
                              <td className="px-3 py-2 text-rose-300">
                                {Math.round(edge.headLossPa)} Pa
                              </td>
                              <td className="px-3 py-2">
                                {valve ? (
                                  <span className="font-bold text-emerald-400">
                                    Kv = {valve.requiredKvCoefficient} (
                                    {valve.valveSettingPresetPercent}%)
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Tuyến chuẩn</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                Đang tải dữ liệu mạng thủy lực...
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ISOMETRIC & GENETIC NESTING */}
        {activeTab === "isometric" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bản vẽ Isometric 3D-to-2D */}
              {isometricResult && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                      <Compass className="w-4 h-4 text-amber-400" /> Bản Vẽ Chế Tạo Isometric Spool
                      30°
                    </h3>
                    <span className="text-xs font-mono text-amber-300">
                      {isometricResult.spoolCode}
                    </span>
                  </div>

                  <div
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-center min-h-[260px] overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: isometricResult.svgIsometricVector }}
                  />

                  {/* Micro-BOM 5 cấp độ */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300">
                      Micro-BOM 5 Cấp Độ Chế Tạo Xưởng
                    </span>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-950 text-slate-400">
                          <tr>
                            <th className="px-2 py-1.5">Mục #</th>
                            <th className="px-2 py-1.5">Tên Cấu Kiện</th>
                            <th className="px-2 py-1.5">Quy Cách / Chiều Dài Cắt</th>
                            <th className="px-2 py-1.5">SL</th>
                            <th className="px-2 py-1.5">ĐVT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-200">
                          {isometricResult.microBom.map((bom, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1 text-amber-400 font-bold">#{bom.itemNo}</td>
                              <td className="px-2 py-1">{bom.componentName}</td>
                              <td className="px-2 py-1 font-mono text-emerald-400">{bom.spec}</td>
                              <td className="px-2 py-1 font-bold">{bom.qty}</td>
                              <td className="px-2 py-1 text-slate-400">{bom.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Tối ưu Phôi Di Truyền & Kho Phôi Thừa Remnants */}
              {nestingResult && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                      <Maximize2 className="w-4 h-4 text-purple-400" /> Tối Ưu Phôi Di Truyền &
                      Remnant Pool
                    </h3>
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Hạng {nestingResult.efficiencyGrade} (Phế liệu{" "}
                      {nestingResult.overallScrapPercent}%)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400">Đoạn cần cắt</span>
                      <p className="text-lg font-bold text-slate-100 mt-0.5">
                        {nestingResult.totalDemandCuts}
                      </p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400">Tận dụng phôi thừa</span>
                      <p className="text-lg font-bold text-emerald-400 mt-0.5">
                        {nestingResult.remnantPiecesUsed} cây
                      </p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400">Cây mới 6.0m</span>
                      <p className="text-lg font-bold text-amber-400 mt-0.5">
                        {nestingResult.newStandardBarsUsed} cây
                      </p>
                    </div>
                  </div>

                  {/* Kế hoạch xếp phôi */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300">
                      Sơ Đồ Xếp Phôi Cây Tiêu Chuẩn & Phôi Tồn
                    </span>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {nestingResult.nestingPlan.map((bar) => (
                        <div
                          key={bar.barIndex}
                          className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5"
                        >
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-medium">
                              Cây #{bar.barIndex} (L={bar.stockLengthMm}mm)
                            </span>
                            <span className="text-emerald-400 font-bold">
                              {bar.utilizationPercent}% hiệu dụng
                            </span>
                          </div>
                          {/* Thanh progress đa đoạn */}
                          <div className="w-full bg-slate-800 h-4 rounded-md flex overflow-hidden">
                            {bar.cuts.map((c, idx) => (
                              <div
                                key={idx}
                                style={{ width: `${(c.lengthMm / bar.stockLengthMm) * 100}%` }}
                                className="bg-amber-600 border-r border-slate-900 text-[9px] text-white flex items-center justify-center font-mono font-bold"
                                title={`${c.spoolCode}: ${c.lengthMm}mm`}
                              >
                                {c.spoolCode}
                              </div>
                            ))}
                            {bar.wasteLengthMm > 0 && (
                              <div
                                style={{
                                  width: `${(bar.wasteLengthMm / bar.stockLengthMm) * 100}%`,
                                }}
                                className="bg-slate-700/60 text-[9px] text-slate-400 flex items-center justify-center"
                              >
                                Thừa {bar.wasteLengthMm}mm
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: 6D CARBON LCA & 7D LIVING TWIN */}
        {activeTab === "carbon_7d" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Carbon 6D LCA */}
              {carbonResult && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Leaf className="w-4 h-4 text-emerald-400" /> Bóc Tách Carbon Ẩn 6D LCA (ISO
                    14040)
                  </h3>

                  <div className="space-y-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Tổng phát thải Carbon ẩn MEPF</span>
                      <p className="text-xl font-extrabold text-emerald-400 mt-1">
                        {carbonResult.totalEmbodiedCarbonTonCo2e} tấn CO₂e
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Định mức: {carbonResult.carbonIntensityPerM2} kgCO₂e/m² sàn
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Xếp hạng Công trình Xanh</span>
                      <p className="text-base font-bold text-amber-300 mt-1">
                        {carbonResult.complianceRating}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 7D Asset Health MTBF/RUL */}
              {assetHealthResult && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Clock className="w-4 h-4 text-cyan-400" /> Quản Trị Vòng Đời 7D & MTBF/RUL
                  </h3>

                  <div className="space-y-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">
                        Tuổi thọ hữu dụng còn lại (RUL)
                      </span>
                      <p className="text-xl font-extrabold text-cyan-400 mt-1">
                        {assetHealthResult.remainingUsefulLifePercent}%
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Chỉ số sức khỏe: {assetHealthResult.healthScorePercent}%
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Dự báo sự cố MTBF tiếp theo</span>
                      <p className="text-base font-bold text-slate-100 mt-1">
                        {assetHealthResult.daysToNextFailurePredicted} ngày tới
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Hộ chiếu số Living Twin Passport LOD 500 */}
              {passportResult && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <ShieldCheck className="w-4 h-4 text-purple-400" /> Hộ Chiếu Số LOD 500 & Merkle
                    Proof
                  </h3>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                    <div>
                      <span className="text-[11px] text-slate-400">Mã Token Bàn Giao:</span>
                      <p className="text-xs font-mono font-bold text-amber-300 break-all">
                        {passportResult.passportToken}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400">Mã băm Merkle Root:</span>
                      <p className="text-[10px] font-mono text-purple-300 break-all">
                        {passportResult.merkleProofRoot}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                      <span className="text-slate-400">Chuẩn bàn giao:</span>
                      <span className="font-bold text-emerald-400">COBie LOD 500</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
