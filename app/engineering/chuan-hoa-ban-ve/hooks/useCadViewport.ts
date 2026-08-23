"use client";

import { useCallback, useState } from "react";
import type { DxfEntityRaw, DxfLayerInfo } from "@/lib/ky-thuat/cad/dxf-parser";
import type { HoveredCadEntity } from "../types";

// Khung nhìn vector CAD 2D: zoom/pan, con trỏ WCS, thực thể đang chọn/hover
// và bảng bật-tắt hiển thị từng layer.
export function useCadViewport() {
  const [canvasZoom, setCanvasZoom] = useState(1.0);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [cursorWcsCoords, setCursorWcsCoords] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [selectedCadEntity, setSelectedCadEntity] = useState<DxfEntityRaw | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    "M-DUCT-SUPP": true,
    "M-DUCT-RETN": true,
    "P-PIPE-SANR": true,
    "E-CABL-TRAY": true,
    "F-SPRN-PIPE": true,
    "A-WALL-GRID": true,
    "G-ANNO-DIMS": true,
    "G-ANNO-TEXT": true,
    DEFPOINTS: false,
  });
  const [showDefectsHighlight, setShowDefectsHighlight] = useState(true);
  const [comparisonMode, setComparisonMode] = useState<"normal" | "split_diff">("normal");
  const [splitSliderPct, setSplitSliderPct] = useState(50);
  const [hoveredCadEntity, setHoveredCadEntity] = useState<HoveredCadEntity | null>(null);

  const toggleLayerVisibility = useCallback((layerKey: string) => {
    setVisibleLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  }, []);

  // Gọi thẳng trong luồng parse DXF (không tách ra effect riêng) để giữ nguyên
  // thứ tự cập nhật state như khi còn gộp trong page.tsx.
  const initVisibleLayersFromDxf = useCallback((layers: DxfLayerInfo[]) => {
    const newVisible: Record<string, boolean> = {};
    layers.forEach((l) => {
      newVisible[l.name] = true;
      if (l.standardName) newVisible[l.standardName] = true;
    });
    setVisibleLayers(newVisible);
  }, []);

  return {
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
    comparisonMode,
    setComparisonMode,
    splitSliderPct,
    setSplitSliderPct,
    hoveredCadEntity,
    setHoveredCadEntity,
    toggleLayerVisibility,
    initVisibleLayersFromDxf,
  };
}
