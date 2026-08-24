"use client";

import { Dispatch, SetStateAction } from "react";
import {
  Layers,
  AlertTriangle,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  Wand2,
  Award,
  FileArchive,
  MousePointer,
  Loader2,
} from "lucide-react";
import { ACI_TO_HEX, DxfEntityRaw, DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";
import type { HoveredCadEntity, PurgeState } from "../types";

// Studio đồ họa vector CAD 2D: khung nhìn tương tác (zoom/pan/hover),
// bảng điểm sức khỏe 6D và bộ lọc hiển thị layer.

interface CadViewportStudioProps {
  isAutoHealing: boolean;
  dxfData: DxfParseResult | null;
  canvasZoom: number;
  setCanvasZoom: Dispatch<SetStateAction<number>>;
  canvasPan: { x: number; y: number };
  setCanvasPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
  isDraggingCanvas: boolean;
  setIsDraggingCanvas: Dispatch<SetStateAction<boolean>>;
  dragStartPos: { x: number; y: number };
  setDragStartPos: Dispatch<SetStateAction<{ x: number; y: number }>>;
  cursorWcsCoords: { x: number; y: number };
  setCursorWcsCoords: Dispatch<SetStateAction<{ x: number; y: number }>>;
  selectedCadEntity: DxfEntityRaw | null;
  setSelectedCadEntity: Dispatch<SetStateAction<DxfEntityRaw | null>>;
  visibleLayers: Record<string, boolean>;
  setVisibleLayers: Dispatch<SetStateAction<Record<string, boolean>>>;
  showDefectsHighlight: boolean;
  setShowDefectsHighlight: Dispatch<SetStateAction<boolean>>;
  hoveredCadEntity: HoveredCadEntity | null;
  setHoveredCadEntity: Dispatch<SetStateAction<HoveredCadEntity | null>>;
  purgeState: PurgeState;
  toggleLayerVisibility: (layerKey: string) => void;
  layerScore: number;
  fontScore: number;
  geometryScore: number;
  dimScore: number;
  blockScore: number;
  xrefScore: number;
  totalHealthScore: number;
  triggerAutoHealWithProgress: () => void;
  handleDownloadMasterBundle: () => void;
}

export default function CadViewportStudio({
  isAutoHealing,
  dxfData,
  canvasZoom,
  setCanvasZoom,
  canvasPan,
  setCanvasPan,
  isDraggingCanvas,
  setIsDraggingCanvas,
  dragStartPos,
  setDragStartPos,
  cursorWcsCoords,
  setCursorWcsCoords,
  selectedCadEntity,
  setSelectedCadEntity,
  visibleLayers,
  setVisibleLayers,
  showDefectsHighlight,
  setShowDefectsHighlight,
  hoveredCadEntity,
  setHoveredCadEntity,
  purgeState,
  toggleLayerVisibility,
  layerScore,
  fontScore,
  geometryScore,
  dimScore,
  blockScore,
  xrefScore,
  totalHealthScore,
  triggerAutoHealWithProgress,
  handleDownloadMasterBundle,
}: CadViewportStudioProps) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
      {/* Header & Viewport Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Maximize2 className="w-4 h-4" />
            </span>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2">
              <span>Studio Đồ Họa Vector CAD 2D & Khảo Sát Kỹ Thuật Trực Quan</span>
              <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono">
                Realtime Viewport
              </span>
            </h2>
          </div>
          <p className="text-[11px] text-zinc-400">
            Khung nhìn vector tương tác thời gian thực: Phóng to, rê chuột khảo sát thông số tuyến
            ống, bật/tắt layer và chẩn đoán dị tật trực tiếp trên đồ họa.
          </p>
        </div>

        {/* Studio Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Zoom Controls */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800 gap-1">
            <button
              onClick={() => setCanvasZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
              title="Thu nhỏ"
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold text-zinc-300 px-1 min-w-[42px] text-center">
              {Math.round(canvasZoom * 100)}%
            </span>
            <button
              onClick={() => setCanvasZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
              title="Phóng to"
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setCanvasZoom(1.0);
                setCanvasPan({ x: 0, y: 0 });
              }}
              title="Căn vừa màn hình (Fit)"
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 transition ml-0.5 border-l border-zinc-800 pl-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Toggle Defect Highlights */}
          <button
            onClick={() => setShowDefectsHighlight(!showDefectsHighlight)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              showDefectsHighlight
                ? "bg-rose-500/15 border-rose-500/30 text-rose-400 font-bold"
                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Dị Tật {showDefectsHighlight ? "Bật" : "Tắt"}</span>
          </button>

          {/* 1-Click Auto-Healing Button */}
          <button
            onClick={triggerAutoHealWithProgress}
            disabled={isAutoHealing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm transition ${
              isAutoHealing
                ? "bg-amber-500 text-zinc-950 opacity-90 cursor-wait animate-pulse"
                : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950"
            }`}
          >
            {isAutoHealing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang Chuẩn Hóa...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>Tự Chữa Lành 1-Chạm</span>
              </>
            )}
          </button>

          {/* Master Bundle Download Button */}
          <button
            onClick={handleDownloadMasterBundle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
          >
            <FileArchive className="w-3.5 h-3.5 text-sky-400" />
            <span>Xuất Master Pack</span>
          </button>
        </div>
      </div>

      {/* 2-Column Main Studio: (Left: Vector Canvas Viewport | Right: 6D Health & Layer Controller) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* ── Left Column (Col 8): Vector CAD Canvas Viewport ── */}
        <div className="lg:col-span-8 rounded-xl bg-zinc-950 border border-zinc-800/90 overflow-hidden relative shadow-inner flex flex-col">
          {/* Canvas Status & Coordinate Header */}
          <div className="px-3 py-2 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between text-[11px] flex-wrap gap-2">
            <div className="flex items-center gap-2 font-mono text-zinc-400">
              <Crosshair className="w-3.5 h-3.5 text-amber-400" />
              <span>
                WCS 2D:{" "}
                <strong className="text-zinc-200 font-mono">
                  (X: {cursorWcsCoords.x.toLocaleString()}, Y: {cursorWcsCoords.y.toLocaleString()})
                  mm
                </strong>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                Tỷ lệ: <strong className="text-emerald-400">1:1 (mm)</strong>
              </span>
              <span className="text-zinc-600">•</span>
              {dxfData?.isRealDrawing ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Bản Vẽ Thật ({dxfData.entities.length} thực thể,{" "}
                  {((dxfData.fileSizeBytes || 0) / 1024).toFixed(1)} KB)
                </span>
              ) : dxfData ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold text-[10px]">
                  {dxfData.entities.length} thực thể
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-500 font-semibold text-[10px]">
                  Chưa nạp bản vẽ
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono">
              {hoveredCadEntity ? (
                <span className="text-amber-300 font-bold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  <MousePointer className="w-3 h-3 text-amber-400" />
                  {hoveredCadEntity.details}
                </span>
              ) : (
                <span className="text-zinc-500">
                  Rê chuột lên thực thể CAD để khảo sát tọa độ X,Y & thông số
                </span>
              )}
            </div>
          </div>

          {/* Interactive Vector Canvas Area */}
          <div
            className="w-full h-[430px] relative overflow-hidden bg-[#0a0d14] cursor-grab active:cursor-grabbing select-none"
            onMouseDown={(e) => {
              setIsDraggingCanvas(true);
              setDragStartPos({ x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y });
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseScreenX = e.clientX - rect.left;
              const mouseScreenY = e.clientY - rect.top;

              const cadBounds = dxfData?.diagnostic?.boundingDimensions || {
                minX: 0,
                maxX: 42000,
                minY: 0,
                maxY: 24000,
                widthMm: 42000,
                lengthMm: 24000,
              };
              const cadMinX = cadBounds.minX ?? 0;
              const cadMinY = cadBounds.minY ?? 0;
              const cadMaxX = cadBounds.maxX ?? 42000;
              const cadMaxY = cadBounds.maxY ?? 24000;
              const cadWidth = Math.max(1000, cadMaxX - cadMinX);
              const cadHeight = Math.max(1000, cadMaxY - cadMinY);

              const svgW = 900;
              const svgH = 430;
              const pad = 45;
              const scX = (svgW - pad * 2) / cadWidth;
              const scY = (svgH - pad * 2) / cadHeight;
              const sc = Math.min(scX, scY);
              const offX = (svgW - cadWidth * sc) / 2;
              const offY = (svgH - cadHeight * sc) / 2;

              const localSvgX = (mouseScreenX - canvasPan.x) / canvasZoom;
              const localSvgY = (mouseScreenY - canvasPan.y) / canvasZoom;
              const mmX = Math.round(cadMinX + (localSvgX - offX) / sc);
              const mmY = Math.round(cadMinY + (svgH - offY - localSvgY) / sc);

              setCursorWcsCoords({ x: mmX, y: mmY });

              if (isDraggingCanvas) {
                setCanvasPan({
                  x: e.clientX - dragStartPos.x,
                  y: e.clientY - dragStartPos.y,
                });
              }
            }}
            onMouseUp={() => setIsDraggingCanvas(false)}
            onMouseLeave={() => {
              setIsDraggingCanvas(false);
              setHoveredCadEntity(null);
            }}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setCanvasZoom((z) => Math.min(3.5, Math.max(0.3, Number((z + delta).toFixed(2)))));
            }}
          >
            {/* Blueprint Background Grid Pattern */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)`,
                backgroundSize: `${30 * canvasZoom}px ${30 * canvasZoom}px`,
                backgroundPosition: `${canvasPan.x}px ${canvasPan.y}px`,
              }}
            />

            {/* SVG CAD Entities Renderer */}
            <svg
              viewBox="0 0 900 430"
              className="w-full h-full pointer-events-auto"
              style={{
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
                transformOrigin: "center center",
                transition: isDraggingCanvas ? "none" : "transform 0.08s ease-out",
              }}
            >
              {/* Calculate Dynamic Viewport Transformations */}
              {(() => {
                const cadBounds = dxfData?.diagnostic?.boundingDimensions || {
                  minX: 0,
                  maxX: 42000,
                  minY: 0,
                  maxY: 24000,
                  widthMm: 42000,
                  lengthMm: 24000,
                };
                const cadMinX = cadBounds.minX ?? 0;
                const cadMinY = cadBounds.minY ?? 0;
                const cadMaxX = cadBounds.maxX ?? 42000;
                const cadMaxY = cadBounds.maxY ?? 24000;
                const cadWidth = Math.max(1000, cadMaxX - cadMinX);
                const cadHeight = Math.max(1000, cadMaxY - cadMinY);

                const svgW = 900;
                const svgH = 430;
                const pad = 45;
                const scX = (svgW - pad * 2) / cadWidth;
                const scY = (svgH - pad * 2) / cadHeight;
                const sc = Math.min(scX, scY);
                const offX = (svgW - cadWidth * sc) / 2;
                const offY = (svgH - cadHeight * sc) / 2;

                const toSvgX = (x: number) => offX + (x - cadMinX) * sc;
                const toSvgY = (y: number) => svgH - (offY + (y - cadMinY) * sc);

                const getLayerColor = (layerName: string, entityColor?: number) => {
                  const layerInfo = dxfData?.layers?.find((l) => l.name === layerName);
                  if (layerInfo?.colorHex) return layerInfo.colorHex;
                  if (entityColor && ACI_TO_HEX[entityColor]) return ACI_TO_HEX[entityColor];
                  const upper = (layerName || "").toUpperCase();
                  if (
                    upper.includes("01_") ||
                    upper.includes("DUCT") ||
                    upper.includes("SUPP") ||
                    upper.includes("-M-") ||
                    upper.startsWith("M-")
                  )
                    return "#ef4444";
                  if (upper.includes("02_") || upper.includes("RET")) return "#eab308";
                  if (
                    upper.includes("ELEC") ||
                    upper.includes("TRAY") ||
                    upper.includes("PWR") ||
                    upper.includes("-E-") ||
                    upper.startsWith("E-")
                  )
                    return "#d946ef";
                  if (
                    upper.includes("PLUMB") ||
                    upper.includes("CHW") ||
                    upper.includes("PPR") ||
                    upper.includes("-P-") ||
                    upper.startsWith("P-")
                  )
                    return "#06b6d4";
                  if (upper.includes("DRAIN") || upper.includes("SAN") || upper.includes("THOAT"))
                    return "#10b981";
                  if (
                    upper.includes("FIRE") ||
                    upper.includes("SPRN") ||
                    upper.includes("PCCC") ||
                    upper.includes("-F-") ||
                    upper.startsWith("F-")
                  )
                    return "#f87171";
                  if (
                    upper.includes("GRID") ||
                    upper.includes("TRUC") ||
                    upper.includes("-S-") ||
                    upper.startsWith("S-")
                  )
                    return "#71717a";
                  if (upper.includes("WALL") || upper.includes("-A-") || upper.startsWith("A-"))
                    return "#a1a1aa";
                  return "#e4e4e7";
                };

                return (
                  <g>
                    {/* WCS Origin Symbol (0,0) */}
                    <g transform={`translate(${toSvgX(0)}, ${toSvgY(0)})`} opacity="0.65">
                      <circle cx="0" cy="0" r="5" fill="none" stroke="#eab308" strokeWidth="1.5" />
                      <line
                        x1="-12"
                        y1="0"
                        x2="12"
                        y2="0"
                        stroke="#eab308"
                        strokeWidth="1"
                        strokeDasharray="3 2"
                      />
                      <line
                        x1="0"
                        y1="-12"
                        x2="0"
                        y2="12"
                        stroke="#eab308"
                        strokeWidth="1"
                        strokeDasharray="3 2"
                      />
                      <text x="8" y="-6" fill="#eab308" fontSize="8" fontFamily="monospace">
                        WCS (0,0)
                      </text>
                    </g>

                    {/* Real Dynamic CAD Entities Rendering */}
                    {dxfData?.entities && dxfData.entities.length > 0 ? (
                      dxfData.entities.map((ent, idx) => {
                        const isVis = visibleLayers[ent.layer] ?? true;
                        if (!isVis) return null;

                        const strokeColor = getLayerColor(ent.layer, ent.color);
                        const isHovered = hoveredCadEntity?.id === (ent.id || `ent-${idx}`);
                        const isSelected = selectedCadEntity?.id === ent.id;
                        const coords = ent.coordinates || {};

                        const handleEnter = () => {
                          let detailStr = `${ent.layer} • [${ent.type}]`;
                          if (ent.decodedText || ent.textValue) {
                            detailStr += ` "${ent.decodedText || ent.textValue}"`;
                          } else if (coords.start && coords.end) {
                            const len = Math.round(
                              Math.hypot(
                                coords.end[0] - coords.start[0],
                                coords.end[1] - coords.start[1],
                              ),
                            );
                            detailStr += ` L=${len.toLocaleString()}mm • (${Math.round(coords.start[0])}, ${Math.round(coords.start[1])}) -> (${Math.round(coords.end[0])}, ${Math.round(coords.end[1])})`;
                          } else if (coords.center) {
                            detailStr += ` Tâm: (${Math.round(coords.center[0])}, ${Math.round(coords.center[1])})`;
                            if (coords.radius) detailStr += ` R=${Math.round(coords.radius)}mm`;
                          }
                          setHoveredCadEntity({
                            id: ent.id || `ent-${idx}`,
                            type: `${ent.layer} (${ent.type})`,
                            layer: ent.layer,
                            details: detailStr,
                          });
                        };

                        if (ent.type === "LINE" && coords.start && coords.end) {
                          const isGrid =
                            ent.layer.toUpperCase().includes("GRID") ||
                            ent.layer.toUpperCase().includes("TRUC");
                          return (
                            <line
                              key={ent.id || idx}
                              x1={toSvgX(coords.start[0])}
                              y1={toSvgY(coords.start[1])}
                              x2={toSvgX(coords.end[0])}
                              y2={toSvgY(coords.end[1])}
                              stroke={isHovered ? "#fbbf24" : strokeColor}
                              strokeWidth={isSelected ? 3.5 : isHovered ? 2.8 : isGrid ? 1 : 1.8}
                              strokeDasharray={isGrid ? "4 3" : undefined}
                              strokeLinecap="round"
                              opacity={isHovered || isSelected ? 1 : isGrid ? 0.6 : 0.85}
                              className="cursor-pointer transition-all"
                              onMouseEnter={handleEnter}
                              onClick={() => setSelectedCadEntity(ent)}
                            />
                          );
                        }

                        if (
                          (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
                          coords.points &&
                          coords.points.length > 0
                        ) {
                          const pointsStr = coords.points
                            .map((pt) => `${toSvgX(pt[0])},${toSvgY(pt[1])}`)
                            .join(" ");
                          return (
                            <polyline
                              key={ent.id || idx}
                              points={pointsStr}
                              fill="none"
                              stroke={isHovered ? "#fbbf24" : strokeColor}
                              strokeWidth={isSelected ? 3.5 : isHovered ? 2.8 : 1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={isHovered || isSelected ? 1 : 0.85}
                              className="cursor-pointer transition-all"
                              onMouseEnter={handleEnter}
                              onClick={() => setSelectedCadEntity(ent)}
                            />
                          );
                        }

                        if (ent.type === "CIRCLE" && coords.center) {
                          const r = Math.max(3, (coords.radius || 150) * sc);
                          return (
                            <circle
                              key={ent.id || idx}
                              cx={toSvgX(coords.center[0])}
                              cy={toSvgY(coords.center[1])}
                              r={r}
                              fill={strokeColor}
                              fillOpacity="0.25"
                              stroke={isHovered ? "#fbbf24" : strokeColor}
                              strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.5}
                              className="cursor-pointer transition-all"
                              onMouseEnter={handleEnter}
                              onClick={() => setSelectedCadEntity(ent)}
                            />
                          );
                        }

                        if (ent.type === "ARC" && coords.center) {
                          const r = Math.max(3, (coords.radius || 150) * sc);
                          return (
                            <circle
                              key={ent.id || idx}
                              cx={toSvgX(coords.center[0])}
                              cy={toSvgY(coords.center[1])}
                              r={r}
                              fill="none"
                              stroke={isHovered ? "#fbbf24" : strokeColor}
                              strokeWidth={1.5}
                              strokeDasharray="4 2"
                              className="cursor-pointer transition-all"
                              onMouseEnter={handleEnter}
                              onClick={() => setSelectedCadEntity(ent)}
                            />
                          );
                        }

                        if ((ent.type === "TEXT" || ent.type === "MTEXT") && coords.center) {
                          const txt = ent.decodedText || ent.textValue || "";
                          if (!txt) return null;
                          return (
                            <text
                              key={ent.id || idx}
                              x={toSvgX(coords.center[0])}
                              y={toSvgY(coords.center[1])}
                              fill={isHovered ? "#fbbf24" : strokeColor}
                              fontSize={Math.max(8.5, Math.min(12, 320 * sc))}
                              fontFamily="monospace"
                              fontWeight="bold"
                              textAnchor="middle"
                              className="cursor-pointer select-none"
                              onMouseEnter={handleEnter}
                              onClick={() => setSelectedCadEntity(ent)}
                            >
                              {txt}
                            </text>
                          );
                        }

                        if (ent.type === "INSERT" && coords.center) {
                          return (
                            <g
                              key={ent.id || idx}
                              transform={`translate(${toSvgX(coords.center[0])}, ${toSvgY(coords.center[1])})`}
                              className="cursor-pointer group"
                              onMouseEnter={handleEnter}
                              onClick={() => setSelectedCadEntity(ent)}
                            >
                              <rect
                                x="-10"
                                y="-10"
                                width="20"
                                height="20"
                                fill={strokeColor}
                                fillOpacity="0.25"
                                stroke={isHovered ? "#fbbf24" : strokeColor}
                                strokeWidth={isSelected ? 2.5 : 1.5}
                                rx="3"
                              />
                              <text
                                x="0"
                                y="3"
                                fill="#f4f4f5"
                                fontSize="7"
                                fontWeight="bold"
                                textAnchor="middle"
                                fontFamily="monospace"
                              >
                                {ent.blockName?.replace(/^BLK_|^BLOCK_/, "").slice(0, 4) || "BLK"}
                              </text>
                            </g>
                          );
                        }

                        return null;
                      })
                    ) : (
                      <g>
                        <text
                          x={svgW / 2}
                          y={svgH / 2 - 30}
                          fill="#a1a1aa"
                          textAnchor="middle"
                          fontSize="14"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          Chưa có bản vẽ nào được nạp
                        </text>
                        <text
                          x={svgW / 2}
                          y={svgH / 2}
                          fill="#71717a"
                          textAnchor="middle"
                          fontSize="11"
                          fontFamily="monospace"
                        >
                          Tải lên file .DWG / .DXF hoặc chọn bản vẽ từ dự án để bắt đầu
                        </text>
                        <text
                          x={svgW / 2}
                          y={svgH / 2 + 22}
                          fill="#52525b"
                          textAnchor="middle"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          Nhận: DXF mọi phiên bản (ASCII lẫn nhị phân), PDF — xuất ra DXF chuẩn
                          AutoCAD 2000
                        </text>
                      </g>
                    )}

                    {/* Visual Defect Highlights (When Enabled) */}
                    {showDefectsHighlight && !purgeState.isPurged && (
                      <g className="animate-pulse">
                        <rect
                          x={offX + 40}
                          y={offY + 30}
                          width={120}
                          height={60}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                        <text
                          x={offX + 100}
                          y={offY + 22}
                          fill="#f43f5e"
                          fontSize="8"
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          ⚠ Nét Trùng Đè ({purgeState.overlappingCount || 142})
                        </text>
                      </g>
                    )}
                  </g>
                );
              })()}
            </svg>

            {/* Viewport Floating Legend (Dynamic from Drawing Layers) */}
            <div className="absolute bottom-2 left-2 p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-xs flex items-center gap-3 text-[10px] font-mono text-zinc-300 pointer-events-none flex-wrap max-w-full">
              {(dxfData?.layers || []).slice(0, 5).map((layer) => (
                <span key={layer.name} className="flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{
                      backgroundColor: layer.colorHex || ACI_TO_HEX[layer.colorNumber] || "#a1a1aa",
                    }}
                  />
                  <span className="truncate max-w-[90px]">{layer.name}</span>
                </span>
              ))}
              {(dxfData?.layers?.length || 0) > 5 && (
                <span className="text-zinc-500 font-bold">
                  +{(dxfData?.layers?.length || 0) - 5} layers
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column (Col 4): 6D Health Scorecard & Dynamic Layer Switcher ── */}
        <div className="lg:col-span-4 space-y-3">
          {/* 6D CAD Health Index Card */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Award className="w-4 h-4" />
                <span>Chỉ Số Sức Khỏe CAD (6D Health)</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  totalHealthScore >= 90
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                {totalHealthScore >= 90 ? "Hạng A+ (Đạt Chuẩn)" : "Hạng B (Cần Sửa)"}
              </span>
            </div>

            {/* Big Score Meter */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800/80">
              <div className="space-y-0.5">
                <div className="text-[11px] text-zinc-400">Tổng điểm kỹ thuật:</div>
                <div className="text-2xl font-black font-mono tracking-tight text-zinc-100 flex items-baseline gap-1">
                  <span className={totalHealthScore >= 90 ? "text-emerald-400" : "text-amber-400"}>
                    {totalHealthScore}
                  </span>
                  <span className="text-xs text-zinc-500 font-normal">/ 100</span>
                </div>
              </div>

              <div className="text-right text-[11px] text-zinc-400 space-y-0.5">
                <div>Trạng thái Gate 0:</div>
                <div className="font-bold text-emerald-400 font-mono">
                  {totalHealthScore >= 90 ? "SẴN SÀNG DUYỆT ✓" : "CHỜ CHỮA LÀNH ⏳"}
                </div>
              </div>
            </div>

            {/* 6D Sub-Scores Progress Bars */}
            <div className="space-y-2 text-xs">
              {/* Metric 1: Layer AIA */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>1. Chuẩn hóa Layer AIA / BS1192</span>
                  <span className="font-mono font-bold text-emerald-400">{layerScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${layerScore}%` }}
                  />
                </div>
              </div>

              {/* Metric 2: Font UTF-8 */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>2. Bác Sĩ Font Unicode UTF-8</span>
                  <span className="font-mono font-bold text-emerald-400">{fontScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${fontScore}%` }}
                  />
                </div>
              </div>

              {/* Metric 3: WCS & Purge */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>3. Gốc WCS (0,0,0) & Dọn Nét Rác</span>
                  <span className="font-mono font-bold text-emerald-400">{geometryScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${geometryScore}%` }}
                  />
                </div>
              </div>

              {/* Metric 4: Dim Measurement */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>4. Kích Thước Số Đo Thực (Dim)</span>
                  <span className="font-mono font-bold text-emerald-400">{dimScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${dimScore}%` }}
                  />
                </div>
              </div>

              {/* Metric 5: Block BOQ */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>5. Định Danh Block Thiết Bị BOQ</span>
                  <span className="font-mono font-bold text-emerald-400">{blockScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${blockScore}%` }}
                  />
                </div>
              </div>

              {/* Metric 6: XREF & Reference */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>6. Cây Liên Kết XREF & Cấu Trúc File 2D</span>
                  <span className="font-mono font-bold text-emerald-400">{xrefScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${xrefScore}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Layer Visibility Controller Box */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300 pb-1 border-b border-zinc-800/80">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Bộ Lọc Hiển Thị Layer ({dxfData?.layers?.length || 0})</span>
              </span>
              <button
                onClick={() => {
                  const allOn = (dxfData?.layers || []).every(
                    (l) => visibleLayers[l.name] !== false,
                  );
                  const next: Record<string, boolean> = {};
                  (dxfData?.layers || []).forEach((l) => {
                    next[l.name] = !allOn;
                    if (l.standardName) next[l.standardName] = !allOn;
                  });
                  setVisibleLayers(next);
                }}
                className="text-[10px] text-amber-400 hover:underline font-mono"
              >
                Bật/Tắt tất cả
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1 text-[11px]">
              {(dxfData?.layers || []).map((l) => {
                const isVis = visibleLayers[l.name] ?? visibleLayers[l.standardName] ?? true;
                const color = l.colorHex || ACI_TO_HEX[l.colorNumber] || "#a1a1aa";
                return (
                  <button
                    key={l.name}
                    onClick={() => toggleLayerVisibility(l.name)}
                    className={`flex items-center justify-between px-2 py-1 rounded text-left transition ${
                      isVis
                        ? "bg-zinc-900 text-zinc-200 border border-zinc-800"
                        : "bg-zinc-950/60 text-zinc-600 line-through border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate font-mono text-[10px]">{l.name}</span>
                      <span className="text-[9px] font-mono text-zinc-500">({l.entityCount})</span>
                    </div>
                    {isVis ? (
                      <Eye className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-zinc-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
