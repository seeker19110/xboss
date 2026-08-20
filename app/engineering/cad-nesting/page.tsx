"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Scissors,
  Layers,
  Activity,
  QrCode,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  FileCheck,
  Zap,
  TrendingUp,
  BarChart3,
  Scale,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

interface CutItem {
  spoolCode: string;
  lengthMm: number;
  systemCode?: string;
  cutIndex: number;
}

interface NestingStockBar {
  barIndex: number;
  stockLengthMm: number;
  cuts: CutItem[];
  usedLengthMm: number;
  wasteLengthMm: number;
  utilizationPercent: number;
}

interface Nesting1DResult {
  runCode: string;
  stockLengthMm: number;
  kerfMm: number;
  totalSegments: number;
  totalBarsUsed: number;
  totalUsedLengthMm: number;
  totalWasteMm: number;
  wastePercent: number;
  utilizationPercent: number;
  efficiencyGrade: "A" | "B" | "C" | "D" | "F";
  bars: NestingStockBar[];
}

interface HydraulicResultState {
  velocityMs: number;
  headLossPerMeterPa: number;
  totalHeadLossPa: number;
  pressureDropBar: number;
  reynoldsNumber?: number;
  frictionFactor?: number;
  systemType: string;
  formulaUsed: string;
  validation: {
    ok: boolean;
    limitMs: number;
    status: "pass" | "warning" | "fail";
    message: string;
  };
}

