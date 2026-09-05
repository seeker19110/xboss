"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import { bangMau, mauToken } from "@/app/lib/mauTheme";
import { useCanvasHiDPI } from "@/app/components/useCanvasHiDPI";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
import {
  MapPin,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  MessageSquare,
  Filter,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Sliders,
  Box,
  Compass,
} from "lucide-react";

interface SpatialAnnotation {
  id: string;
  projectId: number;
  drawingCode: string;
  floorId: string | null;
  annotType: "progress_pin" | "ncr_issue" | "bbnt_request" | "rfi_markup" | "general_note";
  coordX: number;
  coordY: number;
  coordZ: number;
  geomPayload: Record<string, any>;
  entityRefType: string | null;
  entityRefId: string | null;
  title: string;
  description: string | null;
  severity: "low" | "normal" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed" | "cancelled";
  metadata: Record<string, any>;
  createdAt: string;
}

// `token`: tên biến CSS của theme (dùng cho canvas qua mauToken — canvas không nhận var()).
// `color`: chuỗi var() dùng thẳng cho style của DOM. Không hardcode hex ở cả hai đường.
const TYPE_CONFIG = {
  progress_pin: {
    label: "Tiến độ WBS",
    token: "--color-emerald-400",
    color: "var(--color-emerald-400)",
    icon: CheckCircle2,
  },
  ncr_issue: {
    label: "Lỗi NCR / Hiện trường",
    token: "--color-red-400",
    color: "var(--color-red-400)",
    icon: AlertTriangle,
  },
  bbnt_request: {
    label: "Nghiệm thu BBNT",
    token: "--color-sky-400",
    color: "var(--color-sky-400)",
    icon: FileCheck,
  },
  rfi_markup: {
    label: "Ghi chú RFI",
    token: "--color-amber-400",
    color: "var(--color-amber-400)",
    icon: MessageSquare,
  },
  general_note: {
    label: "Ghi chú chung",
    token: "--color-violet-400",
    color: "var(--color-violet-400)",
    icon: MapPin,
  },
};

