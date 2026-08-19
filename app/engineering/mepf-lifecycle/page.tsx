"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Zap,
  Activity,
  Gauge,
  Compass,
  DollarSign,
  Flame,
  Wind,
  Droplets,
  ZapIcon,
  GitBranch,
  Eye,
  Crosshair,
  CheckCircle,
  Scissors,
  Mic,
  Volume2,
  QrCode,
  Box,
  Sliders,
  Scale,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type TabMode =
  | "floorplan"
  | "lod400"
  | "bomqs"
  | "takeoff"
  | "hydraulic"
  | "nesting"
  | "voice"
  | "routing"
  | "variance"
  | "tc";

interface TakeoffRunItem {
  id: string;
  session_code: string;
  discipline: string;
  drawing_name: string;
  total_symbols_detected: number;
  total_linear_meters: string | number;
  total_duct_area_m2: string | number;
  inferred_fittings_count: number;
  vo_risk_summary: {
    has_vo_risk: boolean;
    total_delta_vnd: number;
    risk_count?: number;
  };
  created_at: string;
}

interface TcMatrixItem {
  id: string;
  matrix_code: string;
  title: string;
  test_type: string;
  system_code: string;
  floor_label: string;
  status: string;
  test_pressure_bar: number | null;
  holding_duration_minutes: number;
  created_at: string;
}

interface RouteOption {
  optionId: string;
  title: string;
  description: string;
  totalLengthM: number;
  fittingsCount: { elbow90: number; elbow45: number; offsets: number };
  estimatedCostVnd: number;
  pressureDropPa: number;
  minClearanceHeightM: number;
  paretoScore: number;
}

