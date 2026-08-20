"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  Box,
  Sliders,
  Eye,
  EyeOff,
  Filter,
  Info,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Maximize2,
  Scissors,
  FileCheck,
  Building2,
  Save,
  MessageSquare,
} from "lucide-react";

export type Element4DVisualStatus =
  "not_started" | "in_progress" | "completed" | "approved" | "delayed";

export interface MeshGeometry3D {
  vertices: number[];
  indices: number[];
  normals?: number[];
  color?: string;
  dimensions: {
    width?: number;
    height?: number;
    length?: number;
    diameter?: number;
  };
}

export interface BimElementProperties {
  pset?: {
    airflow?: number;
    velocity?: number;
    pressureDrop?: number;
    material?: string;
    insulation?: string;
    elevation?: number;
    supplier?: string;
    specification?: string;
  };
  customFields?: Record<string, unknown>;
}

export interface BimElement {
  id: string;
  modelId: string;
  projectId: number;
  guid: string;
  elementType: string;
  systemType: string;
  name: string;
  geometryData: MeshGeometry3D;
  properties: BimElementProperties;
  wbsTaskId?: number | null;
  createdAt?: string;
}

export interface BimModel {
  id: string;
  projectId: number;
  name: string;
  discipline: "hvac" | "plumbing" | "electrical" | "firefighting" | "structure" | "combined";
  floorId?: number | null;
  format: "ifc" | "gltf" | "json_mesh";
  fileUrl?: string | null;
  fileHash?: string | null;
  elementCount: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  metadata: Record<string, unknown>;
  createdBy?: number | null;
  createdAt?: string;
}

export interface Element4DState {
  elementId: string;
  guid: string;
  wbsTaskId?: number | null;
  status: Element4DVisualStatus;
  progressPercent: number;
  colorHex: string;
  opacity: number;
  visible: boolean;
  highlightAlert?: boolean;
}

export interface SimulationTimeStepResult {
  targetDate: string;
  totalElements: number;
  countsByStatus: Record<Element4DVisualStatus, number>;
  overallProgressPercent: number;
  elements: Element4DState[];
}

export const SYSTEM_DEFAULT_COLORS: Record<string, string> = {
  HVAC_SUPPLY: "#0284c7",
  HVAC_RETURN: "#f59e0b",
  PLUMBING_WATER: "#06b6d4",
  PLUMBING_DRAINAGE: "#84cc16",
  ELECTRICAL_POWER: "#eab308",
  FIRE_SPRINKLER: "#ef4444",
  STRUCTURE: "#64748b",
};

export const STATUS_4D_COLORS: Record<Element4DVisualStatus, string> = {
  not_started: "#3f3f46",
  in_progress: "#38bdf8",
  completed: "#34d399",
  approved: "#10b981",
  delayed: "#f43f5e",
};

interface BcfIssueSummary {
  id: string;
  bcf_code: string;
  title: string;
  discipline: string;
  issue_type: string;
  severity: string;
  status: string;
  clash_element_a_guid?: string;
  created_at: string;
}

