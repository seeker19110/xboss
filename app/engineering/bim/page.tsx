"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Boxes,
  Layers,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Search,
  Zap,
  Activity,
  Box,
  Compass,
  ArrowRight,
  Split,
  Maximize2,
  DollarSign,
  Clock,
  ShieldAlert,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

export type BimDiscipline =
  "architecture" | "structure" | "hvac" | "plumbing" | "electrical" | "firefighting" | "combined";

export interface BoundingBox3D {
  min: [number, number, number];
  max: [number, number, number];
}

export interface BimElementRecord {
  id: string;
  project_id: number;
  ifc_guid: string;
  element_type: string;
  discipline: BimDiscipline;
  system_name: string | null;
  storey_level: string | null;
  zone_name: string | null;
  properties: Record<string, unknown>;
  spatial_bounding_box: BoundingBox3D;
  task_id: number | null;
  boq_code: string | null;
  actual_status: string;
  created_at: string;
  task_name?: string;
  task_progress?: number;
  task_status?: string;
}

export interface ClashRerouteOption {
  optionIndex: number;
  title: string;
  strategy: string;
  description: string;
  estimatedCostVnd: number;
  scheduleImpactDays: number;
  pressureDropPa: number;
  tradeOffScore: number;
  actionDetails: string[];
}

export interface ClashRerouteSolution {
  clashCode: string;
  primaryElementGuid: string;
  conflictingElementGuid: string;
  options: ClashRerouteOption[];
  recommendedIndex: number;
  synthesisReason: string;
}

export interface SpatialClashRecord {
  id: string;
  project_id: number;
  clash_code: string;
  element_a_id: string;
  element_b_id: string;
  clash_type: string;
  severity: string;
  intersection_point: { x: number; y: number; z: number };
  clearance_distance_mm: number;
  status: string;
  prescriptive_solution: ClashRerouteSolution | null;
  resolved_by: number | null;
  created_at: string;
  element_a_type?: string;
  element_a_guid?: string;
  element_b_type?: string;
  element_b_guid?: string;
  element_a_system?: string;
  element_b_system?: string;
}

function get4DStatusColor(
  taskStatus?: string,
  progress = 0,
  hasClash = false,
): { colorHex: string; statusLabel: string } {
  if (hasClash) {
    return { colorHex: "#ef4444", statusLabel: "Xung đột không gian (Clash)" };
  }
  if (taskStatus === "nghiem_thu" || progress >= 1) {
    return { colorHex: "#10b981", statusLabel: "Đã nghiệm thu (100%)" };
  }
  if (taskStatus === "tre") {
    return { colorHex: "#f97316", statusLabel: "Chậm tiến độ (Delayed)" };
  }
  if (taskStatus === "dang_thi_cong" || progress > 0) {
    return { colorHex: "#3b82f6", statusLabel: "Đang thi công" };
  }
  return { colorHex: "#64748b", statusLabel: "Chưa thi công (Pending)" };
}

function computeElementQto(element: {
  elementType?: string;
  element_type?: string;
  spatial_bounding_box: BoundingBox3D;
}): { quantity: number; unit: string } {
  const box = element.spatial_bounding_box;
  const dx = (box.max[0] - box.min[0]) / 1000;
  const dy = (box.max[1] - box.min[1]) / 1000;
  const dz = (box.max[2] - box.min[2]) / 1000;
  const type = (element.elementType || element.element_type || "").toLowerCase();

  if (type.includes("duct")) {
    const length = Math.max(dx, dy, dz);
    const perimeter = (Math.min(dx, dy) + Math.max(Math.min(dx, dz), Math.min(dy, dz))) * 2;
    const area = length * Math.max(0.5, perimeter);
    return { quantity: Math.round(area * 100) / 100, unit: "m2" };
  }
  if (type.includes("pipe") || type.includes("tray") || type.includes("conduit")) {
    const length = Math.max(dx, dy, dz);
    return { quantity: Math.round(length * 100) / 100, unit: "m" };
  }
  if (type.includes("beam") || type.includes("slab") || type.includes("column")) {
    const volume = dx * dy * dz;
    return { quantity: Math.round(volume * 100) / 100, unit: "m3" };
  }
  return { quantity: 1, unit: "bộ" };
}

