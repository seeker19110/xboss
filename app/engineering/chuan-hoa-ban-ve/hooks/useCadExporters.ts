"use client";

import { showToast } from "@/app/components/Toast";
import { parseDxf, exportDxf, DxfParseResult, generateStandard2dDxf } from "@/lib/cad/dxf-parser";
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
  scrScript: string;
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
  scrScript,
  saveConfig,
  generatedFileName,
  wcsConfig,
  scores,
  counts,
}: UseCadExportersOptions) {
  const handleDownloadConvertedDxf = () => {
    let content =
      (dxfData ? exportDxf(dxfData, { applyStandardLayers: true }) : conversionInfo?.dxfContent) ||
      "";
    if (!content || content.length < 50) {
      const sampleParsed = parseDxf(
        generateStandard2dDxf(saveConfig.name, saveConfig.systems),
        generatedFileName,
      );
      content = exportDxf(sampleParsed, { applyStandardLayers: true });
    }
    const targetFileName = conversionInfo?.dxfFileName || generatedFileName;
    downloadTextFile(content, targetFileName, "application/dxf;charset=utf-8");
    showToast(`✓ Đã tải về tệp tin AutoCAD DXF ${targetFileName}!`);
  };

  const handleDownloadStandardizedNamedDxf = () => {
    let content = "";
    if (dxfData && dxfData.entities && dxfData.entities.length > 0) {
      content = exportDxf(dxfData, { applyStandardLayers: true });
    } else {
      const sampleParsed = parseDxf(
        generateStandard2dDxf(saveConfig.name, saveConfig.systems),
        generatedFileName,
      );
      content = exportDxf(sampleParsed, { applyStandardLayers: true });
    }
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

    bundle += `;; 1. AUTOCAD LAYER SCRIPT (.SCR)\n`;
    bundle += scrScript || ";; Layer standardize script\n";
    bundle += `\n;; 2. AUTOLISP TOOLS 2D (.LSP)\n`;
    bundle += `(defun c:XBOSS_2D () (princ "\\nXBOSS CAD 2D Automation Active.") (princ))\n`;
    bundle += `\n;; 3. PLOT STYLE TABLE (.CTB)\n`;
    bundle += `Color_1: 0.50mm Color_2: 0.35mm Color_3: 0.25mm Color_4: 0.18mm Color_7: 0.18mm Color_8: 0.09mm\n`;
    bundle += `\n;; 4. BÁO CÁO CHẨN ĐOÁN & THÔNG SỐ CHUẨN HÓA 2D (JSON)\n`;
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