export default function SpatialViewerPage() {
  const [drawingCode, setDrawingCode] = useState("DWG-M-FL08-01");
  const [annotations, setAnnotations] = useState<SpatialAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnnot, setSelectedAnnot] = useState<SpatialAnnotation | null>(null);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  // Layers visibility
  const [layers, setLayers] = useState<Record<string, boolean>>({
    HVAC: true,
    PLUMBING: true,
    ELECTRICAL: true,
    FIREFIGHTING: true,
    GRID: true,
    ANNOTATIONS: true,
  });

  // Canvas pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mouseCoord, setMouseCoord] = useState({ x: 0, y: 0 });

  // Pin Creation Modal / State
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [newPinCoord, setNewPinCoord] = useState<{ x: number; y: number } | null>(null);
  const [newPinForm, setNewPinForm] = useState({
    title: "",
    annotType: "progress_pin" as SpatialAnnotation["annotType"],
    severity: "normal" as SpatialAnnotation["severity"],
    description: "",
    entityRefType: "WBS_TASK",
    entityRefId: "",
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Canvas theo devicePixelRatio + co giãn theo container; `toCanvasCoords` đổi toạ độ
  // chuột sang toạ độ logic — trước đây bấm để cắm ghim tính thẳng từ getBoundingClientRect
  // nên ghim lệch chỗ mọi khi bề rộng hiển thị khác 900px (audit 2026-08-25 §3.7).
  const { size: canvasSize, toCanvasCoords } = useCanvasHiDPI(canvasRef, {
    width: 900,
    height: 560,
  });

  const fetchAnnotations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/engineering/spatial/annotations?drawingCode=${drawingCode}`);
      if (res.ok) {
        const d = await res.json();
        setAnnotations(d.data || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [drawingCode]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  // Vẽ Canvas 2D Vector CAD
  useEffect(() => {
    if (viewMode !== "2d") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Màu đọc từ token của theme đang bật (audit 2026-09-05) — canvas không nhận `var(--…)`
    // nên trước đây hardcode hex tối, sang theme sáng thì nét vẽ/nhãn gần như biến mất.
    const mau = bangMau({
      luoi: "--color-zinc-800",
      nhan: "--color-zinc-500",
      ong: "--color-sky-400",
      ongDam: "--color-sky-400",
      thietBi: "--color-emerald-400",
      canhBao: "--color-amber-400",
      loi: "--color-red-400",
      loiDam: "--color-red-400",
      nen: "--color-on-accent",
      ghiChu: "--color-violet-400",
    });

    // Reset & Fill Background
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.save();

    // Áp dụng Pan & Zoom
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. Vẽ Hệ Lưới Trục Toạ Độ (Grid & Axes)
    if (layers.GRID) {
      ctx.strokeStyle = mau.luoi;
      ctx.lineWidth = 0.5;
      for (let x = -200; x <= 1400; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, -200);
        ctx.lineTo(x, 900);
        ctx.stroke();
      }
      for (let y = -200; y <= 900; y += 100) {
        ctx.beginPath();
        ctx.moveTo(-200, y);
        ctx.lineTo(1400, y);
        ctx.stroke();
      }

      // Trục toạ độ và nhãn lưới
      ctx.fillStyle = mau.nhan;
      ctx.font = "10px monospace";
      ["X1", "X2", "X3", "X4", "X5", "X6"].forEach((lbl, idx) => {
        ctx.fillText(lbl, idx * 180 + 50, -10);
      });
      ["Y1", "Y2", "Y3", "Y4"].forEach((lbl, idx) => {
        ctx.fillText(lbl, -30, idx * 180 + 50);
      });
    }

    // 2. Vẽ Mạng Ống Gió HVAC
    if (layers.HVAC) {
      ctx.strokeStyle = mau.ong;
      ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(80, 120);
      ctx.lineTo(480, 120);
      ctx.lineTo(480, 360);
      ctx.lineTo(820, 360);
      ctx.stroke();

      // Cửa gió Supply Diffusers
      ctx.fillStyle = mau.ongDam;
      [180, 320, 480, 640, 780].forEach((pos) => {
        ctx.fillRect(pos - 15, 105, 30, 30);
      });
    }

    // 3. Vẽ Tuyến Ống Cấp Thoát Nước (Plumbing)
    if (layers.PLUMBING) {
      ctx.strokeStyle = mau.thietBi;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(120, 80);
      ctx.lineTo(120, 480);
      ctx.lineTo(600, 480);
      ctx.stroke();
    }

    // 4. Vẽ Tuyến Cáp Điện (Electrical Tray)
    if (layers.ELECTRICAL) {
      ctx.strokeStyle = mau.canhBao;
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(60, 200);
      ctx.lineTo(760, 200);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Vẽ Tuyến PCCC Sprinkler
    if (layers.FIREFIGHTING) {
      ctx.strokeStyle = mau.loi;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 280);
      ctx.lineTo(800, 280);
      ctx.stroke();

      // Đầu phun Sprinkler Heads
      ctx.fillStyle = mau.loiDam;
      [150, 300, 450, 600, 750].forEach((px) => {
        ctx.beginPath();
        ctx.arc(px, 280, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 6. Vẽ Các Điểm Ghim (Spatial Annotations)
    if (layers.ANNOTATIONS) {
      annotations.forEach((annot) => {
        const cfg = TYPE_CONFIG[annot.annotType] || TYPE_CONFIG.general_note;
        ctx.save();
        ctx.translate(annot.coordX, annot.coordY);

        // Vòng tròn định vị
        ctx.fillStyle = mauToken(cfg.token);
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = mau.nen;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Nhãn Pin
        ctx.fillStyle = mau.nen;
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(annot.title.slice(0, 16), 12, 4);

        ctx.restore();
      });
    }

    // Preview New Pin Drop
    if (newPinCoord) {
      ctx.fillStyle = mau.ghiChu;
      ctx.beginPath();
      ctx.arc(newPinCoord.x, newPinCoord.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = mau.nen;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }, [pan, zoom, layers, annotations, viewMode, newPinCoord, canvasSize]);

  // Xử lý Mouse Events cho Canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isAddingPin) {
      const diem = toCanvasCoords(e);
      setNewPinCoord({
        x: Math.round((diem.x - pan.x) / zoom),
        y: Math.round((diem.y - pan.y) / zoom),
      });
      return;
    }

    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const diem = toCanvasCoords(e);
    setMouseCoord({
      x: Math.round((diem.x - pan.x) / zoom),
      y: Math.round((diem.y - pan.y) / zoom),
    });

    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((prev) => Math.min(Math.max(prev * zoomFactor, 0.3), 5));
  };

  const handleCreatePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPinCoord || !newPinForm.title) return;

    try {
      const res = await fetch("/api/engineering/spatial/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drawingCode,
          annotType: newPinForm.annotType,
          coordX: newPinCoord.x,
          coordY: newPinCoord.y,
          title: newPinForm.title,
          description: newPinForm.description,
          severity: newPinForm.severity,
          entityRefType: newPinForm.entityRefType,
          entityRefId: newPinForm.entityRefId || null,
        }),
      });

      if (res.ok) {
        setIsAddingPin(false);
        setNewPinCoord(null);
        setNewPinForm({
          title: "",
          annotType: "progress_pin",
          severity: "normal",
          description: "",
          entityRefType: "WBS_TASK",
          entityRefId: "",
        });
        await fetchAnnotations();
      }
    } catch {
      // Ignore
    }
  };

  const handleUpdateStatus = async (id: string, status: SpatialAnnotation["status"]) => {
    try {
      const res = await fetch(`/api/engineering/spatial/annotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchAnnotations();
        if (selectedAnnot?.id === id) {
          setSelectedAnnot((prev) => (prev ? { ...prev, status } : null));
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá điểm ghim này?")) return;
    try {
      const res = await fetch(`/api/engineering/spatial/annotations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (selectedAnnot?.id === id) setSelectedAnnot(null);
        await fetchAnnotations();
      }
    } catch {
      // Ignore
    }
  };

  // Metrics
  const summary = {
    total: annotations.length,
    open: annotations.filter((a) => a.status === "open" || a.status === "in_progress").length,
    critical: annotations.filter((a) => a.severity === "critical" || a.severity === "high").length,
    progress: annotations.filter((a) => a.annotType === "progress_pin").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EngineeringNav />

        {/* Tiêu đề & Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Interactive CAD/BIM Spatial Viewer & Pinning (M74)
            </h1>
            <p className="text-xs text-zinc-400">
              Trực quan hoá bản vẽ không gian 2D/3D, chấm mốc hiện trường, liên kết WBS & NCR
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-zinc-900 p-1 border border-zinc-800">
              <button
                onClick={() => setViewMode("2d")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewMode === "2d"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Layers size={13} /> 2D Vector CAD
              </button>
              <button
                onClick={() => setViewMode("3d")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewMode === "3d"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Box size={13} /> 3D Spatial Mesh
              </button>
            </div>

            <button
              onClick={() => {
                setIsAddingPin((v) => !v);
                setNewPinCoord(null);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isAddingPin
                  ? "bg-amber-700 text-on-accent hover:bg-amber-800"
                  : "bg-violet-600 text-white hover:bg-violet-500"
              }`}
            >
              <Plus size={14} />
              {isAddingPin ? "Huỷ chấm mốc" : "Chấm mốc mới (Pin)"}
            </button>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bento-card p-4">
            <p className="text-xs font-medium text-zinc-400">Tổng điểm ghim</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-zinc-100">
              {summary.total}
            </p>
          </div>
          <div className="bento-card p-4">
            <p className="text-xs font-medium text-amber-400">Đang xử lý / Mở</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-400">
              {summary.open}
            </p>
          </div>
          <div className="bento-card p-4">
            <p className="text-xs font-medium text-rose-400">Cảnh báo nghiêm trọng</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-400">
              {summary.critical}
            </p>
          </div>
          <div className="bento-card p-4">
            <p className="text-xs font-medium text-emerald-400">Ghim Tiến độ WBS</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {summary.progress}
            </p>
          </div>
        </div>

        {/* Workspace Canvas & Sidebar */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Main Canvas Area */}
          <div className="space-y-3 lg:col-span-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-300">Bản vẽ:</span>
                <select
                  value={drawingCode}
                  onChange={(e) => setDrawingCode(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200 focus:outline-none"
                >
                  <option value="DWG-M-FL08-01">DWG-M-FL08-01 (Mặt bằng MEP Tầng 8 Tháp A)</option>
                  <option value="DWG-E-FL08-02">
                    DWG-E-FL08-02 (Sơ đồ Máng Cáp & Điện Tầng 8)
                  </option>
                  <option value="DWG-FF-FL08-03">
                    DWG-FF-FL08-03 (Mạng Sprinkler PCCC Tầng 8)
                  </option>
                </select>
              </div>

              {/* Layer Toggles */}
              <div className="flex flex-wrap items-center gap-1">
                {Object.keys(layers).map((lyr) => (
                  <button
                    key={lyr}
                    onClick={() => setLayers((prev) => ({ ...prev, [lyr]: !prev[lyr] }))}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                      layers[lyr]
                        ? "bg-zinc-800 text-zinc-200 border border-zinc-700"
                        : "bg-zinc-950 text-zinc-600 line-through"
                    }`}
                  >
                    {lyr}
                  </button>
                ))}
              </div>

              {/* Zoom & Reset Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoom((z) => Math.min(z * 1.2, 5))}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 100, y: 80 });
                  }}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>

            {/* Canvas Container */}
            <div className="relative h-[560px] w-full overflow-hidden rounded-b-xl border border-zinc-800 bg-zinc-950">
              {viewMode === "2d" ? (
                <>
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    className="cursor-crosshair"
                  />

                  {/* Coordinate Badge */}
                  <div className="absolute bottom-3 left-3 rounded-md bg-zinc-900/90 px-2 py-1 font-mono text-[10px] text-zinc-400 border border-zinc-800">
                    X: {mouseCoord.x} mm | Y: {mouseCoord.y} mm | Zoom: {(zoom * 100).toFixed(0)}%
                  </div>

                  {isAddingPin && (
                    <div className="absolute top-3 left-3 rounded-md bg-amber-900/90 px-3 py-1.5 text-xs text-amber-200 border border-amber-700">
                      Nhấp chuột vào vị trí bất kỳ trên bản vẽ để đặt điểm ghim
                    </div>
                  )}
                </>
              ) : (
                /* 3D Isometric Mesh Mode */
                <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                  <Box size={48} className="mb-3 text-violet-400 animate-pulse" />
                  <h3 className="text-sm font-semibold text-zinc-200">3D Spatial Mesh Viewer</h3>
                  <p className="mt-1 max-w-md text-xs text-zinc-400">
                    Đang dựng khung dây 3D Wireframe cho các Spool ống HVAC và Sleeve xuyên dầm theo
                    toạ độ LOD 400.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded bg-sky-900/40 px-2 py-1 text-[11px] text-sky-300 border border-sky-700/50">
                      HVAC: 14 Spools
                    </span>
                    <span className="rounded bg-emerald-900/40 px-2 py-1 text-[11px] text-emerald-300 border border-emerald-700/50">
                      Pipes: 8 Tuyến
                    </span>
                    <span className="rounded bg-amber-900/40 px-2 py-1 text-[11px] text-amber-300 border border-amber-700/50">
                      Sleeves: 6 Vị trí
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Tạo Pin Khi Nhấp */}
            {isAddingPin && newPinCoord && (
              <form
                onSubmit={handleCreatePinSubmit}
                className="rounded-xl border border-violet-700/50 bg-zinc-900 p-4 shadow-xl space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-violet-300">
                    Tạo điểm ghim tại toạ độ X: {newPinCoord.x}, Y: {newPinCoord.y}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setNewPinCoord(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Huỷ
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-[11px] text-zinc-400">Loại điểm ghim</label>
                    <select
                      value={newPinForm.annotType}
                      onChange={(e) =>
                        setNewPinForm((p) => ({ ...p, annotType: e.target.value as any }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    >
                      <option value="progress_pin">Tiến độ WBS</option>
                      <option value="ncr_issue">Lỗi NCR / Sự cố</option>
                      <option value="bbnt_request">Yêu cầu BBNT</option>
                      <option value="rfi_markup">Ghi chú RFI</option>
                      <option value="general_note">Ghi chú chung</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400">Mức độ nghiêm trọng</label>
                    <select
                      value={newPinForm.severity}
                      onChange={(e) =>
                        setNewPinForm((p) => ({ ...p, severity: e.target.value as any }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    >
                      <option value="normal">Bình thường</option>
                      <option value="medium">Trung bình</option>
                      <option value="high">Cao</option>
                      <option value="critical">Khẩn cấp / Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400">Tiêu đề điểm ghim</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Cửa gió AHU-02 trễ tiến độ"
                      value={newPinForm.title}
                      onChange={(e) => setNewPinForm((p) => ({ ...p, title: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400">
                    Mô tả chi tiết / Yêu cầu khắc phục
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Mô tả cụ thể hiện trạng tại công trường..."
                    value={newPinForm.description}
                    onChange={(e) => setNewPinForm((p) => ({ ...p, description: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                  >
                    Lưu điểm ghim
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Sidebar Danh Sách Annotations */}
          <div className="space-y-4 lg:col-span-1">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-200">
                  Danh sách Điểm Ghim ({annotations.length})
                </h3>
                <button
                  aria-label="Làm mới"
                  onClick={fetchAnnotations}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <RefreshCw size={12} />
                </button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              ) : annotations.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">
                  Chưa có điểm ghim nào trên bản vẽ này
                </p>
              ) : (
                <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
                  {annotations.map((annot) => {
                    const cfg = TYPE_CONFIG[annot.annotType] || TYPE_CONFIG.general_note;
                    const isSelected = selectedAnnot?.id === annot.id;

                    return (
                      <div
                        key={annot.id}
                        onClick={() => setSelectedAnnot(annot)}
                        className={`cursor-pointer rounded-lg border p-2.5 transition ${
                          isSelected
                            ? "border-violet-600 bg-violet-950/20"
                            : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                            // Nền mờ: color-mix thay cho mẹo nối "15" vào mã hex (không dùng được với var()).
                            style={{
                              color: cfg.color,
                              backgroundColor: `color-mix(in oklab, ${cfg.color} 12%, transparent)`,
                            }}
                          >
                            {cfg.label}
                          </span>
                          <span
                            className={`text-[10px] font-medium ${
                              annot.status === "open"
                                ? "text-amber-400"
                                : annot.status === "resolved"
                                  ? "text-emerald-400"
                                  : "text-zinc-500"
                            }`}
                          >
                            {annot.status}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-semibold text-zinc-200">{annot.title}</p>
                        {annot.description && (
                          <p className="mt-0.5 text-[11px] text-zinc-400 line-clamp-2">
                            {annot.description}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between border-t border-zinc-800/80 pt-1.5 text-[10px] text-zinc-500">
                          <span>
                            X: {annot.coordX}, Y: {annot.coordY}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {annot.status === "open" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateStatus(annot.id, "resolved");
                                }}
                                className="text-emerald-400 hover:text-emerald-300"
                              >
                                Giải quyết
                              </button>
                            )}
                            <button
                              aria-label="Xoá"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAnnotation(annot.id);
                              }}
                              className="text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
