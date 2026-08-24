"use client";

import type { DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";
import { extractLineSegments } from "./useCadStandardization";
import type {
  DimOverrideItem,
  ManualBlockItem,
  ManualLayerItem,
  ManualTextItem,
  PurgeState,
} from "../types";

interface UseCadHealthScoreOptions {
  dxfData: DxfParseResult | null;
  manualLayers: ManualLayerItem[];
  manualTexts: ManualTextItem[];
  manualBlocks: ManualBlockItem[];
  dimOverrides: DimOverrideItem[];
  purgeState: PurgeState;
}

// Bảng điểm sức khỏe 6D của bản vẽ — tính hoàn toàn từ dữ liệu thật đã parse
// (chống ảo giác: không có bản vẽ thì mọi điểm bằng 0).
export function useCadHealthScore({
  dxfData,
  manualLayers,
  manualTexts,
  manualBlocks,
  dimOverrides,
  purgeState,
}: UseCadHealthScoreOptions) {
  const hasRealData = !!dxfData && dxfData.entities.length > 0;

  const layerScore =
    hasRealData && manualLayers.length > 0
      ? Math.round(
          (manualLayers.filter(
            (l) =>
              l.standardName.startsWith("M-") ||
              l.standardName.startsWith("E-") ||
              l.standardName.startsWith("P-") ||
              l.standardName.startsWith("F-") ||
              l.standardName.startsWith("ELV-") ||
              l.standardName.startsWith("A-") ||
              l.standardName.startsWith("S-") ||
              l.standardName.startsWith("G-"),
          ).length /
            manualLayers.length) *
            100,
        )
      : hasRealData
        ? 100
        : 0;

  const corruptedCount = manualTexts.filter(
    (t) => t.raw !== t.decoded && t.edited === t.raw,
  ).length;
  const fontScore =
    hasRealData && manualTexts.length > 0
      ? Math.round(((manualTexts.length - corruptedCount) / manualTexts.length) * 100)
      : hasRealData
        ? 100
        : 0;

  // Phạt theo TỶ LỆ lỗi trên tổng số ĐOẠN (không phải tổng số thực thể — 1 polyline nhiều
  // đỉnh là 1 thực thể nhưng hàng chục đoạn, dùng entity count làm mẫu số phạt sai đơn vị,
  // đã đo thấy trên bản vẽ MEPF thật) thay vì số điểm cố định/lỗi — công thức cũ trừ cứng
  // 5 điểm mỗi lỗi nên bản vẽ vài chục nghìn thực thể chỉ cần ~16 lỗi (dưới 0.1%) đã rơi
  // thẳng xuống sàn, không phân biệt được "hơi bẩn" với "rất bẩn". `isPurged` không còn ép
  // cứng về 100 vì đa tuyến trùng đè một phần có thể vẫn còn sau khi dọn (xem handleRunDeepPurge).
  const totalSegmentCount = dxfData ? extractLineSegments(dxfData.entities).length : 0;
  const dirtyCount = purgeState.overlappingCount + purgeState.zeroLengthCount;
  const geometryScore = hasRealData
    ? totalSegmentCount > 0
      ? Math.max(0, Math.round(100 - (dirtyCount / totalSegmentCount) * 100 * 20))
      : 100
    : 0;

  const dimScore =
    hasRealData && dimOverrides.length > 0
      ? Math.round((dimOverrides.filter((d) => d.fixed).length / dimOverrides.length) * 100)
      : hasRealData
        ? 100
        : 0;

  const blockScore =
    hasRealData && manualBlocks.length > 0
      ? Math.round(
          (manualBlocks.filter((b) => !!b.mappedBoqCode).length / manualBlocks.length) * 100,
        )
      : hasRealData
        ? 100
        : 0;

  const xrefScore =
    hasRealData && (dxfData?.xrefs?.length || 0) > 0
      ? Math.round(
          (dxfData!.xrefs.filter((x) => x.isBound || x.status === "resolved").length /
            dxfData!.xrefs.length) *
            100,
        )
      : hasRealData
        ? 100
        : 0;

  const totalHealthScore = hasRealData
    ? Math.round(
        layerScore * 0.25 +
          fontScore * 0.2 +
          geometryScore * 0.2 +
          dimScore * 0.15 +
          blockScore * 0.1 +
          xrefScore * 0.1,
      )
    : 0;

  return {
    hasRealData,
    layerScore,
    fontScore,
    geometryScore,
    dimScore,
    blockScore,
    xrefScore,
    totalHealthScore,
  };
}
