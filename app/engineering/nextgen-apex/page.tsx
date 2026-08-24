"use client";

import { useState } from "react";
import {
  Compass,
  Video,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  TrendingUp,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Play,
  RotateCcw,
  Sparkles,
  DollarSign,
  Clock,
  Download,
  Lock,
  Unlock,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";

type ActiveTab = "generative_routing" | "edge_vision_rebar" | "smart_ipc" | "fidic_tia";

export default function NextGenApexEngineeringPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("generative_routing");

  // ==========================================================================
  // TAB 1: GENERATIVE 3D ROUTING STATE
  // ==========================================================================
  const [systemType, setSystemType] = useState<string>("PLUMBING_DRAINAGE_GRAVITY");
  const [nominalSizeMm, setNominalSizeMm] = useState<number>(110);
  const [startPoint, setStartPoint] = useState({ x: 1000, y: 2000, z: 3200 });
  const [endPoint, setEndPoint] = useState({ x: 9000, y: 2000, z: 3000 });
  const [flowRateLps, setFlowRateLps] = useState<number>(6.5);
  const [routingResult, setRoutingResult] = useState<any>(null);
  const [isSolvingRoute, setIsSolvingRoute] = useState<boolean>(false);

  const handleSolveRoute = async () => {
    setIsSolvingRoute(true);
    try {
      const res = await fetch("/api/engineering/generative-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routingCode: `ROUTE-3D-${Date.now().toString(36).toUpperCase()}`,
          systemType,
          startPoint,
          endPoint,
          nominalSizeMm,
          flowRateLps,
          obstacles: [
            {
              id: "BEAM-01",
              name: "Dầm D500x300 Trục 3",
              type: "BEAM",
              min: { x: 4500, y: 0, z: 2800 },
              max: { x: 5500, y: 4000, z: 3300 },
              beamSpan: { startX: 0, endX: 10000, heightMm: 500 },
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRoutingResult(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSolvingRoute(false);
    }
  };

  // ==========================================================================
  // TAB 2: EDGE-AI 360 SLAM & PRE-POUR REBAR STATE
  // ==========================================================================
  const [zoneLabel, setZoneLabel] = useState<string>("Zone-01");
  const [slabLevel, setSlabLevel] = useState<string>("FL-04");
  const [designPitchMm, setDesignPitchMm] = useState<number>(150);
  const [measuredPitchMm, setMeasuredPitchMm] = useState<number>(152);
  const [designSpacerDensity, setDesignSpacerDensity] = useState<number>(4.0);
  const [measuredSpacerDensity, setMeasuredSpacerDensity] = useState<number>(4.2);
  const [rebarAuditResult, setRebarAuditResult] = useState<any>(null);
  const [isAuditingRebar, setIsAuditingRebar] = useState<boolean>(false);

  const handleAuditRebar = async () => {
    setIsAuditingRebar(true);
    try {
      const res = await fetch("/api/engineering/edge-vision-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "audit_rebar",
          zoneLabel,
          slabLevel,
          elementName: `Sàn bê tông ${slabLevel}-${zoneLabel}`,
          designPitchMm,
          measuredPitchMm,
          designSpacerDensitySqm: designSpacerDensity,
          measuredSpacerDensitySqm: measuredSpacerDensity,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRebarAuditResult(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuditingRebar(false);
    }
  };

  // ==========================================================================
  // TAB 3: INSTANT SMART IPC (60S) STATE
  // ==========================================================================
  const [contractorName, setContractorName] = useState<string>("Tổng Thầu Cơ Điện XBoss");
  const [periodMonth, setPeriodMonth] = useState<string>("2026-08");
  const [grossClaimedVnd, setGrossClaimedVnd] = useState<number>(850000000);
  const [scanDevMm, setScanDevMm] = useState<number>(11.5);
  const [bbntSigned, setBbntSigned] = useState<boolean>(true);
  const [iotPressureDrop, setIotPressureDrop] = useState<number>(0.0);
  const [iotDurationHours, setIotDurationHours] = useState<number>(2.5);
  const [claimedQty, setClaimedQty] = useState<number>(150);
  const [approvedBoqQty, setApprovedBoqQty] = useState<number>(150);
  const [warehouseQty, setWarehouseQty] = useState<number>(180);
  const [smartIpcResult, setSmartIpcResult] = useState<any>(null);
  const [isProcessingIpc, setIsProcessingIpc] = useState<boolean>(false);

  const handleProcessIpc = async () => {
    setIsProcessingIpc(true);
    try {
      const res = await fetch("/api/engineering/smart-ipc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipcNumber: `IPC-APEX-${Date.now().toString(36).toUpperCase()}`,
          periodMonth,
          contractorName,
          grossClaimedVnd,
          retentionPercent: 5.0,
          gating: {
            scanToBimMaxDevMm: scanDevMm,
            bbntSigned3Parties: bbntSigned,
            iotPressureDropBar: iotPressureDrop,
            iotTestDurationHours: iotDurationHours,
            claimedQty,
            approvedBoqQty,
            warehouseUsedQty: warehouseQty,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSmartIpcResult(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingIpc(false);
    }
  };

  // ==========================================================================
  // TAB 4: AUTONOMOUS FIDIC TIA CLAIMS STATE
  // ==========================================================================
  const [delayTitle, setDelayTitle] = useState<string>(
    "Mưa lớn cực đoan và chậm bàn giao mặt bằng trục A-C",
  );
  const [eventCategory, setEventCategory] = useState<string>("FORCE_MAJEURE_WEATHER");
  const [delayStart, setDelayStart] = useState<string>("2026-08-01");
  const [delayEnd, setDelayEnd] = useState<string>("2026-08-15");
  const [dailyCostVnd, setDailyCostVnd] = useState<number>(18000000);
  const [tiaResult, setTiaResult] = useState<any>(null);
  const [isAnalyzingTia, setIsAnalyzingTia] = useState<boolean>(false);

  const handleAnalyzeTia = async () => {
    setIsAnalyzingTia(true);
    try {
      const res = await fetch("/api/engineering/fidic-tia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimCode: `CLAIM-FIDIC-${Date.now().toString(36).toUpperCase()}`,
          delayEventTitle: delayTitle,
          eventCategory,
          delayStartDate: delayStart,
          delayEndDate: delayEnd,
          dailyOverheadCostVnd: dailyCostVnd,
          impactedTasks: [
            {
              taskId: 201,
              taskName: "Đổ bê tông sàn tầng 14 (Đường găng CPM)",
              originalDurationDays: 10,
              delayDays: 14,
            },
            {
              taskId: 202,
              taskName: "Lắp đặt trục đứng thoát nước Zone A",
              originalDurationDays: 12,
              delayDays: 8,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTiaResult(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzingTia(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <AppHeader />
      <EngineeringNav />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <ThuNghiemBanner moduleKey="engineering-nextgen-apex" />
        {/* Header Hero */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-blue-950/40 border border-zinc-800 rounded-xl p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-xs font-semibold text-blue-400 mb-2">
                <Sparkles className="w-3.5 h-3.5" /> Next-Gen Apex Ecosystem — Module M93 / M94
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                <Zap className="w-7 h-7 text-amber-400" /> Hệ Điều Hành Xây Dựng Tự Hành & Khép Kín
                Pháp Lý
              </h1>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Tích hợp 4 động cơ đỉnh cao: 3D A* Generative Spatial Router, Edge-AI 360 SLAM &
                Pre-Pour Rebar Verification, Instant Smart IPC 60s và FIDIC TIA Delay Claims.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> 100% Tamper-Proof Merkle
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab("generative_routing")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "generative_routing"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <Compass className="w-4 h-4" /> 1. Generative 3D Spatial Routing
          </button>
          <button
            onClick={() => setActiveTab("edge_vision_rebar")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "edge_vision_rebar"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <Video className="w-4 h-4" /> 2. Edge-AI 360 SLAM & Rebar CV
          </button>
          <button
            onClick={() => setActiveTab("smart_ipc")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "smart_ipc"
                ? "bg-emerald-700 text-on-accent shadow-lg shadow-emerald-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <DollarSign className="w-4 h-4" /> 3. Instant Smart IPC (60s Gated)
          </button>
          <button
            onClick={() => setActiveTab("fidic_tia")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "fidic_tia"
                ? "bg-amber-700 text-on-accent shadow-lg shadow-amber-600/30"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
            }`}
          >
            <Clock className="w-4 h-4" /> 4. FIDIC TIA Delay Claims
          </button>
        </div>

        {/* TAB 1 CONTENT: GENERATIVE 3D SPATIAL ROUTING */}
        {activeTab === "generative_routing" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-400" /> Cấu Hình Tuyến 3D & Vật Cản
              </h2>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Hệ Thống Cơ Điện</label>
                <select
                  value={systemType}
                  onChange={(e) => setSystemType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                >
                  <option value="PLUMBING_DRAINAGE_GRAVITY">
                    Thoát Nước Trọng Lực (Độ dốc 1.5%)
                  </option>
                  <option value="PLUMBING_WATER_PRESSURE">Cấp Nước Áp Lực (PPR / HDPE)</option>
                  <option value="HVAC_CHILLED_WATER">Ống Nước Lạnh Chiller (Thép Sch40)</option>
                  <option value="FIRE_SPRINKLER">Chữa Cháy Cứu Hỏa (Ống thép DN100)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Đường Kính Ống (mm)</label>
                  <input
                    type="number"
                    value={nominalSizeMm}
                    onChange={(e) => setNominalSizeMm(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Lưu Lượng (L/s)</label>
                  <input
                    type="number"
                    value={flowRateLps}
                    onChange={(e) => setFlowRateLps(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg space-y-2 text-xs">
                <div className="text-zinc-300 font-semibold flex items-center justify-between">
                  <span>Vật cản dầm kết cấu:</span>
                  <span className="text-amber-400">Dầm 500x300 Trục 3</span>
                </div>
                <p className="text-zinc-500 text-[11px]">
                  Giải thuật A* tự động kiểm tra vùng khoét dầm L/3 (L/3 ≤ x ≤ 2L/3). Nếu ngoài
                  khoảng sẽ tự bẻ 45° uốn xuống dưới dầm.
                </p>
              </div>

              <button
                onClick={handleSolveRoute}
                disabled={isSolvingRoute}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
              >
                {isSolvingRoute ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Chạy 3D A* Generative Solver
              </button>
            </div>

            <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" /> Kết Quả Định Tuyến & Thủy Lực 3D
                </h2>

                {routingResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Trạng Thái</div>
                        <div className="text-sm font-bold text-emerald-400 uppercase">
                          {routingResult.status}
                        </div>
                      </div>
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Tổng Chiều Dài</div>
                        <div className="text-sm font-bold text-zinc-100">
                          {routingResult.totalLengthM} m
                        </div>
                      </div>
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Tổn Thất Áp Suất</div>
                        <div className="text-sm font-bold text-amber-400">
                          {routingResult.pressureDropPa} Pa
                        </div>
                      </div>
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                        <div className="text-xs text-zinc-500">Sleeve / Fitting</div>
                        <div className="text-sm font-bold text-purple-400">
                          {routingResult.fittingsSchedule.length} chi tiết
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs text-zinc-300 max-h-48 overflow-y-auto">
                      <div className="text-zinc-500 mb-1">
                        Danh sách tọa độ tim ống 3D (Waypoints):
                      </div>
                      {routingResult.pathNodes.map((pt: any, i: number) => (
                        <div
                          key={i}
                          className="flex justify-between py-0.5 border-b border-zinc-900"
                        >
                          <span>P{i + 1}:</span>
                          <span className="text-blue-400">
                            X: {pt.x}mm, Y: {pt.y}mm, Z: {pt.z}mm
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs text-zinc-400">
                      <div className="text-zinc-500 mb-1">Script sinh Shopdrawing AutoLISP:</div>
                      <pre className="text-emerald-400 text-[11px] overflow-x-auto">
                        {routingResult.dxfSnippet}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                    <Compass className="w-12 h-12 mb-2 text-zinc-700 animate-pulse" />
                    <p className="text-sm">
                      Bấm &quot;Chạy 3D A* Generative Solver&quot; để bắt đầu giải tuyến không gian
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2 CONTENT: EDGE-AI 360 SLAM & PRE-POUR REBAR */}
        {activeTab === "edge_vision_rebar" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-purple-400" /> Kiểm Soát Cốt Thép Tiền Đổ Bê Tông
                (Pre-Pour CV)
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Khu Vực (Zone)</label>
                  <input
                    type="text"
                    value={zoneLabel}
                    onChange={(e) => setZoneLabel(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Tầng (Level)</label>
                  <input
                    type="text"
                    value={slabLevel}
                    onChange={(e) => setSlabLevel(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Bước Thép TK (mm)</label>
                  <input
                    type="number"
                    value={designPitchMm}
                    onChange={(e) => setDesignPitchMm(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Bước Thép Đo Thực Tế (mm)
                  </label>
                  <input
                    type="number"
                    value={measuredPitchMm}
                    onChange={(e) => setMeasuredPitchMm(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Mật Độ Con Kê TK (con/m²)
                  </label>
                  <input
                    type="number"
                    value={designSpacerDensity}
                    onChange={(e) => setDesignSpacerDensity(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Con Kê Đo Thực Tế (con/m²)
                  </label>
                  <input
                    type="number"
                    value={measuredSpacerDensity}
                    onChange={(e) => setMeasuredSpacerDensity(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <button
                onClick={handleAuditRebar}
                disabled={isAuditingRebar}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              >
                {isAuditingRebar ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Thẩm Định Cốt Thép & Ngắt Mạch Đổ Bê Tông
              </button>
            </div>

            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" /> Trạng Thái Ngắt Mạch Lệnh Đổ
                (Pour Permit Circuit Breaker)
              </h2>

              {rebarAuditResult ? (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-4 ${
                      rebarAuditResult.circuitBreakerStatus === "PASS_PERMITTED"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                        : "bg-rose-950/40 border-rose-800 text-rose-300"
                    }`}
                  >
                    {rebarAuditResult.circuitBreakerStatus === "PASS_PERMITTED" ? (
                      <Unlock className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Lock className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="text-base font-bold">
                        {rebarAuditResult.circuitBreakerStatus === "PASS_PERMITTED"
                          ? "CHO PHÉP ĐỔ BÊ TÔNG (POUR PERMIT ACTIVE)"
                          : "KHÓA CỨNG LỆNH ĐỔ BÊ TÔNG (CIRCUIT BREAKER OPEN)"}
                      </div>
                      <div className="text-xs opacity-80 mt-1">
                        Sai lệch bước thép: {rebarAuditResult.pitchDeviationMm}mm | Mật độ con kê:{" "}
                        {rebarAuditResult.measuredSpacerDensitySqm} con/m²
                      </div>
                    </div>
                  </div>

                  {rebarAuditResult.blockingReasons.length > 0 && (
                    <div className="p-3 bg-rose-950/30 border border-rose-900/60 rounded-lg text-xs space-y-1">
                      <div className="font-bold text-rose-400">Các lỗi chặn lệnh đổ bê tông:</div>
                      {rebarAuditResult.blockingReasons.map((r: string, idx: number) => (
                        <div key={idx} className="text-rose-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {r}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400 space-y-1">
                    <div className="text-zinc-500">Mã Băm Merkle Bất Biến (Audit Trail):</div>
                    <div className="text-purple-400 break-all">
                      {rebarAuditResult.merkleLeafHash}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                  <Video className="w-12 h-12 mb-2 text-zinc-700 animate-pulse" />
                  <p className="text-sm">
                    Nhập thông số và bấm &quot;Thẩm Định Cốt Thép&quot; để kiểm tra điều kiện đổ
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3 CONTENT: INSTANT SMART IPC */}
        {activeTab === "smart_ipc" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" /> Ma Trận Nghiệm Thu 4 Cổng
                (4-Gate Matrix)
              </h2>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Tên Nhà Thầu</label>
                <input
                  type="text"
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Giá Trị Yêu Cầu (VNĐ)</label>
                  <input
                    type="number"
                    value={grossClaimedVnd}
                    onChange={(e) => setGrossClaimedVnd(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Sai Lệch Scan-to-BIM (mm)
                  </label>
                  <input
                    type="number"
                    value={scanDevMm}
                    onChange={(e) => setScanDevMm(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Gate 2: BBNT ký số 3 bên:</span>
                  <input
                    type="checkbox"
                    checked={bbntSigned}
                    onChange={(e) => setBbntSigned(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Gate 3: Thử áp IoT sụt áp (bar):</span>
                  <span className="font-mono text-emerald-400">{iotPressureDrop} bar (2.5h)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Gate 4: Khối lượng BOQ (Hợp đồng):</span>
                  <span className="font-mono text-zinc-200">
                    {claimedQty} / {approvedBoqQty} m
                  </span>
                </div>
              </div>

              <button
                onClick={handleProcessIpc}
                disabled={isProcessingIpc}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-500 text-on-accent font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                {isProcessingIpc ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Thẩm Định 4 Cổng & Phát Hành Smart IPC (60s)
              </button>
            </div>

            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-blue-400" /> Chứng Chỉ Thanh Toán Smart IPC &
                Lệnh Giải Ngân
              </h2>

              {smartIpcResult ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Giá Trị Yêu Cầu</div>
                      <div className="text-sm font-bold text-zinc-100">
                        {new Intl.NumberFormat("vi-VN").format(smartIpcResult.grossClaimedVnd)} đ
                      </div>
                    </div>
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Thực Nhận Sau Giữ Lại 5%</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {new Intl.NumberFormat("vi-VN").format(smartIpcResult.netPayableVnd)} đ
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-1.5">
                    <div className="font-bold text-zinc-300 mb-1">Kết quả kiểm tra 4 cổng:</div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      {smartIpcResult.gate1GeometryPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      Gate 1 (Hình học Scan-to-BIM):{" "}
                      {smartIpcResult.gate1GeometryPassed ? "ĐẠT" : "KHÔNG ĐẠT"}
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      {smartIpcResult.gate2BbntSignedPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      Gate 2 (Pháp lý BBNT Ký số 3 bên):{" "}
                      {smartIpcResult.gate2BbntSignedPassed ? "ĐẠT" : "KHÔNG ĐẠT"}
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      {smartIpcResult.gate3HydroIotPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      Gate 3 (Viễn trắc IoT Thử áp thủy tĩnh):{" "}
                      {smartIpcResult.gate3HydroIotPassed ? "ĐẠT" : "KHÔNG ĐẠT"}
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      {smartIpcResult.gate4QuadReconcilePassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      Gate 4 (Đối soát định lượng BOQ):{" "}
                      {smartIpcResult.gate4QuadReconcilePassed ? "ĐẠT" : "KHÔNG ĐẠT"}
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-emerald-400">
                    <div className="text-zinc-500 mb-1">Mã Niêm Phong Merkle Seal Hash:</div>
                    <div>{smartIpcResult.merkleSealHash}</div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                  <DollarSign className="w-12 h-12 mb-2 text-zinc-700 animate-pulse" />
                  <p className="text-sm">
                    Bấm &quot;Thẩm Định 4 Cổng&quot; để phát hành chứng chỉ IPC tự động
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4 CONTENT: FIDIC TIA CLAIMS */}
        {activeTab === "fidic_tia" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" /> Thiết Lập Sự Kiện Chậm Trễ (FIDIC
                Fragnet)
              </h2>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Mô Tả Sự Kiện Cản Trở</label>
                <input
                  type="text"
                  value={delayTitle}
                  onChange={(e) => setDelayTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Nhóm Sự Kiện FIDIC</label>
                <select
                  value={eventCategory}
                  onChange={(e) => setEventCategory(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                >
                  <option value="FORCE_MAJEURE_WEATHER">
                    Bất Khả Kháng / Thời Tiết Cực Đoan (Clause 8.4(d))
                  </option>
                  <option value="EMPLOYER_DELAY">
                    Chậm Bàn Giao Mặt Bằng Từ CĐT (Clause 8.4(a))
                  </option>
                  <option value="DESIGN_CHANGE_VARIATION">
                    Thay Đổi Thiết Kế Lớn (Clause 13.3)
                  </option>
                  <option value="UNFORESEEN_PHYSICAL">
                    Điều Kiện Vật Lý Bất Khả Kháng (Clause 4.12)
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Ngày Bắt Đầu</label>
                  <input
                    type="date"
                    value={delayStart}
                    onChange={(e) => setDelayStart(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Ngày Kết Thúc</label>
                  <input
                    type="date"
                    value={delayEnd}
                    onChange={(e) => setDelayEnd(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Chi Phí Chung / Ngày (VNĐ/ngày)
                </label>
                <input
                  type="number"
                  value={dailyCostVnd}
                  onChange={(e) => setDailyCostVnd(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
                />
              </div>

              <button
                onClick={handleAnalyzeTia}
                disabled={isAnalyzingTia}
                className="w-full py-2.5 bg-amber-700 hover:bg-amber-500 text-on-accent font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50"
              >
                {isAnalyzingTia ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                Chạy Mô Phỏng TIA & Xuất Thư Khiếu Nại
              </button>
            </div>

            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-amber-400" /> Báo Cáo TIA & Công Văn Khiếu Nại
                Pháp Lý
              </h2>

              {tiaResult ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Số Ngày EOT Đề Xuất</div>
                      <div className="text-base font-bold text-amber-400">
                        {tiaResult.calculatedEotDays} ngày
                      </div>
                    </div>
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Bù Trừ Chi Phí (Prolongation)</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {new Intl.NumberFormat("vi-VN").format(tiaResult.totalProlongationCostVnd)}{" "}
                        đ
                      </div>
                    </div>
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Hạn Chót 28 Ngày</div>
                      <div className="text-xs font-bold text-rose-400">
                        {tiaResult.timeBarDeadlineDate}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 font-mono max-h-56 overflow-y-auto whitespace-pre-wrap">
                    {tiaResult.noticeLetterMarkdown}
                  </div>

                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400">
                    <span className="text-zinc-500">Mã băm Merkle: </span>
                    <span className="text-amber-400">{tiaResult.merkleProofHash}</span>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                  <Clock className="w-12 h-12 mb-2 text-zinc-700 animate-pulse" />
                  <p className="text-sm">
                    Nhập sự kiện và bấm &quot;Chạy Mô Phỏng TIA&quot; để xuất thư khiếu nại
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