export default function MepfLifecyclePage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>("floorplan");
  const [takeoffRuns, setTakeoffRuns] = useState<TakeoffRunItem[]>([]);
  const [tcMatrices, setTcMatrices] = useState<TcMatrixItem[]>([]);
  const [runningTakeoff, setRunningTakeoff] = useState(false);
  const [runningTcEval, setRunningTcEval] = useState(false);
  const [tcResult, setTcResult] = useState<{ isPassed: boolean; verdictMessage: string } | null>(
    null,
  );

  // Selected CAD Entity on Floorplan
  const [selectedEntity, setSelectedEntity] = useState<{
    id: string;
    tag: string;
    type: string;
    discipline: string;
    spec: string;
    status: string;
    qty: string;
  } | null>({
    id: "SP-DUCT-01",
    tag: "HVAC-DUCT-500x300",
    type: "Gia công & Lắp đặt Ống gió Tôn",
    discipline: "hvac",
    spec: "500x300 mm, Tôn tráng kẽm 0.75mm",
    status: "installed (75%)",
    qty: "8.82 m²",
  });

  // Generative Routing State
  const [routingResult, setRoutingResult] = useState<{
    directDistanceM: number;
    clashesDetected: number;
    options: RouteOption[];
  } | null>(null);
  const [runningRouting, setRunningRouting] = useState(false);

  // Hydraulic Auto-Sizing State
  const [flowRateM3h, setFlowRateM3h] = useState("35.0");
  const [pipeLengthM, setPipeLengthM] = useState("60.0");
  const [runningHydraulic, setRunningHydraulic] = useState(false);
  const [hydraulicResult, setHydraulicResult] = useState<Record<string, unknown> | null>(null);

  // Nesting Optimization State
  const [runningNesting, setRunningNesting] = useState(false);
  const [nestingResult, setNestingResult] = useState<Record<string, unknown> | null>(null);

  // Voice Inspection State
  const [voiceText, setVoiceText] = useState(
    "Tầng 5 Zone A Căn 5.04, đoạn ống SP-FP-002 đã lắp xong, nhưng thiếu 1 cùm treo",
  );
  const [runningVoice, setRunningVoice] = useState(false);
  const [voiceParsedResult, setVoiceParsedResult] = useState<Record<string, unknown> | null>(null);

  // M69: LOD 400 DfMA & Sleeve Matrix State
  const [runningLod400, setRunningLod400] = useState(false);
  const [lod400Result, setLod400Result] = useState<Record<string, unknown> | null>(null);
  const [sampleIsoSheet, setSampleIsoSheet] = useState<Record<string, unknown> | null>(null);

  // M69: QS BOM Explosion & Reverse Rate State
  const [runningBomExplosion, setRunningBomExplosion] = useState(false);
  const [bomExplosionResult, setBomExplosionResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [fidicClaimResult, setFidicClaimResult] = useState<Record<string, unknown> | null>(null);

  // Form mock test hydrostatic
  const [initPressure, setInitPressure] = useState("10.0");
  const [finalPressure, setFinalPressure] = useState("9.85");
  const [durationMins, setDurationMins] = useState("120");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [resTakeoff, resTc] = await Promise.all([
        fetch("/api/engineering/mepf-takeoff"),
        fetch("/api/engineering/mepf-tc"),
      ]);

      if (resTakeoff.status === 401 || resTc.status === 401) {
        redirectToLogin();
        return;
      }

      if (resTakeoff.ok) {
        const data = await resTakeoff.json();
        setTakeoffRuns(data.runs || []);
      }

      if (resTc.ok) {
        const data = await resTc.json();
        setTcMatrices(data.matrices || []);
      }
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu MEPF Lifecycle:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunAiTakeoff = async () => {
    try {
      setRunningTakeoff(true);
      const res = await fetch("/api/engineering/mepf-takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discipline: "all",
          drawingName: "MB-MEPF-TANG-05-REV-C.DWG",
          sessionCode: `TKOFF-AI-${Date.now().toString(36).toUpperCase()}`,
          symbols: [
            {
              id: "S1",
              symbolType: "sprinkler_pendant",
              category: "sprinkler",
              tag: "SP-01",
              location: [100, 200, 0],
              spec: "K=5.6 68C",
              confidence: 0.99,
            },
            {
              id: "S2",
              symbolType: "sprinkler_pendant",
              category: "sprinkler",
              tag: "SP-02",
              location: [104, 200, 0],
              spec: "K=5.6 68C",
              confidence: 0.98,
            },
            {
              id: "V1",
              symbolType: "butterfly_valve",
              category: "valve",
              tag: "BV-DN100",
              location: [80, 150, 0],
              spec: "PN16 Lever",
              confidence: 0.97,
            },
            {
              id: "D1",
              symbolType: "diffuser_supply",
              category: "diffuser",
              tag: "SAD-600x600",
              location: [120, 210, 0],
              spec: "4-Way Neck 300",
              confidence: 0.96,
            },
          ],
          segments: [
            {
              id: "P1",
              discipline: "firefighting",
              systemCode: "FP",
              startPoint: [80, 150, 0],
              endPoint: [100, 200, 0],
              dimensionSpec: "DN100",
              lengthM: 25.5,
            },
            {
              id: "P2",
              discipline: "firefighting",
              systemCode: "FP",
              startPoint: [100, 200, 0],
              endPoint: [104, 200, 0],
              dimensionSpec: "DN50",
              lengthM: 4.0,
            },
            {
              id: "D1",
              discipline: "hvac",
              systemCode: "ACMV",
              startPoint: [50, 50, 0],
              endPoint: [120, 210, 0],
              dimensionSpec: "600x400",
              lengthM: 35.0,
            },
          ],
          contractBoqItems: [
            {
              boqCode: "BOQ-FP-01",
              description: "Ống thép tráng kẽm nhúng nóng DN100 SCH40",
              unit: "m",
              contractQty: 20.0,
              unitRateVnd: 450000,
            },
            {
              boqCode: "BOQ-AC-02",
              description: "Gia công lắp đặt ống gió tôn tráng kẽm 600x400 dày 0.75mm",
              unit: "m2",
              contractQty: 60.0,
              unitRateVnd: 320000,
            },
          ],
        }),
      });

      if (res.ok) {
        await fetchData();
        setActiveTab("takeoff");
      }
    } catch (err) {
      console.error("Lỗi khi chạy AI Takeoff:", err);
    } finally {
      setRunningTakeoff(false);
    }
  };

  const handleRunLod400Dfma = async () => {
    try {
      setRunningLod400(true);
      const res = await fetch("/api/engineering/shopdrawing-lod400", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert_lod400" }),
      });

      if (res.ok) {
        const data = await res.json();
        setLod400Result(data.lod400);
        setSampleIsoSheet(data.sampleIsoSheet);
      }
    } catch (err) {
      console.error("Lỗi chạy LOD 400 DfMA:", err);
    } finally {
      setRunningLod400(false);
    }
  };

  const handleRunBomExplosion = async () => {
    try {
      setRunningBomExplosion(true);
      const res = await fetch("/api/engineering/qs-bom-explosion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "explode_bom",
          itemCode: "BOQ-FP-DN100",
          itemDescription: "Cung cấp và lắp đặt ống thép tráng kẽm nhúng nóng DN100 SCH40",
          contractRateVnd: 520000,
          quantity: 25.5,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBomExplosionResult(data);
      }
    } catch (err) {
      console.error("Lỗi bung BOM Explosion:", err);
    } finally {
      setRunningBomExplosion(false);
    }
  };

  const handleRunFidicClaim = async () => {
    try {
      const res = await fetch("/api/engineering/qs-bom-explosion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fidic_claim",
          projectName: "TT AVIO Tháp A (MEPF)",
          claimCode: `CLM-FIDIC-${Date.now().toString(36).toUpperCase()}`,
          eventDescription:
            "Bổ sung 25.5m ống cứu hỏa DN100 do thay đổi thiết kế mặt bằng phân phòng Tầng 5",
          deltaVoQty: 25.5,
          unitRateVnd: 520000,
          impactDays: 7,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setFidicClaimResult(data.claimDoc);
      }
    } catch (err) {
      console.error("Lỗi sinh hồ sơ FIDIC:", err);
    }
  };

  const handleRunGenerativeRouting = async () => {
    try {
      setRunningRouting(true);
      const res = await fetch("/api/engineering/mepf-takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generative_route",
          startPoint: [0, 0, 2600],
          endPoint: [12000, 6000, 2600],
          obstacles: [
            {
              id: "B1",
              name: "Dầm Kết Cấu D400x600",
              category: "beam",
              minPoint: [5000, 0, 2400],
              maxPoint: [5400, 8000, 3000],
            },
          ],
          pipeDiameterMm: 100,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoutingResult(data.solution);
      }
    } catch (err) {
      console.error("Lỗi khi chạy Generative Routing:", err);
    } finally {
      setRunningRouting(false);
    }
  };

  const handleRunHydraulic = async () => {
    try {
      setRunningHydraulic(true);
      const res = await fetch("/api/engineering/mepf-hydraulic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemType: "chilled_water",
          flowRateM3h: parseFloat(flowRateM3h),
          pipeLengthM: parseFloat(pipeLengthM),
          maxVelocityMs: 1.5,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHydraulicResult(data.analysis);
      }
    } catch (err) {
      console.error("Lỗi tính thủy lực:", err);
    } finally {
      setRunningHydraulic(false);
    }
  };

  const handleRunNesting = async () => {
    try {
      setRunningNesting(true);
      const res = await fetch("/api/engineering/mepf-nesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialType: "Ống Thép Đen DN100 SCH40 (Cây 6m)",
          stockLengthM: 6.0,
          requiredPieces: [
            { id: "P1", spoolCode: "SP-FP-01", lengthM: 3.5, quantity: 4 },
            { id: "P2", spoolCode: "SP-FP-02", lengthM: 2.5, quantity: 4 },
            { id: "P3", spoolCode: "SP-FP-03", lengthM: 1.8, quantity: 6 },
            { id: "P4", spoolCode: "SP-FP-04", lengthM: 1.2, quantity: 6 },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNestingResult(data.plan);
      }
    } catch (err) {
      console.error("Lỗi tối ưu cắt phôi:", err);
    } finally {
      setRunningNesting(false);
    }
  };

  const handleRunVoiceInspection = async () => {
    try {
      setRunningVoice(true);
      const res = await fetch("/api/engineering/mepf-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "parse_voice",
          text: voiceText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setVoiceParsedResult(data.parsed);
      }
    } catch (err) {
      console.error("Lỗi phân tích giọng nói:", err);
    } finally {
      setRunningVoice(false);
    }
  };

  const handleEvaluateHydrostatic = async () => {
    try {
      setRunningTcEval(true);
      const res = await fetch("/api/engineering/mepf-tc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate_hydrostatic",
          initialPressureBar: parseFloat(initPressure),
          finalPressureBar: parseFloat(finalPressure),
          durationMinutes: parseInt(durationMins, 10),
          requiredDurationMinutes: 120,
          allowableDropBar: 0.2,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTcResult(data.evaluation);
      }
    } catch (err) {
      console.error("Lỗi khi đánh giá T&C:", err);
    } finally {
      setRunningTcEval(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <AppHeader />
      <EngineeringNav />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Header Hero */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-950/40 via-purple-950/20 to-neutral-900 border border-blue-900/40 p-6 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider mb-2">
              <Cpu className="w-4 h-4" />
              Omnipotent & Cognitive MEPF Super Skills OS (M65 – M69)
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-100 tracking-tight">
              Trung Tâm Điều Hành MEPF AI Toàn Năng
            </h1>
            <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
              Hợp nhất Trí tuệ Nhân tạo từ Shopdrawing LOD 400 DfMA $\rightarrow$ Lỗ Mở Sleeve
              $\rightarrow$ Giải Mã Đơn Giá Thầu $\rightarrow$ BOM 4 Tầng $\rightarrow$ Thủy Lực
              $\rightarrow$ Xếp Cắt Phôi $\rightarrow$ BBNT Nghị định 06.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
            <button
              onClick={handleRunAiTakeoff}
              disabled={runningTakeoff}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-600/20 transition"
            >
              <Sparkles className={`w-3.5 h-3.5 ${runningTakeoff ? "animate-spin" : ""}`} />
              {runningTakeoff ? "AI Đang Bóc Tách..." : "Chạy AI Takeoff (Mẫu)"}
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-neutral-800 gap-1.5 pb-2 overflow-x-auto scrollbar-none text-xs font-medium">
          <button
            onClick={() => setActiveTab("floorplan")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "floorplan"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            1. Mặt Bằng CAD Số
          </button>
          <button
            onClick={() => setActiveTab("lod400")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "lod400"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            2. Shopdrawing LOD 400
          </button>
          <button
            onClick={() => setActiveTab("bomqs")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "bomqs"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            3. Giải Mã Đơn Giá & BOM
          </button>
          <button
            onClick={() => setActiveTab("takeoff")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "takeoff"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            4. AI Takeoff & QS
          </button>
          <button
            onClick={() => setActiveTab("hydraulic")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "hydraulic"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Droplets className="w-3.5 h-3.5 text-sky-400" />
            5. Thủy Lực & Cỡ Ống
          </button>
          <button
            onClick={() => setActiveTab("nesting")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "nesting"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Scissors className="w-3.5 h-3.5 text-purple-400" />
            6. 1D Nesting Cắt Phôi
          </button>
          <button
            onClick={() => setActiveTab("voice")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "voice"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            7. Tracking Giọng Nói
          </button>
          <button
            onClick={() => setActiveTab("routing")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "routing"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            8. Generative 3D Routing
          </button>
          <button
            onClick={() => setActiveTab("variance")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "variance"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            9. Đối Soát BOQ & VO
          </button>
          <button
            onClick={() => setActiveTab("tc")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition ${
              activeTab === "tc"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            10. Smart T&C Thử Áp
          </button>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : (
          <>
            {/* TAB 1: INTERACTIVE FLOORPLAN */}
            {activeTab === "floorplan" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* SVG Floorplan Viewport */}
                  <div className="lg:col-span-2 bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 flex flex-col space-y-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                      <div className="flex items-center gap-2 text-xs font-mono text-neutral-300">
                        <Crosshair className="w-4 h-4 text-blue-400" />
                        MẶT BẰNG MEPF TẦNG 5 (MB-T05-ZONE-A) — TƯƠNG TÁC CHẠM
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="inline-flex items-center gap-1 text-sky-400">
                          <span className="w-2 h-2 rounded-full bg-sky-400"></span> Ống Gió HVAC
                        </span>
                        <span className="inline-flex items-center gap-1 text-red-400">
                          <span className="w-2 h-2 rounded-full bg-red-400"></span> PCCC (FP)
                        </span>
                        <span className="inline-flex items-center gap-1 text-blue-400">
                          <span className="w-2 h-2 rounded-full bg-blue-400"></span> Cấp Thoát Nước
                        </span>
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span> Máng Cáp Điện
                        </span>
                      </div>
                    </div>

                    <div className="relative w-full h-96 bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800/80 flex items-center justify-center">
                      <svg
                        viewBox="0 0 800 400"
                        className="w-full h-full select-none cursor-crosshair"
                      >
                        <defs>
                          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path
                              d="M 40 0 L 0 0 0 40"
                              fill="none"
                              stroke="#262626"
                              strokeWidth="0.5"
                            />
                          </pattern>
                        </defs>
                        <rect width="800" height="400" fill="url(#grid)" />

                        <line
                          x1="100"
                          y1="50"
                          x2="700"
                          y2="50"
                          stroke="#404040"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <line
                          x1="100"
                          y1="350"
                          x2="700"
                          y2="350"
                          stroke="#404040"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <line
                          x1="100"
                          y1="50"
                          x2="100"
                          y2="350"
                          stroke="#404040"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <line
                          x1="400"
                          y1="50"
                          x2="400"
                          y2="350"
                          stroke="#404040"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <line
                          x1="700"
                          y1="50"
                          x2="700"
                          y2="350"
                          stroke="#404040"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />

                        <rect
                          x="380"
                          y="50"
                          width="40"
                          height="300"
                          fill="#3f3f46"
                          fillOpacity="0.3"
                          stroke="#71717a"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                        <text x="385" y="70" fill="#a1a1aa" fontSize="10" fontFamily="monospace">
                          Dầm D400x600
                        </text>

                        {/* Tuyến ống gió HVAC */}
                        <g
                          onClick={() =>
                            setSelectedEntity({
                              id: "SP-DUCT-01",
                              tag: "HVAC-DUCT-600x400",
                              type: "Gia công Ống gió Tôn",
                              discipline: "hvac",
                              spec: "600x400 mm, Tôn mạ kẽm Z18",
                              status: "installed (75%)",
                              qty: "14.2 m²",
                            })
                          }
                          className="cursor-pointer hover:opacity-80 transition"
                        >
                          <rect
                            x="120"
                            y="120"
                            width="520"
                            height="24"
                            fill="#0284c7"
                            fillOpacity="0.4"
                            stroke="#38bdf8"
                            strokeWidth="2"
                          />
                          <text x="250" y="136" fill="#e0f2fe" fontSize="11" fontFamily="monospace">
                            DUCT 600x400 (SP-HVAC-T5-01)
                          </text>
                        </g>

                        {/* Tuyến ống PCCC Sprinkler */}
                        <g
                          onClick={() =>
                            setSelectedEntity({
                              id: "SP-FP-01",
                              tag: "FP-PIPE-DN100",
                              type: "Ống Thép Chữa Cháy SCH40",
                              discipline: "firefighting",
                              spec: "DN100 SCH40 Tráng Kẽm",
                              status: "bbnt_approved (100%)",
                              qty: "25.5 m",
                            })
                          }
                          className="cursor-pointer hover:opacity-80 transition"
                        >
                          <line
                            x1="120"
                            y1="220"
                            x2="650"
                            y2="220"
                            stroke="#ef4444"
                            strokeWidth="4"
                          />
                          <circle
                            cx="200"
                            cy="220"
                            r="6"
                            fill="#f87171"
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          <circle
                            cx="350"
                            cy="220"
                            r="6"
                            fill="#f87171"
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          <circle
                            cx="500"
                            cy="220"
                            r="6"
                            fill="#f87171"
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          <circle
                            cx="650"
                            cy="220"
                            r="6"
                            fill="#f87171"
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          <text x="220" y="210" fill="#fca5a5" fontSize="11" fontFamily="monospace">
                            FP-DN100 Main Header
                          </text>
                        </g>
                      </svg>
                    </div>
                  </div>

                  {/* Property Inspector Panel */}
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
                    <h3 className="font-semibold text-neutral-200 text-sm flex items-center gap-2 border-b border-neutral-800 pb-3">
                      <Layers className="w-4 h-4 text-blue-400" />
                      Thông Số Kỹ Thuật Đối Tượng
                    </h3>

                    {selectedEntity ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <span className="text-neutral-400 block text-[11px]">Mã Spool</span>
                          <span className="font-mono font-bold text-blue-400 text-sm">
                            {selectedEntity.id}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">Hạng Mục</span>
                          <span className="text-neutral-200 font-medium">
                            {selectedEntity.type}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">Quy Cách</span>
                          <span className="text-neutral-300 font-mono">{selectedEntity.spec}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">Khối Lượng 5D</span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {selectedEntity.qty}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Trạng Thái Hiện Trường
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 text-neutral-200 font-mono mt-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            {selectedEntity.status}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SHOPDRAWING LOD 400 DfMA & SLEEVE MATRIX */}
            {activeTab === "lod400" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm">
                        <Box className="w-4 h-4 text-cyan-400" />
                        Động Cơ Shopdrawing LOD 400 DfMA & Ma Trận Lỗ Mở Xuyên Dầm (Sleeve Matrix)
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Tự động phân chia Spool gia công xưởng (L &le; 5.8m), giật dốc 2% thoát
                        nước, chèn mặt bích, bọc bảo ôn và quét lỗ mở xuyên dầm an toàn kết cấu.
                      </p>
                    </div>

                    <button
                      onClick={handleRunLod400Dfma}
                      disabled={runningLod400}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition shadow flex items-center gap-2"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${runningLod400 ? "animate-spin" : ""}`} />
                      {runningLod400
                        ? "Đang Sinh Bản Vẽ..."
                        : "Chạy AI Auto-LOD 400 & Lỗ Mở Sleeve"}
                    </button>
                  </div>

                  {lod400Result && (
                    <div className="space-y-6 pt-3 border-t border-neutral-800">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Tổng Spool Gia Công
                          </span>
                          <span className="font-bold text-cyan-400 font-mono text-base">
                            {String(lod400Result.totalSpoolsGenerated)} Spools
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">Độ Dốc Áp Dụng</span>
                          <span className="font-bold text-emerald-400 font-mono text-base">
                            {String(lod400Result.slopeAppliedPercent)}% (TCVN 4474)
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Cặp Bích Chèn Tự Động
                          </span>
                          <span className="font-bold text-amber-400 font-mono text-base">
                            {String(lod400Result.flangePairsInserted)} cặp PN16
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Lỗ Mở Xuyên Dầm (Sleeve)
                          </span>
                          <span className="font-bold text-purple-400 font-mono text-base">
                            {String(lod400Result.sleevesCount)} vị trí
                          </span>
                        </div>
                      </div>

                      {/* Bảng danh mục lỗ mở Sleeve */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-neutral-300">
                          Ma Trận Lỗ Mở Chờ Xuyên Dầm Đặt Trước Đổ Bê Tông (Sleeve Schedule):
                        </span>
                        <div className="overflow-x-auto border border-neutral-800 rounded-lg">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                              <tr>
                                <th className="p-2.5">Mã Sleeve</th>
                                <th className="p-2.5">Dầm Kết Cấu</th>
                                <th className="p-2.5">Cỡ Ống MEPF</th>
                                <th className="p-2.5">Đường Kính Lỗ Mở (OD)</th>
                                <th className="p-2.5">Tọa Độ [X, Y, Z]</th>
                                <th className="p-2.5">Đánh Giá An Toàn Kết Cấu</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 text-neutral-300">
                              {(lod400Result.sleeveDetails as Array<Record<string, unknown>>)?.map(
                                (s, sIdx) => (
                                  <tr key={sIdx} className="hover:bg-neutral-800/30">
                                    <td className="p-2.5 font-mono font-bold text-cyan-400">
                                      {String(s.sleeveCode)}
                                    </td>
                                    <td className="p-2.5 font-mono">{String(s.beamCode)}</td>
                                    <td className="p-2.5">{String(s.pipeSpec)}</td>
                                    <td className="p-2.5 font-mono font-bold text-amber-400">
                                      &Phi; {String(s.sleeveDiameterMm)} mm
                                    </td>
                                    <td className="p-2.5 font-mono text-neutral-400">
                                      [
                                      {Array.isArray(s.centerCoordinate)
                                        ? (s.centerCoordinate as number[]).join(", ")
                                        : ""}
                                      ]
                                    </td>
                                    <td className="p-2.5 font-bold text-emerald-400">
                                      ĐẠT CHUẨN AN TOÀN CHỊU CẮT (&le; H/3)
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Mẫu bản vẽ Isometric Spool Sheet */}
                      {sampleIsoSheet && (
                        <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                            <span className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                              <QrCode className="w-4 h-4 text-cyan-400" />
                              MẪU BẢN VẼ GIA CÔNG ISOMETRIC SPOOL SHEET (DfMA)
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {String(sampleIsoSheet.qrFabricationToken)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-neutral-400 block text-[11px]">Mã Spool:</span>
                              <span className="font-mono font-bold text-neutral-100">
                                {String(sampleIsoSheet.spoolCode)}
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-400 block text-[11px]">
                                Chiều dài cắt phôi:
                              </span>
                              <span className="font-mono font-bold text-emerald-400">
                                {String(sampleIsoSheet.cutLengthM)} m
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-400 block text-[11px]">
                                Số mối hàn / cặp bích:
                              </span>
                              <span className="font-mono font-bold text-amber-400">
                                {String(sampleIsoSheet.weldingSeamsCount)} mối hàn •{" "}
                                {String(sampleIsoSheet.flangePairsCount)} bích
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: QS BOM EXPLOSION & REVERSE RATE */}
            {activeTab === "bomqs" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm">
                        <Scale className="w-4 h-4 text-amber-400" />
                        Giải Mã Ngược Đơn Giá Thầu & Multi-Level BOM Explosion (Level 1-4)
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Tự động bóc tách đơn giá khoán thành 5 thành phần gốc (Vật tư chính, Phụ
                        15%, Nhân công, Ca máy, Lợi nhuận) và bung chi tiết bu lông, gioăng, que
                        hàn, ty ren.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleRunFidicClaim}
                        className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-bold transition border border-neutral-700 flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        1-Click Hồ Sơ FIDIC / EOT
                      </button>
                      <button
                        onClick={handleRunBomExplosion}
                        disabled={runningBomExplosion}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow flex items-center gap-2"
                      >
                        <Sparkles
                          className={`w-3.5 h-3.5 ${runningBomExplosion ? "animate-spin" : ""}`}
                        />
                        {runningBomExplosion ? "Đang Phân Tích..." : "Chạy Giải Mã Đơn Giá & BOM"}
                      </button>
                    </div>
                  </div>

                  {bomExplosionResult && (
                    <div className="space-y-6 pt-3 border-t border-neutral-800">
                      {/* Phân rã 5 thành phần đơn giá */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            1. Vật Tư Chính (58%)
                          </span>
                          <span className="font-bold text-neutral-100 font-mono text-sm">
                            {Number(
                              (
                                bomExplosionResult.breakdown as Record<
                                  string,
                                  Record<string, number>
                                >
                              )?.breakdown?.materialMainVnd || 0,
                            ).toLocaleString()}{" "}
                            đ
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            2. Vật Tư Phụ (12%)
                          </span>
                          <span className="font-bold text-cyan-400 font-mono text-sm">
                            {Number(
                              (
                                bomExplosionResult.breakdown as Record<
                                  string,
                                  Record<string, number>
                                >
                              )?.breakdown?.materialAuxVnd || 0,
                            ).toLocaleString()}{" "}
                            đ
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            3. Nhân Công Lắp (18%)
                          </span>
                          <span className="font-bold text-blue-400 font-mono text-sm">
                            {Number(
                              (
                                bomExplosionResult.breakdown as Record<
                                  string,
                                  Record<string, number>
                                >
                              )?.breakdown?.laborDirectVnd || 0,
                            ).toLocaleString()}{" "}
                            đ
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            4. Ca Máy/Dụng Cụ (5%)
                          </span>
                          <span className="font-bold text-purple-400 font-mono text-sm">
                            {Number(
                              (
                                bomExplosionResult.breakdown as Record<
                                  string,
                                  Record<string, number>
                                >
                              )?.breakdown?.machineryToolsVnd || 0,
                            ).toLocaleString()}{" "}
                            đ
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            5. Điểm Hòa Vốn (Break-even)
                          </span>
                          <span className="font-bold text-emerald-400 font-mono text-sm">
                            {Number(
                              (bomExplosionResult.breakdown as Record<string, number>)
                                ?.breakEvenCostVnd || 0,
                            ).toLocaleString()}{" "}
                            đ
                          </span>
                        </div>
                      </div>

                      {/* Danh mục vật tư nổ tung BOM 4 tầng */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-neutral-300">
                          Danh Mục Chi Tiết Nổ Tung Vật Tư (BOM Explosion Level 1-4):
                        </span>
                        <div className="overflow-x-auto border border-neutral-800 rounded-lg">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                              <tr>
                                <th className="p-2.5">Tầng BOM</th>
                                <th className="p-2.5">Nhóm Vật Tư</th>
                                <th className="p-2.5">Tên Vật Tư & Quy Cách</th>
                                <th className="p-2.5">Định Mức / Đơn Vị</th>
                                <th className="p-2.5">Đơn Giá</th>
                                <th className="p-2.5 text-right">Thành Tiền (VND)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 text-neutral-300">
                              {(
                                (bomExplosionResult.bom as Record<string, unknown>)?.items as Array<
                                  Record<string, unknown>
                                >
                              )?.map((item, idx) => (
                                <tr key={idx} className="hover:bg-neutral-800/30">
                                  <td className="p-2.5 font-mono font-bold text-amber-400">
                                    Level {String(item.level)}
                                  </td>
                                  <td className="p-2.5 uppercase text-[10px] text-neutral-400">
                                    {String(item.category)}
                                  </td>
                                  <td className="p-2.5">
                                    <div className="font-bold text-neutral-200">
                                      {String(item.itemName)}
                                    </div>
                                    <div className="text-[10px] text-neutral-400">
                                      {String(item.spec)}
                                    </div>
                                  </td>
                                  <td className="p-2.5 font-mono">
                                    {String(item.quantityPerUnit)} {String(item.unit)}
                                  </td>
                                  <td className="p-2.5 font-mono">
                                    {Number(item.unitCostVnd || 0).toLocaleString()} đ
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                                    {Number(item.totalCostVnd || 0).toLocaleString()} đ
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Modal hiển thị Hồ Sơ FIDIC Claim */}
                  {fidicClaimResult && (
                    <div className="bg-neutral-950 p-5 rounded-xl border border-blue-900/60 space-y-3">
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                        <span className="text-xs font-mono font-bold text-blue-400 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-400" />
                          HỒ SƠ ĐÒI BỒI THƯỜNG PHÁT SINH & GIA HẠN TIẾN ĐỘ CHUẨN FIDIC
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          SHA-256: {String(fidicClaimResult.provenanceHash)}
                        </span>
                      </div>
                      <pre className="text-[11px] font-mono text-neutral-300 whitespace-pre-wrap bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
                        {String(fidicClaimResult.legalNoticeContent)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: HYDRAULIC AUTO-SIZING */}
            {activeTab === "hydraulic" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                    <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm">
                      <Droplets className="w-4 h-4 text-sky-400" />
                      Thông Số Thủy Lực Đầu Vào
                    </h3>
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-neutral-400 mb-1">
                          Lưu lượng nước thiết kế (m³/h)
                        </label>
                        <input
                          type="number"
                          value={flowRateM3h}
                          onChange={(e) => setFlowRateM3h(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-400 mb-1">
                          Chiều dài tuyến ống (m)
                        </label>
                        <input
                          type="number"
                          value={pipeLengthM}
                          onChange={(e) => setPipeLengthM(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-400 mb-1">
                          Giới hạn vận tốc tối đa (m/s)
                        </label>
                        <div className="p-2 bg-neutral-950 border border-neutral-800 rounded text-neutral-300 font-mono">
                          1.50 m/s (Tiêu chuẩn triệt tiêu tiếng ồn)
                        </div>
                      </div>
                      <button
                        onClick={handleRunHydraulic}
                        disabled={runningHydraulic}
                        className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-bold transition shadow flex items-center justify-center gap-2"
                      >
                        <Sparkles className={`w-4 h-4 ${runningHydraulic ? "animate-spin" : ""}`} />
                        {runningHydraulic
                          ? "Đang Tính Toán Thủy Lực..."
                          : "Chạy AI Chọn Cỡ Ống & Ty Treo"}
                      </button>
                    </div>
                  </div>

                  {hydraulicResult && (
                    <div className="md:col-span-2 bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm border-b border-neutral-800 pb-3">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        Kết Quả Phân Tích Thủy Lực & Bố Trí Giá Đỡ Ty Treo (Hazen-Williams)
                      </h3>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Cỡ Ống Khuyến Nghị
                          </span>
                          <span className="font-bold text-sky-400 font-mono text-base">
                            {String(hydraulicResult.selectedDiameterSpec)}
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Vận Tốc Dòng Chảy
                          </span>
                          <span className="font-bold text-emerald-400 font-mono text-base">
                            {String(hydraulicResult.fluidVelocityMs)} m/s
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Tổn Thất Áp Lực
                          </span>
                          <span className="font-bold text-amber-400 font-mono text-base">
                            {String(hydraulicResult.headLossBar)} Bar
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Bước Giá Đỡ Ty Treo
                          </span>
                          <span className="font-bold text-purple-400 font-mono text-base">
                            {String(hydraulicResult.recommendedHangerSpacingM)} m
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-xs space-y-1.5">
                        <div className="text-neutral-300">
                          <strong>Tổng tải trọng ống đầy nước + bảo ôn:</strong>{" "}
                          <span className="font-mono text-neutral-100">
                            {String(hydraulicResult.totalWeightFullWaterKg)} kg
                          </span>
                        </div>
                        <div className="text-neutral-300">
                          <strong>Kích thước ty ren chịu lực:</strong>{" "}
                          <span className="font-mono text-blue-400 font-bold">
                            {String(hydraulicResult.recommendedRodSize)}
                          </span>{" "}
                          (Bulong nở M{String(hydraulicResult.recommendedRodSize).slice(1)})
                        </div>
                        <div className="text-neutral-300">
                          <strong>Số lượng bộ giá đỡ cần gia công:</strong>{" "}
                          <span className="font-mono text-emerald-400 font-bold">
                            {String(hydraulicResult.totalHangersNeeded)} bộ
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: NESTING OPTIMIZER */}
            {activeTab === "nesting" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm">
                        <Scissors className="w-4 h-4 text-purple-400" />
                        Động Cơ 1D Cutting Stock & Spool Nesting (Tối Ưu Cắt Ống/Máng Cáp 6m)
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Thuật toán Best-Fit Decreasing tự động xếp các đoạn Spool lẻ vào thanh phôi
                        6m, giảm phế liệu phôi thừa xuống dưới 1.8%.
                      </p>
                    </div>

                    <button
                      onClick={handleRunNesting}
                      disabled={runningNesting}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition shadow flex items-center gap-2"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${runningNesting ? "animate-spin" : ""}`} />
                      {runningNesting ? "Đang Tối Ưu Xếp Cắt..." : "Chạy Thuật Toán 1D Nesting"}
                    </button>
                  </div>

                  {nestingResult && (
                    <div className="space-y-4 pt-3 border-t border-neutral-800">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Tổng Đoạn Cần Cắt
                          </span>
                          <span className="font-bold text-neutral-100 font-mono text-base">
                            {String(nestingResult.totalRequiredPieces)} đoạn
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Số Cây Ống 6m Cần Nhập
                          </span>
                          <span className="font-bold text-blue-400 font-mono text-base">
                            {String(nestingResult.totalStockBarsNeeded)} cây
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Tỷ Lệ Phế Liệu Thừa
                          </span>
                          <span className="font-bold text-emerald-400 font-mono text-base">
                            {String(nestingResult.overallScrapWastePercent)}% (&lt; 1.8%)
                          </span>
                        </div>
                        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 block text-[11px]">
                            Đánh Giá Tối Ưu
                          </span>
                          <span className="font-bold text-emerald-400 text-xs uppercase">
                            ĐẠT CHUẨN XƯỞNG DfMA
                          </span>
                        </div>
                      </div>

                      {/* Sơ đồ cắt chi tiết */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-neutral-300">
                          Sơ Đồ Cắt Chi Tiết Từng Cây Ống (Cutting Schedule):
                        </span>
                        <div className="space-y-2">
                          {(nestingResult.patterns as Array<Record<string, unknown>>)?.map(
                            (bar, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                              >
                                <div className="font-mono font-bold text-blue-400">
                                  CÂY #{idx + 1} (6.0m):
                                </div>
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  {(bar.cuts as Array<Record<string, unknown>>)?.map((c, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 font-mono"
                                    >
                                      {String(c.spoolCode)}: {String(c.lengthM)}m
                                    </span>
                                  ))}
                                </div>
                                <div className="text-[11px] font-mono text-neutral-400">
                                  Thừa:{" "}
                                  <span className="text-amber-400 font-bold">
                                    {String(bar.scrapWasteM)}m ({String(bar.scrapWastePercent)}%)
                                  </span>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 7: VOICE LOGGER */}
            {activeTab === "voice" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                    <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm">
                      <Mic className="w-4 h-4 text-emerald-400" />
                      Ghi Nhận Nghiệm Thu Bằng Giọng Nói Hiện Trường
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Kỹ sư nói hoặc nhập nội dung ghi nhận tại hiện trường; AI tự động trích xuất
                      vị trí, mã Spool, cập nhật trạng thái và tạo phiếu lỗi Punch-list.
                    </p>
                    <textarea
                      rows={4}
                      value={voiceText}
                      onChange={(e) => setVoiceText(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded p-3 text-xs text-neutral-100 font-sans"
                    />
                    <button
                      onClick={handleRunVoiceInspection}
                      disabled={runningVoice}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition shadow flex items-center justify-center gap-2"
                    >
                      <Volume2 className={`w-4 h-4 ${runningVoice ? "animate-spin" : ""}`} />
                      {runningVoice ? "Đang Bóc Tách Thực Thể..." : "Phân Tích Ngữ Nghĩa Giọng Nói"}
                    </button>
                  </div>

                  {voiceParsedResult && (
                    <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2 text-sm border-b border-neutral-800 pb-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Kết Quả Trích Xuất & Tác Vụ Tự Động
                      </h3>

                      <div className="space-y-2.5 text-xs">
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Vị Trí Hiện Trường:
                          </span>
                          <span className="font-bold text-neutral-100">
                            {String(voiceParsedResult.extractedLocation)}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Mã Spool Định Danh:
                          </span>
                          <span className="font-mono font-bold text-blue-400">
                            {String(voiceParsedResult.extractedSpoolCode || "Chung Khu Vực")}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Trạng Thái Ghi Nhận:
                          </span>
                          <span className="font-mono text-emerald-400 font-bold">
                            {String(voiceParsedResult.detectedStatus)}
                          </span>
                        </div>

                        {Boolean(voiceParsedResult.hasDefect) && (
                          <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-red-300 space-y-1">
                            <div className="font-bold flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                              TỰ ĐỘNG TẠO PHIẾU DEFECT TICKET (Mức độ:{" "}
                              {String(voiceParsedResult.defectSeverity)})
                            </div>
                            <p className="text-[11px]">
                              {String(voiceParsedResult.defectDescription)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: TAKEOFF */}
            {activeTab === "takeoff" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl">
                    <div className="text-xs text-neutral-400 uppercase font-mono">
                      Tổng Phiên Bóc Tách
                    </div>
                    <div className="text-2xl font-bold text-neutral-100 mt-1">
                      {takeoffRuns.length}
                    </div>
                  </div>
                  <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl">
                    <div className="text-xs text-neutral-400 uppercase font-mono">
                      Độ Chính Xác Ký Hiệu
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">98.6%</div>
                  </div>
                  <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl">
                    <div className="text-xs text-neutral-400 uppercase font-mono">
                      Thời Gian Bóc Trung Bình
                    </div>
                    <div className="text-2xl font-bold text-blue-400 mt-1">&lt; 1.2s</div>
                  </div>
                  <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl">
                    <div className="text-xs text-neutral-400 uppercase font-mono">
                      Tiêu Chuẩn Áp Dụng
                    </div>
                    <div className="text-xs font-mono text-neutral-300 mt-1">
                      TCVN 5687 / QCVN 06
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                    <h3 className="font-semibold text-neutral-200 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      Lịch Sử Các Phiên AI Auto-Takeoff
                    </h3>
                  </div>

                  {takeoffRuns.length === 0 ? (
                    <EmptyState
                      icon={Cpu}
                      title="Chưa có phiên bóc tách nào"
                      message="Bấm 'Chạy AI Takeoff' để hệ thống tự động bóc tách bản vẽ MEPF mẫu."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                          <tr>
                            <th className="p-3">Mã Phiên</th>
                            <th className="p-3">Hệ Thống</th>
                            <th className="p-3">Bản Vẽ</th>
                            <th className="p-3">Ký Hiệu</th>
                            <th className="p-3">Mét Dài Ống</th>
                            <th className="p-3">Diện Tích Gió</th>
                            <th className="p-3">Phụ Kiện</th>
                            <th className="p-3">Cảnh Báo VO</th>
                            <th className="p-3">Thời Gian</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                          {takeoffRuns.map((r) => (
                            <tr key={r.id} className="hover:bg-neutral-800/30">
                              <td className="p-3 font-mono font-medium text-blue-400">
                                {r.session_code}
                              </td>
                              <td className="p-3 uppercase">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">
                                  {r.discipline === "firefighting" && (
                                    <Flame className="w-3 h-3 text-red-400" />
                                  )}
                                  {r.discipline === "hvac" && (
                                    <Wind className="w-3 h-3 text-sky-400" />
                                  )}
                                  {r.discipline === "plumbing" && (
                                    <Droplets className="w-3 h-3 text-blue-400" />
                                  )}
                                  {r.discipline === "electrical" && (
                                    <ZapIcon className="w-3 h-3 text-amber-400" />
                                  )}
                                  {r.discipline}
                                </span>
                              </td>
                              <td className="p-3 font-mono">{r.drawing_name}</td>
                              <td className="p-3 font-bold text-neutral-100">
                                {r.total_symbols_detected} cái
                              </td>
                              <td className="p-3 font-mono">
                                {Number(r.total_linear_meters).toFixed(1)} m
                              </td>
                              <td className="p-3 font-mono">
                                {Number(r.total_duct_area_m2).toFixed(1)} m²
                              </td>
                              <td className="p-3 font-bold text-purple-400">
                                {r.inferred_fittings_count} cái
                              </td>
                              <td className="p-3">
                                {r.vo_risk_summary?.has_vo_risk ? (
                                  <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded text-[11px]">
                                    <AlertTriangle className="w-3 h-3" />+
                                    {Number(r.vo_risk_summary.total_delta_vnd).toLocaleString()} đ
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 inline-flex items-center gap-1 text-[11px]">
                                    <CheckCircle2 className="w-3 h-3" /> Chuẩn BOQ
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-neutral-400">
                                {new Date(r.created_at).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 8: GENERATIVE ROUTING */}
            {activeTab === "routing" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-blue-400" />
                        Động Cơ Định Tuyến Tự Động 3D (Generative 3D Routing)
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1">
                        Giải thuật tìm đường $A^*$ 3D kết hợp tối ưu đa mục tiêu (Chi phí, Tổn thất
                        áp, Độ cao thông thủy).
                      </p>
                    </div>
                    <button
                      onClick={handleRunGenerativeRouting}
                      disabled={runningRouting}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition shadow flex items-center gap-1.5"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${runningRouting ? "animate-spin" : ""}`} />
                      {runningRouting ? "Đang Tính Toán..." : "Chạy Thuật Toán Nắn Tuyến 3D"}
                    </button>
                  </div>

                  {routingResult && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                      {routingResult.options.map((opt) => (
                        <div
                          key={opt.optionId}
                          className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-blue-400">
                              {opt.title}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-[11px]">
                              Score {opt.paretoScore}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400">{opt.description}</p>
                          <div className="space-y-1.5 text-xs font-mono pt-2 border-t border-neutral-900">
                            <div className="flex justify-between text-neutral-300">
                              <span>Chiều dài:</span>
                              <span className="font-bold text-neutral-100">
                                {opt.totalLengthM} m
                              </span>
                            </div>
                            <div className="flex justify-between text-neutral-300">
                              <span>Dự toán:</span>
                              <span className="font-bold text-amber-400">
                                {opt.estimatedCostVnd.toLocaleString()} đ
                              </span>
                            </div>
                            <div className="flex justify-between text-neutral-300">
                              <span>Tổn thất áp:</span>
                              <span className="font-bold text-purple-400">
                                {opt.pressureDropPa} Pa
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 9: VARIANCE */}
            {activeTab === "variance" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl space-y-4">
                  <h3 className="font-semibold text-neutral-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Ma Trận Đối Soát 3 Chiều (Contract BOQ vs Shop CAD vs BBNT)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <div className="text-xs text-neutral-400">Khối Lượng Hợp Đồng</div>
                      <div className="text-xl font-bold text-neutral-200 mt-1">20.0 m (DN100)</div>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <div className="text-xs text-neutral-400">Khối Lượng Shop CAD</div>
                      <div className="text-xl font-bold text-amber-400 mt-1">
                        25.5 m (+5.5 m Phát sinh)
                      </div>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <div className="text-xs text-neutral-400">Giá Trị VO Dự Kiến</div>
                      <div className="text-xl font-bold text-red-400 mt-1">+2,475,000 VND</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 10: SMART T&C */}
            {activeTab === "tc" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                    <h3 className="font-semibold text-neutral-200 flex items-center gap-2 text-sm">
                      <Gauge className="w-4 h-4 text-sky-400" />
                      Mô Phỏng Đánh Giá Thử Áp Lực Đường Ống
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-neutral-400 mb-1">Áp đầu (Bar)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={initPressure}
                          onChange={(e) => setInitPressure(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-400 mb-1">Áp cuối (Bar)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={finalPressure}
                          onChange={(e) => setFinalPressure(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-400 mb-1">Thời gian (Phút)</label>
                        <input
                          type="number"
                          value={durationMins}
                          onChange={(e) => setDurationMins(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleEvaluateHydrostatic}
                      disabled={runningTcEval}
                      className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition"
                    >
                      {runningTcEval ? "Đang Phân Tích..." : "Chạy Thuật Toán Đánh Giá Áp Lực"}
                    </button>
                    {tcResult && (
                      <div
                        className={`p-3 rounded-lg border text-xs ${tcResult.isPassed ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-red-950/40 border-red-800 text-red-300"}`}
                      >
                        <div className="font-bold mb-1">
                          {tcResult.isPassed ? "KẾT QUẢ: ĐẠT TIÊU CHUẨN" : "KẾT QUẢ: KHÔNG ĐẠT"}
                        </div>
                        <p>{tcResult.verdictMessage}</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                    <h3 className="font-semibold text-neutral-200 flex items-center gap-2 text-sm">
                      <Layers className="w-4 h-4 text-purple-400" />
                      Gói Ma Trận Thử Nghiệm T&C
                    </h3>
                    <div className="text-xs text-neutral-400">
                      {tcMatrices.length === 0
                        ? "Chưa có gói thử nghiệm nào."
                        : `${tcMatrices.length} gói thử nghiệm đang quản lý.`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