export default function BimCadEngineeringPage() {
  const [elements, setElements] = useState<BimElementRecord[]>([]);
  const [clashes, setClashes] = useState<SpatialClashRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("all");
  const [selectedStorey, setSelectedStorey] = useState<string>("all");
  const [selectedElement, setSelectedElement] = useState<BimElementRecord | null>(null);
  const [selectedClash, setSelectedClash] = useState<SpatialClashRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"viewer3d" | "clashes" | "qto5d">("viewer3d");
  const [viewMode, setViewMode] = useState<"4d_status" | "discipline">("4d_status");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resEl, resClash] = await Promise.all([
        fetch("/api/engineering/bim/elements"),
        fetch("/api/engineering/bim/clashes"),
      ]);

      if (resEl.status === 401 || resClash.status === 401) {
        redirectToLogin();
        return;
      }

      if (resEl.ok) {
        const data = await resEl.json();
        setElements(Array.isArray(data) ? data : []);
      } else {
        setElements([]);
      }

      if (resClash.ok) {
        const cData = await resClash.json();
        setClashes(cData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredElements = elements.filter((el) => {
    if (selectedDiscipline !== "all" && el.discipline !== selectedDiscipline) return false;
    if (selectedStorey !== "all" && el.storey_level !== selectedStorey) return false;
    return true;
  });

  const getDisciplineColor = (disc: string) => {
    switch (disc) {
      case "hvac":
        return "#06b6d4"; // Cyan
      case "firefighting":
        return "#ef4444"; // Red
      case "structure":
        return "#8b5cf6"; // Violet
      case "electrical":
        return "#eab308"; // Yellow
      case "plumbing":
        return "#3b82f6"; // Blue
      default:
        return "#10b981"; // Emerald
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader />
        <main className="container mx-auto p-4 md:p-6">
          <EngineeringNav />
          <PageSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
              <Boxes className="text-amber-400" size={28} />
              BIM-CAD 3D/4D/5D Spatial Engine
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Trực quan hóa không gian số, đối soát tiến độ 4D, bóc tách 5D BOQ và giải quyết xung
              đột nắn tuyến tự động
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fetchData()}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              <RefreshCw size={16} />
              Làm mới
            </button>
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
              <button
                onClick={() => setActiveTab("viewer3d")}
                className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold ${
                  activeTab === "viewer3d"
                    ? "bg-amber-500 text-on-accent-dark"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Compass size={14} />
                3D Không gian & 4D Heatmap
              </button>
              <button
                onClick={() => setActiveTab("clashes")}
                className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold ${
                  activeTab === "clashes"
                    ? "bg-amber-500 text-on-accent-dark"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <AlertTriangle size={14} />
                Xung đột & Nắn tuyến ({clashes.length})
              </button>
              <button
                onClick={() => setActiveTab("qto5d")}
                className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold ${
                  activeTab === "qto5d"
                    ? "bg-amber-500 text-on-accent-dark"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <DollarSign size={14} />
                5D Bóc tách BOQ
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: 3D Viewer & 4D Progress */}
        {activeTab === "viewer3d" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* 3D Spatial Canvas */}
            <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-8">
              {/* Controls Bar */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Bộ môn:
                  </span>
                  <select
                    value={selectedDiscipline}
                    onChange={(e) => setSelectedDiscipline(e.target.value)}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200"
                  >
                    <option value="all">Tất cả bộ môn</option>
                    <option value="hvac">HVAC (Thông gió - ĐHKK)</option>
                    <option value="structure">Kết cấu (Structure)</option>
                    <option value="firefighting">PCCC (Firefighting)</option>
                    <option value="electrical">Điện (Electrical)</option>
                    <option value="plumbing">Cấp thoát nước</option>
                  </select>

                  <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Tầng:
                  </span>
                  <select
                    value={selectedStorey}
                    onChange={(e) => setSelectedStorey(e.target.value)}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200"
                  >
                    <option value="all">Tất cả tầng</option>
                    <option value="Tầng 04">Tầng 04</option>
                    <option value="Tầng 05">Tầng 05</option>
                    <option value="Tầng Hầm">Tầng Hầm</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Chế độ tô màu:</span>
                  <button
                    onClick={() => setViewMode("4d_status")}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      viewMode === "4d_status"
                        ? "bg-zinc-700 text-amber-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    4D Tiến độ
                  </button>
                  <button
                    onClick={() => setViewMode("discipline")}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      viewMode === "discipline"
                        ? "bg-zinc-700 text-cyan-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    Bộ môn
                  </button>
                </div>
              </div>

              {/* 3D Spatial Visualizer */}
              <div className="relative flex h-[480px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-zinc-800/80 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 p-4">
                {/* Isometric Grid Background */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px), radial-gradient(#64748b 1px, transparent 1px)`,
                    backgroundSize: `40px 40px`,
                    backgroundPosition: `0 0, 20px 20px`,
                  }}
                />

                {/* Simulated 3D Elements Canvas */}
                <div className="relative z-10 grid h-full w-full grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  {filteredElements.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center h-64 text-center p-8 text-zinc-500">
                      <Box className="w-12 h-12 text-zinc-600 mb-2" />
                      <p className="text-sm font-medium text-zinc-300">
                        Chưa có cấu kiện BIM/CAD nào cho dự án này.
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Vui lòng nạp mô hình IFC/DWG hoặc liên kết cấu kiện với WBS để hiển thị
                        3D/4D.
                      </p>
                    </div>
                  ) : (
                    filteredElements.map((el) => {
                      const statusColor = get4DStatusColor(
                        el.task_status,
                        el.task_progress,
                        clashes.some(
                          (c) =>
                            c.element_a_id === el.id ||
                            c.element_b_id === el.id ||
                            c.element_a_guid === el.ifc_guid ||
                            c.element_b_guid === el.ifc_guid,
                        ),
                      );

                      const cardColor =
                        viewMode === "4d_status"
                          ? statusColor.colorHex
                          : getDisciplineColor(el.discipline);

                      const isSelected = selectedElement?.id === el.id;

                      return (
                        <div
                          key={el.id}
                          onClick={() => setSelectedElement(el)}
                          className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02] ${
                            isSelected
                              ? "border-amber-400 bg-zinc-800/90 shadow-lg shadow-amber-500/10"
                              : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                          }`}
                          style={{ borderLeftWidth: 6, borderLeftColor: cardColor }}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-zinc-400">
                                {el.ifc_guid}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ backgroundColor: `${cardColor}25`, color: cardColor }}
                              >
                                {viewMode === "4d_status"
                                  ? statusColor.statusLabel
                                  : el.discipline.toUpperCase()}
                              </span>
                            </div>

                            <h3 className="mt-2 text-sm font-semibold text-zinc-100">
                              {el.system_name || el.element_type}
                            </h3>
                            <p className="text-xs text-zinc-400">
                              {el.storey_level} • {el.zone_name}
                            </p>
                          </div>

                          <div className="mt-4 border-t border-zinc-800/80 pt-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-400">Tiến độ WBS:</span>
                              <span className="font-mono font-bold text-zinc-200">
                                {Math.round((el.task_progress || 0) * 100)}%
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.round((el.task_progress || 0) * 100)}%`,
                                  backgroundColor: statusColor.colorHex,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 3D Coordinate Axis Overlay */}
                <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 text-[11px] font-mono text-zinc-400 backdrop-blur">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> X: Trục 1-12
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Y: Trục A-G
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Z: +14.500m
                  </span>
                </div>
              </div>

              {/* 4D Legend */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-xs">
                <span className="text-zinc-400 font-semibold">4D Status Heatmap:</span>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Đã nghiệm thu
                    (100%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Đang thi công
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Chậm tiến độ
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Xung đột (Clash)
                  </span>
                </div>
              </div>
            </div>

            {/* Element Detail & Properties Panel */}
            <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-4">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Activity size={18} className="text-amber-400" />
                Thông số Kỹ thuật Đối tượng (Psets)
              </h2>

              {selectedElement ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <span className="font-mono text-xs text-amber-400 font-bold">
                      {selectedElement.ifc_guid}
                    </span>
                    <h3 className="text-lg font-bold text-zinc-100">
                      {selectedElement.system_name || selectedElement.element_type}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Loại đối tượng IFC:{" "}
                      <span className="font-mono text-zinc-300">
                        {selectedElement.element_type}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Liên kết 4D Tiến độ
                    </h4>
                    <p className="mt-1 text-sm text-zinc-200 font-medium">
                      {selectedElement.task_name || "Chưa gắn Task ID"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                      <span>Mã BOQ:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {selectedElement.boq_code || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Tọa độ Hộp bao 3D (Bounding Box)
                    </h4>
                    <div className="mt-2 space-y-1 font-mono text-xs text-zinc-300">
                      <div>Min: [{selectedElement.spatial_bounding_box.min.join(", ")}] mm</div>
                      <div>Max: [{selectedElement.spatial_bounding_box.max.join(", ")}] mm</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Thuộc tính Mở rộng (Psets)
                    </h4>
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                      {Object.entries(selectedElement.properties).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-zinc-900 pb-1">
                          <span className="text-zinc-400">{k}:</span>
                          <span className="text-zinc-200">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-12">
                  <EmptyState
                    title="Chưa chọn phần tử"
                    message="Bấm vào một phần tử trên khung nhìn không gian 3D để xem chi tiết thông số và liên kết 4D/5D."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Spatial Clashes & Auto-Reroute */}
        {activeTab === "clashes" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Clashes List */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-5">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <AlertTriangle size={18} className="text-red-400" />
                Danh sách Xung đột Không gian ({clashes.length})
              </h2>

              <div className="mt-4 space-y-3">
                {clashes.map((clash) => (
                  <div
                    key={clash.id}
                    onClick={() => setSelectedClash(clash)}
                    className={`cursor-pointer rounded-lg border p-3 transition-all ${
                      selectedClash?.id === clash.id
                        ? "border-amber-400 bg-zinc-800/90 shadow"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-red-400">
                        {clash.clash_code}
                      </span>
                      <span className="rounded bg-red-950/80 px-2 py-0.5 text-[10px] font-bold text-red-300">
                        {clash.clash_type === "hard_clash"
                          ? "Va chạm vật lý"
                          : "Khoảng cách an toàn"}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-zinc-300">
                      <div>
                        Phần tử A:{" "}
                        <span className="font-mono text-zinc-100">
                          {clash.element_a_guid || clash.element_a_type}
                        </span>
                      </div>
                      <div>
                        Phần tử B:{" "}
                        <span className="font-mono text-zinc-100">
                          {clash.element_b_guid || clash.element_b_type}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>
                        Tọa độ giao cắt: [{clash.intersection_point.x}, {clash.intersection_point.y}
                        , {clash.intersection_point.z}]
                      </span>
                      <span className="text-amber-400">3 Giải pháp &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prescriptive Auto-Reroute Solver Panel */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur lg:col-span-7">
              <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
                <Sparkles size={18} className="text-amber-400" />
                Prescriptive Auto-Reroute Solver (Thuật toán Nắn tuyến Tối ưu)
              </h2>

              {selectedClash?.prescriptive_solution ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <span className="font-bold">Đánh giá tối ưu: </span>
                    {selectedClash.prescriptive_solution.synthesisReason}
                  </div>

                  <div className="space-y-3">
                    {selectedClash.prescriptive_solution.options.map((opt, idx) => (
                      <div
                        key={opt.optionIndex}
                        className={`rounded-xl border p-4 transition-all ${
                          idx === selectedClash.prescriptive_solution?.recommendedIndex
                            ? "border-emerald-500/50 bg-emerald-950/20"
                            : "border-zinc-800 bg-zinc-950"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            {idx === selectedClash.prescriptive_solution?.recommendedIndex && (
                              <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-on-accent-dark">
                                KHUYẾN NGHỊ
                              </span>
                            )}
                            {opt.title}
                          </h4>
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            Điểm Pareto: {Math.round(opt.tradeOffScore * 100)}/100
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-zinc-300">{opt.description}</p>

                        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-zinc-900 p-2 text-center text-xs">
                          <div>
                            <div className="text-zinc-400">Chi phí phát sinh</div>
                            <div className="font-bold text-zinc-200">
                              {opt.estimatedCostVnd.toLocaleString("vi-VN")} đ
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-400">Tiến độ ảnh hưởng</div>
                            <div className="font-bold text-zinc-200">
                              +{opt.scheduleImpactDays} ngày
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-400">Tổn thất áp lực</div>
                            <div className="font-bold text-zinc-200">+{opt.pressureDropPa} Pa</div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <h5 className="text-[11px] font-semibold uppercase text-zinc-400">
                            Hành động thi công:
                          </h5>
                          <ul className="mt-1 list-disc pl-4 text-xs text-zinc-300 space-y-0.5">
                            {opt.actionDetails.map((act, i) => (
                              <li key={i}>{act}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="my-auto py-12">
                  <EmptyState
                    title="Chưa chọn xung đột"
                    message="Chọn một điểm xung đột trong danh sách bên trái để hiển thị 3 phương án nắn tuyến tự động."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: 5D Auto-QTO */}
        {activeTab === "qto5d" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur">
            <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-base font-bold text-zinc-200">
              <DollarSign size={18} className="text-emerald-400" />
              Bóc tách Khối lượng Thiết kế Tự động (5D Auto-QTO)
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="border-b border-zinc-800 bg-zinc-950 font-semibold uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="p-3">Mã GUID</th>
                    <th className="p-3">Hệ thống / Phần tử</th>
                    <th className="p-3">Bộ môn</th>
                    <th className="p-3">Tầng / Zone</th>
                    <th className="p-3">Khối lượng Tính toán</th>
                    <th className="p-3">Mã BOQ Ánh xạ</th>
                    <th className="p-3">Trạng thái WBS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {elements.map((el) => {
                    const qto = computeElementQto(el);
                    return (
                      <tr key={el.id} className="hover:bg-zinc-800/40">
                        <td className="p-3 font-mono text-zinc-400">{el.ifc_guid}</td>
                        <td className="p-3 font-medium text-zinc-100">
                          {el.system_name || el.element_type}
                        </td>
                        <td className="p-3 uppercase">{el.discipline}</td>
                        <td className="p-3">
                          {el.storey_level} - {el.zone_name}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400">
                          {qto.quantity} {qto.unit}
                        </td>
                        <td className="p-3 font-mono text-amber-300">
                          {el.boq_code || "Chưa gắn"}
                        </td>
                        <td className="p-3">
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-200">
                            {el.task_status || "Chờ thi công"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
