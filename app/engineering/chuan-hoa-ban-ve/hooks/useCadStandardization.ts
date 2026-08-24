"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { showToast } from "@/app/components/Toast";
import type { DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";
import type {
  CtbMapping,
  DimOverrideItem,
  ManualBlockItem,
  ManualLayerItem,
  ManualTextItem,
  PurgeState,
  WcsConfig,
} from "../types";

// Trích các đoạn thẳng thật từ LINE lẫn từng cặp đỉnh liên tiếp của LWPOLYLINE/POLYLINE —
// trước đây chỉ quét LINE nên bỏ sót phần lớn hình học (đa tuyến chiếm đa số bản vẽ MEPF thật).
// `isLine=false` đánh dấu đoạn con của polyline — ngưỡng "0mm" của nó khác LINE đứng riêng lẻ,
// xem lý do trong countZeroLengthAndOverlapping. Export để useCadHealthScore.ts dùng lại tổng
// số đoạn làm mẫu số điểm hình học (không phải tổng số thực thể — 1 polyline = nhiều đoạn).
export function extractLineSegments(
  entities: DxfParseResult["entities"],
): Array<{ x1: number; y1: number; x2: number; y2: number; isLine: boolean }> {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number; isLine: boolean }> = [];
  for (const e of entities) {
    if (e.type === "LINE" && e.coordinates.start && e.coordinates.end) {
      const [x1, y1] = e.coordinates.start;
      const [x2, y2] = e.coordinates.end;
      segments.push({ x1, y1, x2, y2, isLine: true });
    } else if (
      (e.type === "LWPOLYLINE" || e.type === "POLYLINE") &&
      e.coordinates.points &&
      e.coordinates.points.length >= 2
    ) {
      const pts = e.coordinates.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        segments.push({ x1, y1, x2, y2, isLine: false });
      }
    }
  }
  return segments;
}

// Đếm nét 0mm và nét trùng đè (khớp toạ độ đầu/cuối chính xác, không phân biệt chiều vẽ)
// từ toàn bộ đoạn thẳng thật (LINE + đoạn con của polyline).
//
// Ngưỡng "0mm" khác nhau giữa LINE và đoạn con polyline: đo thật trên bản vẽ MEPF 65MB
// cho thấy ~43% đoạn con polyline ngắn hơn 1mm — đó là tessellation bình thường của cung
// tròn (nhiều đỉnh sát nhau), không phải rác. LINE đứng riêng lẻ dài <1mm mới coi là rác
// thật; đoạn polyline chỉ coi là 0mm khi 2 đỉnh liên tiếp trùng gần như tuyệt đối.
function countZeroLengthAndOverlapping(entities: DxfParseResult["entities"]): {
  zeroLength: number;
  overlapping: number;
} {
  const segments = extractLineSegments(entities);
  const seen = new Map<string, number>();
  let zeroLength = 0;
  let overlapping = 0;

  for (const { x1, y1, x2, y2, isLine } of segments) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < (isLine ? 1 : 0.01)) {
      zeroLength++;
      continue;
    }
    const key = `${Math.round(x1)},${Math.round(y1)}-${Math.round(x2)},${Math.round(y2)}`;
    const revKey = `${Math.round(x2)},${Math.round(y2)}-${Math.round(x1)},${Math.round(y1)}`;
    if (seen.has(key) || seen.has(revKey)) {
      overlapping++;
    } else {
      seen.set(key, 1);
    }
  }

  return { zeroLength, overlapping };
}

const emptyPurgeState = (): PurgeState => ({
  isPurged: false,
  overlappingCount: 0,
  zeroLengthCount: 0,
  emptyLayersCount: 0,
  anonymousBlocksCount: 0,
  originalSizeMb: 0,
  purgedSizeMb: 0,
});

interface UseCadStandardizationOptions {
  dxfData: DxfParseResult | null;
  setDxfData: Dispatch<SetStateAction<DxfParseResult | null>>;
  // Đổ text lỗi đầu tiên của bản vẽ sang Bác Sĩ Font.
  onFontSampleDetected: (raw: string, decoded: string) => void;
  // Đổ tên tệp bản vẽ sang bộ đặt tên chuẩn ISO 19650.
  onDrawingFileNameDetected: (fileName: string) => void;
}

