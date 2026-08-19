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
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type TabMode = "takeoff" | "floorplan" | "routing" | "variance" | "tc" | "twin";

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
              Autonomous & Cognitive MEPF Lifecycle OS (M67)
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-100 tracking-tight">
              Trung Tâm Điều Hành MEPF AI Toàn Vòng Đời
            </h1>
            <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
              Hợp nhất Trí tuệ Nhân tạo từ Thiết kế CAD/BIM $\rightarrow$ Bóc tách Khối lượng 5D
              $\rightarrow$ Reality Tracking Hiện trường $\rightarrow$ Thử nghiệm T&C & As-Built
              Digital Twin.
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
              {runningTakeoff ? "AI Đang Bóc Tách..." : "Chạy AI Takeoff (Bản Vẽ Mẫu)"}
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-neutral-800 gap-2 pb-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("floorplan")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === "floorplan"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            1. Mặt Bằng CAD Số & Live Pinning
          </button>
          <button
            onClick={() => setActiveTab("takeoff")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === "takeoff"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            2. AI Auto-Takeoff & QS
          </button>
          <button
            onClick={() => setActiveTab("routing")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === "routing"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            3. Generative 3D Routing & Auto-Clash
          </button>
          <button
            onClick={() => setActiveTab("variance")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === "variance"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            4. Đối Soát BOQ & Phát Sinh VO
          </button>
          <button
            onClick={() => setActiveTab("tc")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === "tc"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            5. Smart T&C & Thử Áp Lực
          </button>
          <button
            onClick={() => setActiveTab("twin")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === "twin"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            6. As-Built Living Twin
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
                        {/* Lưới Grid */}
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

                        {/* Trục cột kiến trúc */}
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

                        {/* Dầm kết cấu (Obstacles) */}
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

                        {/* Miệng gió Diffuser */}
                        <rect
                          x="200"
                          y="110"
                          width="30"
                          height="44"
                          fill="#38bdf8"
                          stroke="#ffffff"
                          strokeWidth="1"
                        />
                        <rect
                          x="480"
                          y="110"
                          width="30"
                          height="44"
                          fill="#38bdf8"
                          stroke="#ffffff"
                          strokeWidth="1"
                        />

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

                        {/* Máng cáp Điện */}
                        <g
                          onClick={() =>
                            setSelectedEntity({
                              id: "SP-ELE-01",
                              tag: "CABLE-TRAY-300x100",
                              type: "Thang Máng Cáp Điện",
                              discipline: "electrical",
                              spec: "300x100mm Sơn Tĩnh Điện",
                              status: "delivered (40%)",
                              qty: "18.0 m",
                            })
                          }
                          className="cursor-pointer hover:opacity-80 transition"
                        >
                          <line
                            x1="120"
                            y1="280"
                            x2="680"
                            y2="280"
                            stroke="#f59e0b"
                            strokeWidth="5"
                            strokeDasharray="8 4"
                          />
                          <text x="240" y="272" fill="#fde68a" fontSize="11" fontFamily="monospace">
                            TRAY 300x100 (Power Feeder)
                          </text>
                        </g>
                      </svg>
                    </div>

                    <div className="text-[11px] text-neutral-400 italic">
                      * Chạm vào các đối tượng hình học trên bản vẽ để xem thuộc tính bóc tách 5D và
                      cập nhật tiến độ nghiệm thu.
                    </div>
                  </div>

                  {/* Property Inspector Panel */}
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
                    <h3 className="font-semibold text-neutral-200 text-sm flex items-center gap-2 border-b border-neutral-800 pb-3">
                      <Layers className="w-4 h-4 text-blue-400" />
                      Thông Số Kỹ Thuật Đối Tượng Được Chọn
                    </h3>

                    {selectedEntity ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Mã Spool / Định Danh
                          </span>
                          <span className="font-mono font-bold text-blue-400 text-sm">
                            {selectedEntity.id}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Hạng Mục & Hệ Thống
                          </span>
                          <span className="text-neutral-200 font-medium">
                            {selectedEntity.type}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Quy Cách / Tiêu Chuẩn Kỹ Thuật
                          </span>
                          <span className="text-neutral-300 font-mono">{selectedEntity.spec}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Khối Lượng Hình Học (5D QTO)
                          </span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {selectedEntity.qty}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[11px]">
                            Trạng Thái Thi Công Hiện Trường
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 text-neutral-200 font-mono mt-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            {selectedEntity.status}
                          </span>
                        </div>

                        <div className="pt-3 border-t border-neutral-800 flex flex-col gap-2">
                          <button
                            onClick={() =>
                              alert(`Đã cập nhật trạng thái nghiệm thu cho ${selectedEntity.id}`)
                            }
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-xs transition shadow"
                          >
                            Duyệt Nghiệm Thu KCS (Hold-Point Gate)
                          </button>
                          <button
                            onClick={() => setActiveTab("routing")}
                            className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded font-medium text-xs border border-neutral-700 transition"
                          >
                            Nắn Tuyến Tránh Va Chạm (Auto-Reroute)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400 italic py-8 text-center">
                        Vui lòng chọn 1 đối tượng trên bản vẽ.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TAKEOFF */}
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
                            <th className="p-3">Ký Hiệu Phát Hiện</th>
                            <th className="p-3">Mét Dài Ống</th>
                            <th className="p-3">Diện Tích Ống Gió</th>
                            <th className="p-3">Phụ Kiện Suy Diễn</th>
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
                                {r.total_symbols_detected} thiết bị
                              </td>
                              <td className="p-3 font-mono">
                                {Number(r.total_linear_meters).toFixed(1)} m
                              </td>
                              <td className="p-3 font-mono">
                                {Number(r.total_duct_area_m2).toFixed(1)} m²
                              </td>
                              <td className="p-3 font-bold text-purple-400">
                                {r.inferred_fittings_count} phụ kiện
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

            {/* TAB 3: GENERATIVE ROUTING */}
            {activeTab === "routing" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-neutral-100 flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-blue-400" />
                        Động Cơ Định Tuyến Tự Động 3D & Giải Quyết Va Chạm (Generative 3D Routing)
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
                      {runningRouting ? "Đang Tính Toán Pareto..." : "Chạy Thuật Toán Nắn Tuyến 3D"}
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
                              <span>Chiều dài tuyến:</span>
                              <span className="font-bold text-neutral-100">
                                {opt.totalLengthM} m
                              </span>
                            </div>
                            <div className="flex justify-between text-neutral-300">
                              <span>Chi phí dự toán:</span>
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
                            <div className="flex justify-between text-neutral-300">
                              <span>Thông thủy (Clearance):</span>
                              <span className="font-bold text-emerald-400">
                                &gt; {opt.minClearanceHeightM} m
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

            {/* TAB 4: VARIANCE */}
            {activeTab === "variance" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl space-y-4">
                  <h3 className="font-semibold text-neutral-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Ma Trận Đối Soát 3 Chiều (Contract BOQ vs Shopdrawing CAD vs BBNT Nghiệm Thu)
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Thuật toán tự động phát hiện vượt khối lượng thiết kế hoặc phát sinh ngoài hợp
                    đồng trước khi ký hợp đồng phụ và xuất vật tư.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <div className="text-xs text-neutral-400">
                        Khối Lượng Hợp Đồng (Q_Contract)
                      </div>
                      <div className="text-xl font-bold text-neutral-200 mt-1">
                        20.0 m (Ống DN100)
                      </div>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <div className="text-xs text-neutral-400">
                        Khối Lượng Shopdrawing (Q_ShopCAD)
                      </div>
                      <div className="text-xl font-bold text-amber-400 mt-1">
                        25.5 m (+5.5 m Phát sinh)
                      </div>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <div className="text-xs text-neutral-400">Giá Trị Rủi Ro VO Dự Kiến</div>
                      <div className="text-xl font-bold text-red-400 mt-1">+2,475,000 VND</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: SMART T&C */}
            {activeTab === "tc" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Form thử áp lực */}
                  <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                    <h3 className="font-semibold text-neutral-200 flex items-center gap-2 text-sm">
                      <Gauge className="w-4 h-4 text-sky-400" />
                      Mô Phỏng Đánh Giá Thử Áp Lực Đường Ống (Hydrostatic Test)
                    </h3>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-neutral-400 mb-1">Áp suất đầu (Bar)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={initPressure}
                          onChange={(e) => setInitPressure(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-400 mb-1">Áp suất cuối (Bar)</label>
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
                        className={`p-3 rounded-lg border text-xs ${
                          tcResult.isPassed
                            ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                            : "bg-red-950/40 border-red-800 text-red-300"
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1.5 mb-1">
                          {tcResult.isPassed ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                          {tcResult.isPassed ? "KẾT QUẢ: ĐẠT TIÊU CHUẨN" : "KẾT QUẢ: KHÔNG ĐẠT"}
                        </div>
                        <p>{tcResult.verdictMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Danh sách ma trận T&C */}
                  <div className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-xl space-y-4">
                    <h3 className="font-semibold text-neutral-200 flex items-center gap-2 text-sm">
                      <Layers className="w-4 h-4 text-purple-400" />
                      Gói Ma Trận Thử Nghiệm Kỹ Thuật (T&C Packages)
                    </h3>

                    {tcMatrices.length === 0 ? (
                      <div className="text-xs text-neutral-400 italic py-6 text-center">
                        Chưa có gói thử nghiệm nào được khởi tạo.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tcMatrices.map((m) => (
                          <div
                            key={m.id}
                            className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-mono text-blue-400 font-medium">
                                {m.matrix_code}
                              </div>
                              <div className="text-neutral-200">{m.title}</div>
                              <div className="text-neutral-400 text-[11px]">
                                {m.floor_label} • {m.system_code}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                                {m.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: TWIN */}
            {activeTab === "twin" && (
              <div className="space-y-6">
                <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-xl text-center space-y-3">
                  <Activity className="w-10 h-10 text-blue-400 mx-auto" />
                  <h3 className="text-lg font-bold text-neutral-100">
                    Bản Sao Số Hoàn Công (As-Built Living Digital Twin)
                  </h3>
                  <p className="text-xs text-neutral-400 max-w-xl mx-auto">
                    Mô hình 3D hoàn công tự động điều chỉnh tọa độ và kích thước theo các mốc BBNT
                    đã nghiệm thu tại hiện trường, sẵn sàng xuất sang IFC LOD 500 phục vụ quản lý
                    vận hành tòa nhà.
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-950/60 border border-blue-800/50 text-blue-400 text-xs font-mono">
                    <Zap className="w-3.5 h-3.5" />
                    Đồng bộ trạng thái 100% với PostgreSQL RLS & Spatial Kernel
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
