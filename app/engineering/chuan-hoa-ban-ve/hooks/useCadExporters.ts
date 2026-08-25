"use client";

import { showToast } from "@/app/components/Toast";
import { exportDxf, DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";
import type { ConversionInfo, SaveConfig, WcsConfig } from "../types";
import { cleanVal } from "./useSmartNaming";

interface CadHealthScores {
  layerScore: number;
  fontScore: number;
  geometryScore: number;
  dimScore: number;
  blockScore: number;
  xrefScore: number;
  totalHealthScore: number;
}

interface CadModelCounts {
  layersCount: number;
  textCount: number;
  blocksCount: number;
  dimsCount: number;
}

interface UseCadExportersOptions {
  dxfData: DxfParseResult | null;
  conversionInfo: ConversionInfo | null;
  saveConfig: SaveConfig;
  generatedFileName: string;
  wcsConfig: WcsConfig;
  scores: CadHealthScores;
  counts: CadModelCounts;
}

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Các thao tác xuất tệp dựa trên tên chuẩn ISO 19650 đã sinh: DXF đã chuyển đổi,
// DXF đặt tên chuẩn và trọn bộ gói Master Bundle.
export function useCadExporters({
  dxfData,
  conversionInfo,
  saveConfig,
  generatedFileName,
  wcsConfig,
  scores,
  counts,
}: UseCadExportersOptions) {
  const handleDownloadConvertedDxf = () => {
    const content =
      (dxfData ? exportDxf(dxfData, { applyStandardLayers: true }) : conversionInfo?.dxfContent) ||
      "";
    // Chưa nạp bản vẽ thì báo rõ, KHÔNG tải về bản vẽ MEPF mẫu do máy sinh dưới tên tệp của
    // người dùng (M98/M99 — không bịa dữ liệu).
    if (!content || content.length < 50) {
      showToast(
        "⚠️ Chưa có bản vẽ nào được nạp — hãy tải lên tệp DXF trước khi xuất tệp.",
        "warning",
      );
      return;
    }
    const targetFileName = conversionInfo?.dxfFileName || generatedFileName;
    downloadTextFile(content, targetFileName, "application/dxf;charset=utf-8");
    showToast(`✓ Đã tải về tệp tin AutoCAD DXF ${targetFileName}!`);
  };

  const handleDownloadStandardizedNamedDxf = () => {
    if (!dxfData || !dxfData.entities || dxfData.entities.length === 0) {
      showToast(
        "⚠️ Chưa có bản vẽ nào được nạp — hãy tải lên tệp DXF trước khi xuất tệp.",
        "warning",
      );
      return;
    }
    const content = exportDxf(dxfData, { applyStandardLayers: true });
    downloadTextFile(content, generatedFileName, "application/dxf;charset=utf-8");
    showToast(`✓ Đã tải xuống file AutoCAD DXF: ${generatedFileName}`);
  };

  const handleDownloadMasterBundle = () => {
    let bundle = `;; ==========================================================================\n`;
    bundle += `;; XBOSS CAD 2D MASTER AUTOMATION BUNDLE — ISO 19650 / TCVN STANDARDS\n`;
    bundle += `;; File: ${generatedFileName}\n`;
    bundle += `;; Generated at: ${new Date().toISOString()}\n`;
    bundle += `;; Health Index: ${scores.totalHealthScore}/100 (ISO 19650)\n`;
    bundle += `;; ==========================================================================\n\n`;

    bundle += `;; 1. PLOT STYLE TABLE (.CTB)\n`;
    bundle += `Color_1: 0.50mm Color_2: 0.35mm Color_3: 0.25mm Color_4: 0.18mm Color_7: 0.18mm Color_8: 0.09mm\n`;
    bundle += `\n;; 2. BÁO CÁO CHẨN ĐOÁN & THÔNG SỐ CHUẨN HÓA 2D (JSON)\n`;
    bundle += JSON.stringify(
      {
        standardFileName: generatedFileName,
        projectCode: saveConfig.projectCode,
        systems: saveConfig.systems,
        workPackageCode: saveConfig.workPackageCode,
        totalHealthScore: scores.totalHealthScore,
        layerScore: scores.layerScore,
        fontScore: scores.fontScore,
        geometryScore: scores.geometryScore,
        dimScore: scores.dimScore,
        blockScore: scores.blockScore,
        xrefScore: scores.xrefScore,
        wcsCoordinates: {
          originX: wcsConfig.originX,
          originY: wcsConfig.originY,
          unit: wcsConfig.unit,
          scale: wcsConfig.scale,
        },
        layersCount: counts.layersCount,
        textCount: counts.textCount,
        blocksCount: counts.blocksCount,
        dimsCount: counts.dimsCount,
      },
      null,
      2,
    );

    downloadTextFile(
      bundle,
      `XBOSS_2D_MASTER_BUNDLE_${cleanVal(saveConfig.projectCode)}_${cleanVal(saveConfig.systems)}.txt`,
      "text/plain;charset=utf-8",
    );
    showToast("✓ Đã tải xuống Trọn Bộ Gói Chuẩn Hóa CAD 2D Master Bundle!");
  };

  return {
    handleDownloadConvertedDxf,
    handleDownloadStandardizedNamedDxf,
    handleDownloadMasterBundle,
  };
}
