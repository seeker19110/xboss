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
} from "lucide-react";
import {
  BimModel,
  BimElement,
  SimulationTimeStepResult,
  Element4DVisualStatus,
  SYSTEM_DEFAULT_COLORS,
  STATUS_4D_COLORS,
} from "@/lib/engineering-bim-viewer";

export default function BimViewerPage() {
  const [models, setModels] = useState<BimModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<BimModel | null>(null);
  const [elements, setElements] = useState<BimElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedElement, setSelectedElement] = useState<BimElement | null>(null);

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
      // Scale mm về world space
      const wx = (x / 1000) * 45 * zoom;
      const wy = (y / 1000) * 45 * zoom;
      const wz = (z / 1000) * 45 * zoom;

      // Xoay quanh trục Y
      const x1 = wx * Math.cos(radY) - wy * Math.sin(radY);
      const y1 = wx * Math.sin(radY) + wy * Math.cos(radY);
      const z1 = wz;

      // Xoay quanh trục X
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

    // Map trạng thái 4D hiện tại
    const stateMap = new Map<
      string,
      { status: Element4DVisualStatus; colorHex: string; opacity: number; visible: boolean }
    >();
    if (currentStep && viewMode === "4d") {
      for (const elState of currentStep.elements) {
        stateMap.set(elState.elementId, elState);
      }
    }

    // Sắp xếp các thực thể theo độ sâu Depth Sorting
    const renderList = elements
      .filter((el) => {
        if (!activeLayers[el.systemType]) return false;
        if (sectionAxis !== "none") {
          const verts = el.geometryData.vertices || [];
          if (verts.length > 0) {
            const axisIdx = sectionAxis === "x" ? 0 : sectionAxis === "y" ? 1 : 2;
            const avgVal = (verts[axisIdx] ?? 0) * 1000;
            if (avgVal > sectionOffset) return false;
          }
        }
        return true;
      })
      .map((el) => {
        const path = el.geometryData.path || [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 1000 },
        ];
        const midX = (path[0].x + path[path.length - 1].x) / 2;
        const midY = (path[0].y + path[path.length - 1].y) / 2;
        const midZ = (path[0].z + path[path.length - 1].z) / 2;
        const proj = project3D(midX, midY, midZ);
        return { el, depth: proj.depth };
      })
      .sort((a, b) => a.depth - b.depth);

    // Vẽ từng phần tử 3D
    for (const item of renderList) {
      const el = item.el;
      const isSelected = selectedElement?.id === el.id;
      const simState = stateMap.get(el.id);

      let color = SYSTEM_DEFAULT_COLORS[el.systemType] ?? "#38bdf8";
      let alpha = viewMode === "xray" ? 0.35 : 0.9;

      if (viewMode === "4d" && simState) {
        color = simState.colorHex;
        alpha = simState.opacity;
        if (!simState.visible) continue;
      }

      if (isSelected) {
        color = "#f43f5e";
        alpha = 1.0;
      }

      const path = el.geometryData.path || [
        { x: 0, y: 0, z: 2800 },
        { x: 0, y: 0, z: 3800 },
      ];
      const p1 = project3D(path[0].x, path[0].y, path[0].z);
      const p2 = project3D(
        path[path.length - 1].x,
        path[path.length - 1].y,
        path[path.length - 1].z,
      );

      const thickness = Math.max(
        8,
        (el.geometryData.dimensions.diameter
          ? el.geometryData.dimensions.diameter / 12
          : (el.geometryData.dimensions.width ?? 300) / 18) * zoom,
      );

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = thickness;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();

      // Viền nổi hoặc Highlight khi chọn
      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = thickness + 4;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
      }

      // Nhãn phần tử
      if (zoom > 1.3 || isSelected) {
        ctx.fillStyle = "#f8fafc";
        ctx.font = "10px sans-serif";
        ctx.fillText(el.name, (p1.px + p2.px) / 2 + 8, (p1.py + p2.py) / 2 - 6);
      }

      ctx.restore();
    }
  }, [
    rotX,
    rotY,
    zoom,
    elements,
    activeLayers,
    sectionAxis,
    sectionOffset,
    viewMode,
    currentStep,
    selectedElement,
  ]);

  useEffect(() => {
    draw3DScene();
  }, [draw3DScene]);

  // Xử lý kéo xoay Canvas bằng chuột
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;

    setRotY((prev) => prev + dx * 0.5);
    setRotX((prev) => Math.max(-80, Math.min(80, prev - dy * 0.5)));

    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.4, Math.min(3.5, prev - e.deltaY * 0.001)));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader title="3D BIM & 4D Simulation Studio" />
      <EngineeringNav />

      <main className="flex-1 p-4 lg:p-6 max-w-[1600px] mx-auto w-full flex flex-col gap-5">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-100">
                {selectedModel?.name ?? "Mô hình BIM 3D"}
              </h1>
              <p className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <Building2 className="w-3.5 h-3.5" /> Tháp A — TT AVIO
                </span>
                <span>•</span>
                <span>{elements.length} thực thể MEPF</span>
                <span>•</span>
                <span className="uppercase text-[11px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
                  {selectedModel?.format ?? "JSON Mesh"}
                </span>
              </p>
            </div>
          </div>

          {/* Chọn Model & View Modes */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => setViewMode("4d")}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  viewMode === "4d"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Mô phỏng 4D
              </button>
              <button
                onClick={() => setViewMode("standard")}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  viewMode === "standard"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Hệ thống MEPF
              </button>
              <button
                onClick={() => setViewMode("xray")}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  viewMode === "xray"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                X-Ray trong suốt
              </button>
            </div>

            <button
              onClick={() => {
                setRotX(25);
                setRotY(-40);
                setZoom(1.2);
              }}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Khôi phục góc nhìn mặc định"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Khung Workspace chính */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[600px]">
          {/* Cột trái: Cây Layer Hệ Thống & Mặt Cắt Section (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* Box Layer Hệ */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" /> Layer Hệ Thống MEPF
              </h3>
              <div className="flex flex-col gap-2">
                {Object.entries(activeLayers).map(([sysKey, active]) => {
                  const color = SYSTEM_DEFAULT_COLORS[sysKey] ?? "#38bdf8";
                  return (
                    <label
                      key={sysKey}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer text-xs transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium text-zinc-200">{sysKey}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) =>
                          setActiveLayers((prev) => ({ ...prev, [sysKey]: e.target.checked }))
                        }
                        className="rounded border-zinc-700 text-sky-500 focus:ring-0"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Box Mặt Cắt 3D Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-amber-400" /> Mặt Cắt 3D (Section Box)
              </h3>
              <div className="grid grid-cols-4 gap-1.5 text-xs">
                {(["none", "x", "y", "z"] as const).map((axis) => (
                  <button
                    key={axis}
                    onClick={() => setSectionAxis(axis)}
                    className={`py-1.5 rounded-lg font-medium uppercase transition ${
                      sectionAxis === axis
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    {axis}
                  </button>
                ))}
              </div>
              {sectionAxis !== "none" && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Mặt phẳng cắt {sectionAxis.toUpperCase()}:</span>
                    <span className="font-mono text-zinc-200">{sectionOffset} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={6000}
                    step={100}
                    value={sectionOffset}
                    onChange={(e) => setSectionOffset(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              )}
            </div>

            {/* Danh mục Thực thể 3D */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-1 flex flex-col gap-2 max-h-[300px] overflow-hidden">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Danh mục Cấu kiện</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  {elements.length} items
                </span>
              </h3>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                {elements.map((el) => {
                  const isSel = selectedElement?.id === el.id;
                  return (
                    <button
                      key={el.id}
                      onClick={() => setSelectedElement(el)}
                      className={`text-left p-2 rounded-lg text-xs transition flex items-center justify-between ${
                        isSel
                          ? "bg-sky-950/80 border border-sky-500/50 text-sky-200"
                          : "bg-zinc-950/50 border border-zinc-800/60 hover:border-zinc-700 text-zinc-300"
                      }`}
                    >
                      <div className="truncate font-medium">{el.name}</div>
                      <span className="text-[10px] font-mono text-zinc-500 ml-2 uppercase">
                        {el.elementType.split("_")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cột giữa: Viewport Canvas 3D & 4D Player (6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="relative flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden min-h-[480px] flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={800}
                height={550}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                className="w-full h-full cursor-grab active:cursor-grabbing"
              />

              {/* Overlay Chú giải Màu 4D */}
              {viewMode === "4d" && (
                <div className="absolute top-3 left-3 bg-zinc-950/85 backdrop-blur-md border border-zinc-800 rounded-lg p-2.5 text-[11px] flex flex-col gap-1.5 shadow-xl">
                  <div className="font-semibold text-zinc-300 text-xs mb-0.5">
                    Trạng thái 4D WBS
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.not_started }}
                    />
                    <span className="text-zinc-400">Chưa bắt đầu (Ghost)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.in_progress }}
                    />
                    <span className="text-amber-300">Đang thi công</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.completed }}
                    />
                    <span className="text-emerald-300">Hoàn thành</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.approved }}
                    />
                    <span className="text-cyan-300">Đã nghiệm thu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_4D_COLORS.delayed }}
                    />
                    <span className="text-rose-400 font-semibold">Trễ hạn</span>
                  </div>
                </div>
              )}

              {/* Hướng dẫn tương tác */}
              <div className="absolute bottom-3 right-3 text-[11px] text-zinc-400 bg-zinc-950/80 px-2.5 py-1 rounded-md border border-zinc-800">
                Kéo chuột để xoay 3D • Cuộn chuột để Zoom
              </div>
            </div>

            {/* Thanh điều khiển 4D Time-Lapse Player */}
            {viewMode === "4d" && simSeries.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition shadow-sm"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentStepIdx(0);
                      }}
                      className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                      title="Về ngày đầu"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <div className="text-xs ml-2">
                      <div className="text-zinc-400">Mốc thời gian mô phỏng:</div>
                      <div className="text-sm font-semibold text-sky-400 font-mono">
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

                    <select
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300"
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
                  className="w-full accent-sky-500 cursor-pointer"
                />

                {/* Thống kê 5 trạng thái 4D */}
                {currentStep && (
                  <div className="grid grid-cols-5 gap-2 text-center text-[11px] pt-1 border-t border-zinc-800/80">
                    <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                      <span className="text-zinc-400 block">Chưa làm</span>
                      <span className="font-semibold text-zinc-300">
                        {currentStep.countsByStatus.not_started}
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                      <span className="text-amber-400 block">Đang làm</span>
                      <span className="font-semibold text-amber-300">
                        {currentStep.countsByStatus.in_progress}
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                      <span className="text-emerald-400 block">Đã xong</span>
                      <span className="font-semibold text-emerald-300">
                        {currentStep.countsByStatus.completed}
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                      <span className="text-cyan-400 block">Nghiệm thu</span>
                      <span className="font-semibold text-cyan-300">
                        {currentStep.countsByStatus.approved}
                      </span>
                    </div>
                    <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                      <span className="text-rose-400 block">Trễ hạn</span>
                      <span className="font-semibold text-rose-400">
                        {currentStep.countsByStatus.delayed}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cột phải: Inspector Thuộc tính Pset & Chấm Mốc 3D (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 flex-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Info className="w-4 h-4 text-sky-400" /> Thuộc Tính Kỹ Thuật (Pset)
              </h3>

              {selectedElement ? (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                    <div className="text-[11px] text-zinc-400">Tên Cấu kiện:</div>
                    <div className="font-semibold text-zinc-100 text-sm mt-0.5">
                      {selectedElement.name}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1">
                      {selectedElement.guid}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between py-1 border-b border-zinc-800">
                      <span className="text-zinc-400">Hệ thống:</span>
                      <span className="font-medium text-sky-400">{selectedElement.systemType}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800">
                      <span className="text-zinc-400">Loại phần tử:</span>
                      <span className="font-mono text-zinc-200">{selectedElement.elementType}</span>
                    </div>
                    {selectedElement.properties.pset?.airflow !== undefined && (
                      <div className="flex justify-between py-1 border-b border-zinc-800">
                        <span className="text-zinc-400">Lưu lượng khí:</span>
                        <span className="font-semibold text-emerald-400">
                          {selectedElement.properties.pset.airflow} m³/h
                        </span>
                      </div>
                    )}
                    {selectedElement.properties.pset?.pressureDrop !== undefined && (
                      <div className="flex justify-between py-1 border-b border-zinc-800">
                        <span className="text-zinc-400">Tổn thất áp suất:</span>
                        <span className="font-semibold text-amber-400">
                          {selectedElement.properties.pset.pressureDrop} Pa
                        </span>
                      </div>
                    )}
                    {selectedElement.properties.pset?.material && (
                      <div className="flex justify-between py-1 border-b border-zinc-800">
                        <span className="text-zinc-400">Vật liệu:</span>
                        <span className="text-zinc-200">
                          {selectedElement.properties.pset.material}
                        </span>
                      </div>
                    )}
                    {selectedElement.properties.pset?.elevation !== undefined && (
                      <div className="flex justify-between py-1 border-b border-zinc-800">
                        <span className="text-zinc-400">Cao độ FFL:</span>
                        <span className="text-zinc-200 font-mono">
                          +{selectedElement.properties.pset.elevation} mm
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Hành động Nghiệp vụ gắn với thực thể 3D */}
                  <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-zinc-800">
                    <a
                      href={`/approvals?elementGuid=${selectedElement.guid}`}
                      className="w-full py-2 px-3 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-center font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <FileCheck className="w-3.5 h-3.5" /> Tạo Phiếu Nghiệm Thu (BBNT)
                    </a>
                    <a
                      href={`/quality?guid=${selectedElement.guid}&name=${encodeURIComponent(selectedElement.name)}`}
                      className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-center font-medium text-xs flex items-center justify-center gap-2 transition border border-zinc-700"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Báo Sự Cố NCR 3D
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                  <Box className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs">
                    Bấm chọn một cấu kiện trên khung nhìn 3D hoặc danh sách để xem thông số chi
                    tiết.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