export default function BimViewerPage() {
  const [models, setModels] = useState<BimModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<BimModel | null>(null);
  const [elements, setElements] = useState<BimElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedElement, setSelectedElement] = useState<BimElement | null>(null);

  // Inspector Sidebar Tab
  const [sidebarTab, setSidebarTab] = useState<"pset" | "bcf">("pset");
  const [bcfIssues, setBcfIssues] = useState<BcfIssueSummary[]>([]);
  const [savingSim, setSavingSim] = useState(false);
  const [simSavedToast, setSimSavedToast] = useState<string | null>(null);

  // 3D Canvas Viewport Controls
  const [viewMode, setViewMode] = useState<"standard" | "xray" | "4d">("4d");
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    HVAC_SUPPLY: true,
    HVAC_RETURN: true,
    PLUMBING_WATER: true,
    PLUMBING_DRAINAGE: true,
    ELECTRICAL_POWER: true,
    FIRE_SPRINKLER: true,
  });

  // Section Cut
  const [sectionAxis, setSectionAxis] = useState<"none" | "x" | "y" | "z">("none");
  const [sectionOffset, setSectionOffset] = useState<number>(3000);

  // 4D Time-lapse Simulation
  const [simSeries, setSimSeries] = useState<SimulationTimeStepResult[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Canvas 3D Rotation angles (degrees)
  const [rotX, setRotX] = useState<number>(25);
  const [rotY, setRotY] = useState<number>(-40);
  const [zoom, setZoom] = useState<number>(1.2);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Nạp danh sách models
  useEffect(() => {
    async function loadModels() {
      try {
        setLoading(true);
        const res = await fetch("/api/engineering/bim-models");
        if (res.ok) {
          const data = await res.json();
          setModels(data.models || []);
          if (data.models && data.models.length > 0) {
            setSelectedModel(data.models[0]);
          }
        }
      } catch (e) {
        console.error("Lỗi nạp mô hình BIM:", e);
      } finally {
        setLoading(false);
      }
    }
    loadModels();
  }, []);

  // Nạp BCF issues
  const loadBcfIssues = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/bim-routing?type=bcf");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setBcfIssues(data);
        } else {
          // Fallback sample BCF issues
          setBcfIssues([
            {
              id: "bcf-01",
              bcf_code: "BCF-2026-001",
              title: "Xung đột ống cấp nước DN50 xuyên dầm Zone B",
              discipline: "PLUMBING",
              issue_type: "clash",
              severity: "critical",
              status: "open",
              created_at: new Date().toISOString(),
            },
            {
              id: "bcf-02",
              bcf_code: "BCF-2026-002",
              title: "Khoảng hở ty treo ống gió < 50mm với máng cáp",
              discipline: "HVAC",
              issue_type: "observation",
              severity: "medium",
              status: "in_review",
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (e) {
      console.error("Lỗi nạp BCF issues:", e);
    }
  }, []);

  useEffect(() => {
    loadBcfIssues();
  }, [loadBcfIssues]);

  // Nạp phần tử và chạy simulation khi chọn model
  useEffect(() => {
    if (!selectedModel) return;

    async function loadModelData() {
      try {
        const [elRes, simRes] = await Promise.all([
          fetch(`/api/engineering/bim-models/${selectedModel?.id}/elements`),
          fetch(`/api/engineering/bim-models/${selectedModel?.id}/simulate-4d`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startDate: "2026-08-01",
              endDate: "2026-09-15",
              stepDays: 3,
            }),
          }),
        ]);

        if (elRes.ok) {
          const elData = await elRes.json();
          setElements(elData.elements || []);
        }

        if (simRes.ok) {
          const simData = await simRes.json();
          setSimSeries(simData.series || []);
          setCurrentStepIdx(0);
        }
      } catch (e) {
        console.error("Lỗi nạp dữ liệu chi tiết model:", e);
      }
    }

    loadModelData();
  }, [selectedModel]);

  // Vòng lặp phát 4D Time-Lapse
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && simSeries.length > 0) {
      timer = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= simSeries.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, simSeries.length, playbackSpeed]);

  const currentStep = simSeries[currentStepIdx] ?? null;

  // Lưu simulation 4D vào CSDL
  const handleSaveSimulation = async () => {
    if (!selectedModel) return;
    setSavingSim(true);
    try {
      const res = await fetch(`/api/engineering/bim-models/${selectedModel.id}/simulate-4d`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-08-01",
          endDate: "2026-09-15",
          stepDays: 3,
          persist: true,
        }),
      });

      if (res.ok) {
        setSimSavedToast("Đã lưu kịch bản mô phỏng 4D vào cơ sở dữ liệu!");
        setTimeout(() => setSimSavedToast(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSim(false);
    }
  };

  // Render 3D Canvas
  const draw3DScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Lưới nền 3D Ground Grid
    const cx = width / 2;
    const cy = height / 2 + 50;

    const radX = (rotX * Math.PI) / 180;
    const radY = (rotY * Math.PI) / 180;

    const project3D = (x: number, y: number, z: number) => {
      const wx = (x / 1000) * 45 * zoom;
      const wy = (y / 1000) * 45 * zoom;
      const wz = (z / 1000) * 45 * zoom;

      const x1 = wx * Math.cos(radY) - wy * Math.sin(radY);
      const y1 = wx * Math.sin(radY) + wy * Math.cos(radY);
      const z1 = wz;

      const y2 = y1 * Math.cos(radX) - z1 * Math.sin(radX);
      const z2 = y1 * Math.sin(radX) + z1 * Math.cos(radX);
      const x2 = x1;

      return {
        px: cx + x2,
        py: cy - y2,
        depth: z2,
      };
    };

    // Vẽ lưới sàn Grid
    ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
    ctx.lineWidth = 1;
    for (let gx = -6000; gx <= 6000; gx += 2000) {
      const p1 = project3D(gx, -4000, 0);
      const p2 = project3D(gx, 4000, 0);
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    }
    for (let gy = -4000; gy <= 4000; gy += 2000) {
      const p1 = project3D(-6000, gy, 0);
      const p2 = project3D(6000, gy, 0);
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    }

    // Vẽ từng cấu kiện BIM
    const stepMap = new Map<string, (typeof currentStep)["elements"][0]>();
    if (currentStep && currentStep.elements) {
      for (const st of currentStep.elements) {
        stepMap.set(st.elementId, st);
      }
    }

    for (const elem of elements) {
      if (activeLayers[elem.systemType] === false) continue;

      let color = SYSTEM_DEFAULT_COLORS[elem.systemType] || "#94a3b8";
      let opacity = 0.85;

      if (viewMode === "4d") {
        const state = stepMap.get(elem.id);
        if (state) {
          color = state.colorHex;
          opacity = state.opacity;
        } else {
          color = STATUS_4D_COLORS.not_started;
          opacity = 0.15;
        }
      } else if (viewMode === "xray") {
        opacity = 0.35;
      }

      if (selectedElement?.id === elem.id) {
        color = "#facc15";
        opacity = 1.0;
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;

      const verts = elem.geometryData?.vertices || [];
      const indices = elem.geometryData?.indices || [];

      if (verts.length >= 24 && indices.length >= 6) {
        const projVerts: Array<{ px: number; py: number; depth: number }> = [];
        for (let i = 0; i < verts.length; i += 3) {
          projVerts.push(project3D(verts[i] * 1000, verts[i + 1] * 1000, verts[i + 2] * 1000));
        }

        for (let i = 0; i < indices.length; i += 3) {
          const i1 = indices[i];
          const i2 = indices[i + 1];
          const i3 = indices[i + 2];

          if (projVerts[i1] && projVerts[i2] && projVerts[i3]) {
            ctx.beginPath();
            ctx.moveTo(projVerts[i1].px, projVerts[i1].py);
            ctx.lineTo(projVerts[i2].px, projVerts[i2].py);
            ctx.lineTo(projVerts[i3].px, projVerts[i3].py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }, [rotX, rotY, zoom, elements, activeLayers, viewMode, currentStep, selectedElement]);

  useEffect(() => {
    draw3DScene();
  }, [draw3DScene]);

  // Xử lý sự kiện kéo xoay chuột trên Canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setRotY((prev) => prev + dx * 0.5);
    setRotX((prev) => Math.max(-80, Math.min(80, prev - dy * 0.5)));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.4, Math.min(3.0, prev - e.deltaY * 0.0015)));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Building2 className="text-sky-400" size={28} />
              3D BIM/IFC Web Viewer & 4D Simulation Studio (M80 / M89)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Trình xem mô hình không gian WebGL 3D, mô phỏng tiến độ thi công 4D liên kết WBS Gantt
              và quản lý vấn đề BCF openBIM
            </p>
          </div>

          {/* Model Selector & View Mode Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            {models.length > 0 && (
              <select
                value={selectedModel?.id || ""}
                onChange={(e) => {
                  const m = models.find((x) => x.id === e.target.value);
                  if (m) setSelectedModel(m);
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.elementCount} elements)
                  </option>
                ))}
              </select>
            )}

            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-xs">
              <button
                onClick={() => setViewMode("standard")}
                className={`rounded px-2.5 py-1 font-semibold ${
                  viewMode === "standard" ? "bg-sky-600 text-white" : "text-zinc-400"
                }`}
              >
                Màu Hệ Thống
              </button>
              <button
                onClick={() => setViewMode("xray")}
                className={`rounded px-2.5 py-1 font-semibold ${
                  viewMode === "xray" ? "bg-sky-600 text-white" : "text-zinc-400"
                }`}
              >
                X-Ray Kỹ Thuật
              </button>
              <button
                onClick={() => setViewMode("4d")}
                className={`flex items-center gap-1 rounded px-2.5 py-1 font-semibold ${
                  viewMode === "4d" ? "bg-emerald-600 text-white" : "text-zinc-400"
                }`}
              >
                <Sparkles size={12} />
                Mô phỏng 4D WBS
              </button>
            </div>
          </div>
        </div>

        {/* Toast thông báo lưu simulation */}
        {simSavedToast && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/60 p-3 text-xs text-emerald-300">
            <CheckCircle2 size={16} />
            {simSavedToast}
          </div>
        )}

        {/* Main 3-Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Cột trái: Cây Thư Mục Layer & Danh sách Phần tử (3 cols) */}
          <div className="flex flex-col gap-4 lg:col-span-3">
            {/* Bộ lọc Layer Hệ thống */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Layers className="h-4 w-4 text-sky-400" /> Layer Hệ Thống MEPF
              </h3>

              <div className="mt-3 space-y-2 text-xs">
                {Object.entries(activeLayers).map(([sys, active]) => (
                  <div
                    key={sys}
                    className="flex cursor-pointer items-center justify-between rounded-lg bg-zinc-950/60 p-2 transition hover:bg-zinc-950"
                    onClick={() => setActiveLayers((prev) => ({ ...prev, [sys]: !prev[sys] }))}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: SYSTEM_DEFAULT_COLORS[sys] || "#94a3b8",
                        }}
                      />
                      <span
                        className={
                          active ? "font-medium text-zinc-200" : "text-zinc-500 line-through"
                        }
                      >
                        {sys.replace("_", " ")}
                      </span>
                    </div>
                    {active ? (
                      <Eye className="h-3.5 w-3.5 text-zinc-400" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-zinc-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Danh sách Phần tử BIM */}
            <div className="flex max-h-[360px] flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Box className="h-4 w-4 text-sky-400" /> Cấu Kiện ({elements.length})
              </h3>

              <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1 text-xs">
                {elements.map((el) => (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElement(el)}
                    className={`cursor-pointer rounded-lg p-2 transition ${
                      selectedElement?.id === el.id
                        ? "border border-amber-500/50 bg-amber-950/40 text-amber-200"
                        : "border border-transparent bg-zinc-950/40 text-zinc-300 hover:bg-zinc-950"
                    }`}
                  >
                    <div className="truncate font-medium">{el.name}</div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-500">
                      <span>{el.systemType}</span>
                      <span className="font-mono">{el.elementType}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cột giữa: Khung nhìn 3D Canvas & Điều khiển 4D Time-Lapse (6 cols) */}
          <div className="flex flex-col gap-4 lg:col-span-6">
            {/* Viewport 3D Canvas */}
            <div className="relative h-[550px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
              <canvas
                ref={canvasRef}
                width={800}
                height={550}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                className="h-full w-full cursor-grab active:cursor-grabbing"
              />

              {/* Overlay Chú giải Màu 4D */}
              {viewMode === "4d" && (
                <div className="absolute left-3 top-3 flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/85 p-2.5 text-[11px] shadow-xl backdrop-blur-md">
                  <div className="mb-0.5 text-xs font-semibold text-zinc-300">
                    Trạng thái 4D WBS
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.not_started }}
                    />
                    <span className="text-zinc-400">Chưa bắt đầu (Ghost)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.in_progress }}
                    />
                    <span className="text-amber-300">Đang thi công</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.completed }}
                    />
                    <span className="text-emerald-300">Hoàn thành</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.approved }}
                    />
                    <span className="text-cyan-300">Đã nghiệm thu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.delayed }}
                    />
                    <span className="font-semibold text-rose-400">Trễ hạn</span>
                  </div>
                </div>
              )}

              {/* Hướng dẫn tương tác */}
              <div className="absolute bottom-3 right-3 rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 text-[11px] text-zinc-400">
                Kéo chuột để xoay 3D • Cuộn chuột để Zoom
              </div>
            </div>

            {/* Thanh điều khiển 4D Time-Lapse Player */}
            {viewMode === "4d" && simSeries.length > 0 && (
              <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="rounded-lg bg-sky-600 p-2 font-medium text-white shadow-sm transition hover:bg-sky-500"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentStepIdx(0);
                      }}
                      className="rounded-lg bg-zinc-800 p-2 text-zinc-300 transition hover:bg-zinc-700"
                      title="Về ngày đầu"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>

                    <div className="ml-2 text-xs">
                      <div className="text-zinc-400">Mốc thời gian mô phỏng:</div>
                      <div className="font-mono text-sm font-semibold text-sky-400">
                        {currentStep?.targetDate ?? "2026-08-01"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      <div className="text-zinc-400">Tiến độ tổng thể 4D:</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {currentStep?.overallProgressPercent ?? 0}%
                      </div>
                    </div>

                    <button
                      onClick={handleSaveSimulation}
                      disabled={savingSim}
                      className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                      title="Lưu kịch bản vào CSDL"
                    >
                      <Save size={12} />
                      {savingSim ? "Đang lưu..." : "Lưu 4D"}
                    </button>

                    <select
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
                    >
                      <option value={1}>1x Tốc độ</option>
                      <option value={2}>2x Tốc độ</option>
                      <option value={5}>5x Tốc độ</option>
                    </select>
                  </div>
                </div>

                {/* Slider dòng thời gian */}
                <input
                  type="range"
                  min={0}
                  max={simSeries.length - 1}
                  value={currentStepIdx}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentStepIdx(Number(e.target.value));
                  }}
                  className="w-full cursor-pointer accent-sky-500"
                />

                {/* Thống kê 5 trạng thái 4D */}
                {currentStep && (
                  <div className="grid grid-cols-5 gap-2 border-t border-zinc-800/80 pt-1 text-center text-[11px]">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
                      <span className="block text-zinc-400">Chưa làm</span>
                      <span className="font-semibold text-zinc-300">
                        {currentStep.countsByStatus.not_started}
                      </span>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
                      <span className="block text-amber-400">Đang làm</span>
                      <span className="font-semibold text-amber-300">
                        {currentStep.countsByStatus.in_progress}
                      </span>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
                      <span className="block text-emerald-400">Đã xong</span>
                      <span className="font-semibold text-emerald-300">
                        {currentStep.countsByStatus.completed}
                      </span>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
                      <span className="block text-cyan-400">Nghiệm thu</span>
                      <span className="font-semibold text-cyan-300">
                        {currentStep.countsByStatus.approved}
                      </span>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
                      <span className="block text-rose-400">Trễ hạn</span>
                      <span className="font-semibold text-rose-400">
                        {currentStep.countsByStatus.delayed}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cột phải: Inspector Thuộc tính Pset & BCF Issues openBIM (3 cols) */}
          <div className="flex flex-col gap-4 lg:col-span-3">
            <div className="flex flex-1 flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              {/* Sidebar Tabs */}
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                <button
                  onClick={() => setSidebarTab("pset")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1 text-xs font-semibold ${
                    sidebarTab === "pset"
                      ? "bg-sky-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Info size={12} />
                  Thuộc tính (Pset)
                </button>
                <button
                  onClick={() => setSidebarTab("bcf")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1 text-xs font-semibold ${
                    sidebarTab === "bcf"
                      ? "bg-sky-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <MessageSquare size={12} />
                  BCF Issues ({bcfIssues.length})
                </button>
              </div>

              {sidebarTab === "pset" && (
                <>
                  {selectedElement ? (
                    <div className="flex flex-col gap-3 text-xs">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="text-[11px] text-zinc-400">Tên Cấu kiện:</div>
                        <div className="mt-0.5 text-sm font-semibold text-zinc-100">
                          {selectedElement.name}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-zinc-500">
                          {selectedElement.guid}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between border-b border-zinc-800 py-1">
                          <span className="text-zinc-400">Hệ thống:</span>
                          <span className="font-medium text-sky-400">
                            {selectedElement.systemType}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 py-1">
                          <span className="text-zinc-400">Loại phần tử:</span>
                          <span className="font-mono text-zinc-200">
                            {selectedElement.elementType}
                          </span>
                        </div>
                        {selectedElement.properties.pset?.airflow !== undefined && (
                          <div className="flex justify-between border-b border-zinc-800 py-1">
                            <span className="text-zinc-400">Lưu lượng khí:</span>
                            <span className="font-semibold text-emerald-400">
                              {selectedElement.properties.pset.airflow} m³/h
                            </span>
                          </div>
                        )}
                        {selectedElement.properties.pset?.pressureDrop !== undefined && (
                          <div className="flex justify-between border-b border-zinc-800 py-1">
                            <span className="text-zinc-400">Tổn thất áp suất:</span>
                            <span className="font-semibold text-amber-400">
                              {selectedElement.properties.pset.pressureDrop} Pa
                            </span>
                          </div>
                        )}
                        {selectedElement.properties.pset?.material && (
                          <div className="flex justify-between border-b border-zinc-800 py-1">
                            <span className="text-zinc-400">Vật liệu:</span>
                            <span className="text-zinc-200">
                              {selectedElement.properties.pset.material}
                            </span>
                          </div>
                        )}
                        {selectedElement.properties.pset?.elevation !== undefined && (
                          <div className="flex justify-between border-b border-zinc-800 py-1">
                            <span className="text-zinc-400">Cao độ FFL:</span>
                            <span className="font-mono text-zinc-200">
                              +{selectedElement.properties.pset.elevation} mm
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Hành động Nghiệp vụ gắn với thực thể 3D */}
                      <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-3">
                        <a
                          href={`/approvals?elementGuid=${selectedElement.guid}`}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-sky-600"
                        >
                          <FileCheck className="h-3.5 w-3.5" /> Tạo Phiếu Nghiệm Thu (BBNT)
                        </a>
                        <a
                          href={`/quality?guid=${selectedElement.guid}&name=${encodeURIComponent(selectedElement.name)}`}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Báo Sự Cố NCR 3D
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-zinc-500">
                      <Box className="mb-2 h-8 w-8 opacity-40" />
                      <p className="text-xs">
                        Bấm chọn một cấu kiện trên khung nhìn 3D hoặc danh sách để xem thông số chi
                        tiết.
                      </p>
                    </div>
                  )}
                </>
              )}

              {sidebarTab === "bcf" && (
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1 text-xs">
                  {bcfIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 transition hover:border-zinc-700"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-sky-400">
                          {issue.bcf_code}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            issue.severity === "critical"
                              ? "bg-red-950 text-red-400 border border-red-800"
                              : "bg-amber-950 text-amber-300 border border-amber-800"
                          }`}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-zinc-200">{issue.title}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>{issue.discipline}</span>
                        <span className="font-semibold text-emerald-400">
                          {issue.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