export default function CadNestingHydraulicStudioPage() {
  const [activeTab, setActiveTab] = useState<"pipe_1d" | "duct_2d" | "hydraulic" | "qr_spool">(
    "pipe_1d",
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 1D Nesting State
  const [stockLength, setStockLength] = useState(6000);
  const [kerfMm, setKerfMm] = useState(2.0);
  const [discipline, setDiscipline] = useState("hvac");
  const [nestingResult, setNestingResult] = useState<Nesting1DResult | null>(null);

  // Hydraulic State
  const [hydroSystem, setHydroSystem] = useState("chilled_water");
  const [hydroFormula, setHydroFormula] = useState("hazen_williams");
  const [flowRateLps, setFlowRateLps] = useState(2.5);
  const [pipeDiameterMm, setPipeDiameterMm] = useState(100);
  const [pipeLengthM, setPipeLengthM] = useState(20.0);
  const [hydroResult, setHydroResult] = useState<HydraulicResultState | null>(null);

  // QR State
  const [qrSpoolCode, setQrSpoolCode] = useState("SPOOL-CHW-DN100-01");
  const [qrResult, setQrResult] = useState<{ qrData: string; displayLabel: string } | null>(null);

  const runSampleNesting = useCallback(async () => {
    setLoading(true);
    try {
      const sampleSegments = [
        { spoolCode: "SP-01", lengthMm: 4200, systemCode: "CHW-S" },
        { spoolCode: "SP-02", lengthMm: 3600, systemCode: "CHW-S" },
        { spoolCode: "SP-03", lengthMm: 2300, systemCode: "CHW-S" },
        { spoolCode: "SP-04", lengthMm: 2100, systemCode: "CHW-S" },
        { spoolCode: "SP-05", lengthMm: 1700, systemCode: "CHW-R" },
        { spoolCode: "SP-06", lengthMm: 1500, systemCode: "CHW-R" },
        { spoolCode: "SP-07", lengthMm: 1200, systemCode: "CHW-R" },
        { spoolCode: "SP-08", lengthMm: 950, systemCode: "CHW-R" },
        { spoolCode: "SP-09", lengthMm: 500, systemCode: "CHW-R" },
      ];

      const res = await fetch("/api/engineering/cad-nesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "nest_1d",
          segments: sampleSegments,
          stockLengthMm: stockLength,
          kerfMm,
          discipline,
        }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setNestingResult(data);
      }
    } catch (e) {
      console.error("Nesting error:", e);
    } finally {
      setLoading(false);
    }
  }, [stockLength, kerfMm, discipline]);

  const handleRunHydraulic = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad-nesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hydraulic_calc",
          systemType: hydroSystem,
          formula: hydroFormula,
          flowRateLps: Number(flowRateLps),
          pipeDiameterMm: Number(pipeDiameterMm),
          pipeLengthM: Number(pipeLengthM),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHydroResult(data);
      }
    } catch (e) {
      console.error("Hydraulic error:", e);
    }
  }, [hydroSystem, hydroFormula, flowRateLps, pipeDiameterMm, pipeLengthM]);

  const handleGenerateQr = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad-nesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_qr",
          spoolCode: qrSpoolCode,
          discipline: "HVAC",
          systemCode: "CHW-S",
          dimensionSpec: "DN100 Sch40 L=4.2m",
          floorLabel: "B1",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setQrResult(data);
      }
    } catch (e) {
      console.error("QR error:", e);
    }
  }, [qrSpoolCode]);

  useEffect(() => {
    runSampleNesting();
    handleRunHydraulic();
    handleGenerateQr();
  }, [runSampleNesting, handleRunHydraulic, handleGenerateQr]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Scissors className="text-emerald-400" size={28} />
              CAD Fabrication Nesting & MEPF Hydraulic Studio (M89)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Tối ưu cắt phôi ống 1D (FFD Algorithm), xếp tôn ống gió 2D CNC, tính toán thủy lực
              Hazen-Williams/Darcy-Weisbach và tem mã QR Spool
            </p>
          </div>

          <div className="flex flex-wrap rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setActiveTab("pipe_1d")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "pipe_1d"
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Scissors size={14} />
              1D Pipe Nesting (Cây 6m)
            </button>
            <button
              onClick={() => setActiveTab("duct_2d")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "duct_2d"
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Layers size={14} />
              2D Duct Sheet CNC
            </button>
            <button
              onClick={() => setActiveTab("hydraulic")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "hydraulic"
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Activity size={14} />
              Thủy lực & Vận tốc MEPF
            </button>
            <button
              onClick={() => setActiveTab("qr_spool")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === "qr_spool"
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <QrCode size={14} />
              Tem QR Spool
            </button>
          </div>
        </div>

        {loading && <PageSkeleton />}

        {!loading && (
          <div className="space-y-6">
            {/* Tab 1: 1D Pipe Nesting */}
            {activeTab === "pipe_1d" && nestingResult && (
              <>
                {/* KPI Banner */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-zinc-400">
                      Hiệu suất Tận dụng Phôi
                    </span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-3xl font-bold text-emerald-400">
                        {nestingResult.utilizationPercent}%
                      </span>
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-800">
                        HẠNG {nestingResult.efficiencyGrade}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-zinc-400">
                      Tỷ lệ Phế liệu Hao hụt
                    </span>
                    <div className="mt-1 font-mono text-3xl font-bold text-zinc-100">
                      {nestingResult.wastePercent}%
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      Tổng hao hụt: {(nestingResult.totalWasteMm / 1000).toFixed(2)} m
                    </span>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-zinc-400">
                      Số Cây Phôi Cần Cắt (Stock Bars)
                    </span>
                    <div className="mt-1 font-mono text-3xl font-bold text-sky-400">
                      {nestingResult.totalBarsUsed} cây
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      Tiêu chuẩn: {nestingResult.stockLengthMm / 1000} m/cây (Vết cắt {kerfMm}mm)
                    </span>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
                    <span className="text-xs font-semibold uppercase text-zinc-400">
                      Tổng Phân đoạn Cắt
                    </span>
                    <div className="mt-1 font-mono text-3xl font-bold text-amber-400">
                      {nestingResult.totalSegments} đoạn
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      Tổng chiều dài: {(nestingResult.totalUsedLengthMm / 1000).toFixed(2)} m
                    </span>
                  </div>
                </div>

                {/* Sơ đồ Cắt Phôi Từng Cây (Cutting Diagram) */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h2 className="flex items-center gap-2 text-base font-bold text-zinc-200">
                      <BarChart3 size={18} className="text-emerald-400" />
                      Sơ đồ Xếp Phôi Cắt Tối ưu (Bar Cutting Layouts)
                    </h2>
                    <button
                      onClick={runSampleNesting}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                    >
                      <RefreshCw size={12} />
                      Tối ưu lại
                    </button>
                  </div>

                  <div className="mt-6 space-y-6">
                    {nestingResult.bars.map((bar) => (
                      <div
                        key={bar.barIndex}
                        className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-zinc-200">
                            Cây phôi #{bar.barIndex} (Cây 6.0m)
                          </span>
                          <div className="flex items-center gap-4 font-mono text-zinc-400">
                            <span>Sử dụng: {(bar.usedLengthMm / 1000).toFixed(2)}m</span>
                            <span>Hao hụt: {(bar.wasteLengthMm / 1000).toFixed(2)}m</span>
                            <span className="font-bold text-emerald-400">
                              {bar.utilizationPercent}% Tận dụng
                            </span>
                          </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="mt-3 flex h-9 w-full overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
                          {bar.cuts.map((cut, cIdx) => {
                            const widthPct = (cut.lengthMm / bar.stockLengthMm) * 100;
                            return (
                              <div
                                key={cIdx}
                                style={{ width: `${widthPct}%` }}
                                className="relative flex items-center justify-center border-r border-zinc-950 bg-emerald-600/80 px-1 text-[11px] font-bold text-white transition-all hover:bg-emerald-500"
                                title={`${cut.spoolCode}: ${cut.lengthMm}mm`}
                              >
                                <span className="truncate">
                                  {cut.spoolCode} ({cut.lengthMm}mm)
                                </span>
                              </div>
                            );
                          })}
                          {bar.wasteLengthMm > 0 && (
                            <div
                              style={{ width: `${(bar.wasteLengthMm / bar.stockLengthMm) * 100}%` }}
                              className="flex items-center justify-center bg-red-950/60 text-[10px] font-semibold text-red-400"
                              title={`Phế liệu: ${bar.wasteLengthMm}mm`}
                            >
                              <span className="truncate">Hao {bar.wasteLengthMm}mm</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Tab 2: 2D Duct Sheet CNC */}
            {activeTab === "duct_2d" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
                <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                  <Layers size={18} className="text-emerald-400" />
                  Mô phỏng Trải Phôi Cắt Tôn Ống Gió 2D (Guillotine Sheet Nesting)
                </h2>
                <div className="mt-4 space-y-4 max-w-3xl">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Hệ thống tự động xếp các phôi tấm chữ nhật của Co, Côn, Lượn ống gió vào khổ tôn
                    tiêu chuẩn <strong>1200 x 2400 mm</strong> với khoảng hở mép cắt an toàn 10mm.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Khổ Tôn Chuẩn
                      </span>
                      <div className="mt-1 font-mono text-xl font-bold text-zinc-100">
                        1200 x 2400 mm
                      </div>
                      <span className="text-[10px] text-zinc-500">Diện tích: 2.88 m2/tấm</span>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        Hiệu quả Trải phôi
                      </span>
                      <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
                        &gt; 94.5%
                      </div>
                      <span className="text-[10px] text-zinc-500">Phế liệu biên &lt; 5.5%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Hydraulic & Aerodynamic MEPF Calculator */}
            {activeTab === "hydraulic" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Input Form */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-5">
                  <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                    <Scale size={18} className="text-emerald-400" />
                    Tham số Đường Ống Thủy Lực
                  </h2>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Hệ thống Cơ điện MEPF
                      </label>
                      <select
                        value={hydroSystem}
                        onChange={(e) => setHydroSystem(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      >
                        <option value="domestic_water">Cấp nước sinh hoạt (TCVN 4513)</option>
                        <option value="chilled_water">Nước lạnh Chiller (ASHRAE)</option>
                        <option value="pump_suction">Ống hút máy bơm (Chống Cavitation)</option>
                        <option value="duct_branch">Ống gió nhánh (Tiêu chuẩn ồn NC 30-35)</option>
                        <option value="duct_main">Ống gió trục chính (v &le; 10 m/s)</option>
                        <option value="fire_sprinkler">Ống cứu hỏa Sprinkler (NFPA 13)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Công thức tính toán
                      </label>
                      <select
                        value={hydroFormula}
                        onChange={(e) => setHydroFormula(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
                      >
                        <option value="hazen_williams">Hazen-Williams (Nước thông dụng)</option>
                        <option value="darcy_weisbach">Darcy-Weisbach & Colebrook-White</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-zinc-400">
                          Lưu lượng Q (L/s)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={flowRateLps}
                          onChange={(e) => setFlowRateLps(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-zinc-400">
                          Đường kính trong DN (mm)
                        </label>
                        <input
                          type="number"
                          value={pipeDiameterMm}
                          onChange={(e) => setPipeDiameterMm(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Chiều dài tuyến ống L (m)
                      </label>
                      <input
                        type="number"
                        value={pipeLengthM}
                        onChange={(e) => setPipeLengthM(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                      />
                    </div>

                    <button
                      onClick={handleRunHydraulic}
                      className="w-full rounded-lg bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                    >
                      Tính toán Thủy lực & Kiểm tra Vận tốc
                    </button>
                  </div>
                </div>

                {/* Result Display */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-7">
                  <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                    <Activity size={18} className="text-emerald-400" />
                    Kết quả Thủy lực & Phân tích Động học Dòng chảy
                  </h2>

                  {hydroResult && (
                    <div className="mt-4 space-y-4">
                      {/* Velocity Validation Badge */}
                      <div
                        className={`rounded-lg border p-4 ${
                          hydroResult.validation.status === "pass"
                            ? "border-emerald-800/60 bg-emerald-950/30"
                            : hydroResult.validation.status === "warning"
                              ? "border-amber-800/60 bg-amber-950/30"
                              : "border-red-800/60 bg-red-950/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase text-zinc-200">
                            Kiểm tra Vận tốc Dòng chảy (Velocity Invariant):
                          </span>
                          <span
                            className={`rounded px-2.5 py-0.5 text-xs font-bold uppercase ${
                              hydroResult.validation.status === "pass"
                                ? "bg-emerald-900 text-emerald-300"
                                : hydroResult.validation.status === "warning"
                                  ? "bg-amber-900 text-amber-300"
                                  : "bg-red-900 text-red-300"
                            }`}
                          >
                            {hydroResult.validation.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-zinc-300">
                          {hydroResult.validation.message}
                        </p>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            Vận tốc Dòng chảy (v)
                          </span>
                          <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">
                            {hydroResult.velocityMs} m/s
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            Giới hạn cho phép: &le; {hydroResult.validation.limitMs} m/s
                          </span>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            Tổn thất Cột áp (&Delta;P)
                          </span>
                          <div className="mt-1 font-mono text-2xl font-bold text-sky-400">
                            {hydroResult.totalHeadLossPa} Pa
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            ({hydroResult.pressureDropBar} bar / {pipeLengthM}m ống)
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">
                          Tổn thất áp suất trên 1 mét ống:
                        </span>
                        <span className="ml-2 font-mono text-sm font-bold text-zinc-200">
                          {hydroResult.headLossPerMeterPa} Pa/m
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: QR Spool Tag */}
            {activeTab === "qr_spool" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
                <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                  <QrCode size={18} className="text-emerald-400" />
                  Sinh Tem Nhãn QR Code Định Danh Phân Đoạn Spool
                </h2>

                <div className="mt-4 space-y-4 max-w-xl">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-zinc-400">
                      Mã Spool định danh
                    </label>
                    <input
                      type="text"
                      value={qrSpoolCode}
                      onChange={(e) => setQrSpoolCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 font-mono"
                    />
                  </div>

                  <button
                    onClick={handleGenerateQr}
                    className="rounded-lg bg-emerald-500 py-2 px-4 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                  >
                    Tạo Chuỗi Tem Mã QR
                  </button>

                  {qrResult && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-400">
                      <span className="text-[10px] text-zinc-400 uppercase font-bold block mb-1">
                        Dữ liệu Mã hóa QR (Payload):
                      </span>
                      {qrResult.qrData}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
