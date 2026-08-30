"use client";

import { useCallback, useState } from "react";
import { todayISO } from "@/lib/nen/date";
import { showToast } from "@/app/components/Toast";
import { exportDxf, DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";
import type { ConversionInfo, SaveConfig, SavedResult } from "../types";

// Chuẩn hóa từng thành phần tên tệp về ASCII an toàn cho hệ thống tệp.
export function cleanVal(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface UseSmartNamingOptions {
  dxfData: DxfParseResult | null;
  conversionInfo: ConversionInfo | null;
  is2dApproved: boolean;
  approverName: string;
  reviewerRemarks: string;
}

// Đặt tên chuẩn ISO 19650 & lưu trữ vào cây thư mục drawings/ của dự án.
export function useSmartNaming({
  dxfData,
  conversionInfo,
  is2dApproved,
  approverName,
  reviewerRemarks,
}: UseSmartNamingOptions) {
  const [saveConfig, setSaveConfig] = useState<SaveConfig>({
    projectCode: "PRJ01",
    systems: "HVAC",
    workPackageCode: "WP-MEPF-01",
    kind: "design",
    subFolder: "iso",
    name: "Mat_Bang_Cap_Gio_Tang_4",
    date: todayISO().replace(/-/g, ""),
    drawingVersions: "Rev01",
  });
  const [savingToServer, setSavingToServer] = useState(false);
  const [savedResult, setSavedResult] = useState<SavedResult | null>(null);

  const computedKindTag =
    saveConfig.kind === "design"
      ? `DESIGN-${saveConfig.subFolder.toUpperCase()}`
      : saveConfig.kind.toUpperCase();

  const generatedFileName = `${cleanVal(saveConfig.projectCode)}_${cleanVal(saveConfig.workPackageCode)}_${cleanVal(saveConfig.systems)}_${computedKindTag}_${cleanVal(saveConfig.name)}_${cleanVal(saveConfig.date)}_${cleanVal(saveConfig.drawingVersions)}.dxf`;

  const targetFolderDisplay = is2dApproved
    ? saveConfig.kind === "design"
      ? `drawings/${saveConfig.systems}/design/${saveConfig.subFolder}/`
      : `drawings/${saveConfig.systems}/${saveConfig.kind}/`
    : `drawings/${saveConfig.systems}/temp/`;

  // Lấy tên tệp thật của bản vẽ vừa nạp làm tên mặc định khi lưu trữ.
  const applyDrawingFileName = useCallback((fileName: string) => {
    setSaveConfig((prev) => ({
      ...prev,
      name: fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_"),
    }));
  }, []);

  const handleSaveToProjectServer = async (overrideApproved?: boolean) => {
    const finalApproved = overrideApproved !== undefined ? overrideApproved : is2dApproved;
    setSavingToServer(true);
    try {
      const realDxf = dxfData
        ? exportDxf(dxfData, { applyStandardLayers: true })
        : conversionInfo?.dxfContent;
      // Chưa nạp bản vẽ thì dừng: lưu bản vẽ mẫu do máy sinh vào kho bản vẽ dự án dưới tên tệp
      // chuẩn ISO 19650 là đưa dữ liệu bịa vào hồ sơ nghiệm thu (M98/M99).
      if (!realDxf || realDxf.length < 50) {
        showToast(
          "⚠️ Chưa có bản vẽ nào được nạp — hãy tải lên tệp DXF trước khi lưu lên máy chủ.",
          "warning",
        );
        return;
      }
      const res = await fetch("/api/engineering/cad/save-drawing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectCode: saveConfig.projectCode,
          systems: saveConfig.systems,
          workPackageCode: saveConfig.workPackageCode,
          kind: saveConfig.kind,
          subFolder: saveConfig.subFolder,
          name: saveConfig.name,
          date: saveConfig.date,
          drawingVersions: saveConfig.drawingVersions,
          fileContent: realDxf,
          fileExtension: "dxf",
          isApproved: finalApproved,
          approverName,
          approvalNotes: reviewerRemarks,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedResult(data);
        showToast(
          data.message ||
            `✓ Đã lưu thành công vào: ${data.relativeDirectory}/${data.standardFileName}`,
        );
      } else {
        const err = await res.json();
        showToast(`❌ Lỗi: ${err.error || "Không thể lưu"}`, "error");
      }
    } catch (e: any) {
      showToast(`❌ Lỗi kết nối: ${e.message}`, "error");
    } finally {
      setSavingToServer(false);
    }
  };

  return {
    saveConfig,
    setSaveConfig,
    savingToServer,
    savedResult,
    generatedFileName,
    targetFolderDisplay,
    applyDrawingFileName,
    handleSaveToProjectServer,
  };
}