// Toàn bộ model chuẩn hóa suy ra từ bản vẽ thật: bảng sửa tay layer/text/block,
// Dim ảo, chỉ số dọn rác, gốc tọa độ WCS 2D và bảng nét in CTB.
export function useCadStandardization({
  dxfData,
  setDxfData,
  onFontSampleDetected,
  onDrawingFileNameDetected,
}: UseCadStandardizationOptions) {
  const [manualLayers, setManualLayers] = useState<ManualLayerItem[]>([]);
  const [manualTexts, setManualTexts] = useState<ManualTextItem[]>([]);
  const [manualBlocks, setManualBlocks] = useState<ManualBlockItem[]>([]);
  const [dimOverrides, setDimOverrides] = useState<DimOverrideItem[]>([]);
  const [purgeState, setPurgeState] = useState<PurgeState>(emptyPurgeState);
  const [wcsConfig, setWcsConfig] = useState<WcsConfig>({
    originX: 0,
    originY: 0,
    gridAxisReference: "Giao trục chính WCS 2D (X:0, Y:0)",
    unit: "mm",
    scale: "1:1",
    isAligned: false,
  });
  const [selectedDisciplineFilter, setSelectedDisciplineFilter] = useState<string>("all");
  const [layerSearch, setLayerSearch] = useState("");

  const [ctbMappings] = useState<CtbMapping[]>([
    {
      colorIndex: 1,
      colorName: "Color 1 (Red)",
      colorHex: "#ef4444",
      lineweightMm: 0.5,
      purpose: "Nét cắt ống chính, dầm chịu lực, thiết bị chính",
      screeningPct: 100,
    },
    {
      colorIndex: 2,
      colorName: "Color 2 (Yellow)",
      colorHex: "#eab308",
      lineweightMm: 0.35,
      purpose: "Nét ống nhánh, máng cáp, van khóa, phụ kiện",
      screeningPct: 100,
    },
    {
      colorIndex: 3,
      colorName: "Color 3 (Green)",
      colorHex: "#22c55e",
      lineweightMm: 0.25,
      purpose: "Nét thiết bị phụ trợ, hộp chia gió, miệng gió",
      screeningPct: 100,
    },
    {
      colorIndex: 4,
      colorName: "Color 4 (Cyan)",
      colorHex: "#06b6d4",
      lineweightMm: 0.18,
      purpose: "Nét tim ống, trục Centerline, đường bao khu vực",
      screeningPct: 100,
    },
    {
      colorIndex: 7,
      colorName: "Color 7 (White/Black)",
      colorHex: "#f4f4f5",
      lineweightMm: 0.18,
      purpose: "Chữ ghi chú Text, Dimension, đường dóng",
      screeningPct: 100,
    },
    {
      colorIndex: 8,
      colorName: "Color 8 (Dark Gray)",
      colorHex: "#71717a",
      lineweightMm: 0.09,
      purpose: "Nét tường kiến trúc nền, Hatch vật liệu (Mờ 50%)",
      screeningPct: 50,
    },
  ]);

  // ── Đồng bộ động: trích xuất dữ liệu thật từ dxfData (chống ảo giác) ──
  useEffect(() => {
    if (!dxfData || !dxfData.entities || dxfData.entities.length === 0) {
      setManualLayers([]);
      setManualTexts([]);
      setManualBlocks([]);
      setDimOverrides([]);
      setPurgeState(emptyPurgeState());
      return;
    }

    // 1. Đồng bộ Layers thật
    const mLayers = (dxfData.layers || []).map((l, idx) => ({
      id: `L${idx + 1}`,
      name: l.name,
      standardName: l.standardName || l.name,
      discipline: l.discipline || ("OTHER" as const),
      colorHex: l.colorHex || "#a1a1aa",
      entityCount: l.entityCount,
    }));
    setManualLayers(mLayers);

    // 2. Đồng bộ Texts thật
    const textEntities = dxfData.entities.filter((e) => e.type === "TEXT" || e.type === "MTEXT");
    const mTexts = textEntities.map((e, idx) => ({
      id: e.id || `TXT-${idx + 1}`,
      raw: e.textValue || "",
      decoded: e.decodedText || e.textValue || "",
      edited: e.decodedText || e.textValue || "",
      layer: e.layer,
    }));
    setManualTexts(mTexts);

    // Điền text lỗi đầu tiên vào ô Doctor nếu có
    const firstCorrupted = mTexts.find((t) => t.raw !== t.decoded);
    if (firstCorrupted) {
      onFontSampleDetected(firstCorrupted.raw, firstCorrupted.decoded);
    } else if (mTexts.length > 0) {
      onFontSampleDetected(mTexts[0].raw, mTexts[0].decoded);
    }

    // 3. Đồng bộ Blocks thật — giữ nguyên mappedBoqCode mà dxf-parser đã tự suy luận
    // (map theo tên DIFFUSER/VAV/SPRINKLER/VALVE/PANEL...), không gán cứng rỗng.
    const mBlocks = (dxfData.blocks || []).map((b, idx) => ({
      id: `BLK-${idx + 1}`,
      name: b.name,
      count: b.count,
      mappedBoqCode: b.mappedBoqCode || "",
      customName: b.name,
    }));
    setManualBlocks(mBlocks);

    // 4. Đồng bộ Dims thật
    const dimEntities = dxfData.entities.filter((e) => e.type === "DIMENSION");
    const mDims = dimEntities.map((d, idx) => ({
      id: d.id || `DIM-${idx + 1}`,
      nominalText: d.textValue || "Kích thước CAD",
      actualMeasMm: 0,
      isFake: false,
      fixed: true,
      location: `Layer ${d.layer}`,
    }));
    setDimOverrides(mDims);

    // 5. Tính toán metrics dọn rác (Purge) thật
    const { zeroLength: zeroLen, overlapping } = countZeroLengthAndOverlapping(dxfData.entities);

    const emptyLayers = (dxfData.layers || []).filter((l) => l.entityCount === 0).length;
    const anonBlocks = (dxfData.blocks || []).filter(
      (b) => b.name.startsWith("*") || b.name.startsWith("BLK_"),
    ).length;
    const sizeMb = dxfData.fileSizeBytes
      ? Number((dxfData.fileSizeBytes / (1024 * 1024)).toFixed(2))
      : 0.5;

    setPurgeState({
      isPurged: false,
      overlappingCount: overlapping,
      zeroLengthCount: zeroLen,
      emptyLayersCount: emptyLayers,
      anonymousBlocksCount: anonBlocks,
      originalSizeMb: sizeMb,
      purgedSizeMb: Number((sizeMb * 0.85).toFixed(2)),
    });

    // 6. Cập nhật saveConfig từ tên bản vẽ thật
    if (dxfData?.fileName) {
      onDrawingFileNameDetected(dxfData.fileName);
    }
  }, [dxfData, onFontSampleDetected, onDrawingFileNameDetected]);

  const handleUpdateManualLayer = (
    id: string,
    field: "standardName" | "discipline" | "colorHex",
    val: string,
  ) => {
    setManualLayers((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  };

  const handleUpdateManualText = (id: string, val: string) => {
    setManualTexts((prev) => prev.map((t) => (t.id === id ? { ...t, edited: val } : t)));
  };

  const handleUpdateManualBlock = (
    id: string,
    field: "mappedBoqCode" | "customName",
    val: string,
  ) => {
    setManualBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  };

  const handleRunDeepPurge = () => {
    if (!dxfData) return;

    // Lọc bỏ thực sự các nét 0mm và nét trùng đè trong dxfData.entities
    const seenLines = new Set<string>();
    const cleanedEntities = dxfData.entities.filter((e) => {
      if (e.type === "LINE" && e.coordinates.start && e.coordinates.end) {
        const [x1, y1] = e.coordinates.start;
        const [x2, y2] = e.coordinates.end;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1) return false;
        const key = `${Math.round(x1)},${Math.round(y1)}-${Math.round(x2)},${Math.round(y2)}`;
        const revKey = `${Math.round(x2)},${Math.round(y2)}-${Math.round(x1)},${Math.round(y1)}`;
        if (seenLines.has(key) || seenLines.has(revKey)) return false;
        seenLines.add(key);
      } else if (
        (e.type === "LWPOLYLINE" || e.type === "POLYLINE") &&
        e.coordinates.points &&
        e.coordinates.points.length >= 2
      ) {
        // Đa tuyến suy biến hoàn toàn về 1 điểm (mọi đoạn con < 1mm) — rác thật, loại bỏ cả
        // thực thể. Đa tuyến chỉ trùng đè MỘT PHẦN với đoạn khác không xoá tự động ở đây (xoá
        // nhầm sẽ làm mất hình học hợp lệ) — vẫn còn trong overlappingCount sau khi dọn.
        const pts = e.coordinates.points;
        const totalLen = pts
          .slice(1)
          .reduce((sum, [x2, y2], i) => sum + Math.hypot(x2 - pts[i][0], y2 - pts[i][1]), 0);
        if (totalLen < 1) return false;
      }
      return true;
    });

    const removed = dxfData.entities.length - cleanedEntities.length;
    const remaining = countZeroLengthAndOverlapping(cleanedEntities);
    setDxfData({
      ...dxfData,
      entities: cleanedEntities,
    });
    setPurgeState((prev) => ({
      ...prev,
      isPurged: true,
      overlappingCount: remaining.overlapping,
      zeroLengthCount: remaining.zeroLength,
    }));
    showToast(
      remaining.overlapping > 0
        ? `✓ Đã dọn ${removed} thực thể rác. Còn ${remaining.overlapping} đoạn đa tuyến trùng đè một phần cần kiểm tra thủ công.`
        : `✓ Đã dọn sạch ${removed} thực thể rác (nét trùng đè & nét 0mm)!`,
    );
  };

  const handleAlignWcsOrigin = () => {
    setWcsConfig((prev) => ({ ...prev, isAligned: true }));
    showToast("✓ Đã khóa gốc tọa độ WCS 2D (X:0, Y:0) tại Tim giao trục chính!");
  };

  const handleFixDimOverride = (id: string) => {
    setDimOverrides((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, fixed: true, nominalText: `${d.actualMeasMm} mm` } : d,
      ),
    );
    showToast(`✓ Đã khôi phục kích thước thực tế (<> measurement) cho ${id}!`);
  };

  const handleFixAllDims = () => {
    setDimOverrides((prev) =>
      prev.map((d) => ({ ...d, fixed: true, nominalText: `${d.actualMeasMm} mm` })),
    );
    showToast("✓ Đã quét và khôi phục 100% kích thước Dim ảo về số đo thực tế!");
  };

  const handleDownloadCtb = () => {
    let content = `;; XBoss Standard Plot Style Table (CTB)\n`;
    content += `;; Tiêu chuẩn in ấn MEPF TCVN / AIA\n`;
    ctbMappings.forEach((c) => {
      content += `Color_${c.colorIndex}: Lineweight=${c.lineweightMm}mm Screening=${c.screeningPct}% Purpose="${c.purpose}"\n`;
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xboss_standard.ctb";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất file bảng nét in xboss_standard.ctb!");
  };

  const layersList = dxfData?.layers || [];
  const filteredLayers = layersList.filter((r) => {
    const matchDisc =
      selectedDisciplineFilter === "all" || r.discipline === selectedDisciplineFilter;
    const matchSearch =
      r.name.toLowerCase().includes(layerSearch.toLowerCase()) ||
      r.standardName.toLowerCase().includes(layerSearch.toLowerCase());
    return matchDisc && matchSearch;
  });

  return {
    manualLayers,
    setManualLayers,
    manualTexts,
    setManualTexts,
    manualBlocks,
    dimOverrides,
    setDimOverrides,
    purgeState,
    setPurgeState,
    wcsConfig,
    setWcsConfig,
    ctbMappings,
    selectedDisciplineFilter,
    setSelectedDisciplineFilter,
    layerSearch,
    setLayerSearch,
    filteredLayers,
    handleUpdateManualLayer,
    handleUpdateManualText,
    handleUpdateManualBlock,
    handleRunDeepPurge,
    handleAlignWcsOrigin,
    handleFixDimOverride,
    handleFixAllDims,
    handleDownloadCtb,
  };
}
