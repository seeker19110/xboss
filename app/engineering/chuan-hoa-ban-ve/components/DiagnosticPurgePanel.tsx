"use client";

import { Dispatch, SetStateAction } from "react";
import { Download, ArrowRight, CheckCircle2, Activity, Trash2, Crosshair } from "lucide-react";
import { DxfParseResult } from "@/lib/cad/dxf-parser";
import type { ManualLayerItem, PurgeState, Step1SubTab, WcsConfig } from "../types";

// BƯỚC 1.1 — Chẩn đoán dị tật, dọn rác sâu (Purge/Overkill) & gốc tọa độ WCS 2D.

interface DiagnosticPurgePanelProps {
  setStep1SubTab: Dispatch<SetStateAction<Step1SubTab>>;
  dxfData: DxfParseResult | null;
  manualLayers: ManualLayerItem[];
  purgeState: PurgeState;
  wcsConfig: WcsConfig;
  setWcsConfig: Dispatch<SetStateAction<WcsConfig>>;
  handleRunDeepPurge: () => void;
  handleAlignWcsOrigin: () => void;
  hasRealData: boolean;
  totalHealthScore: number;
  handleDownloadScr: () => void;
}

export default function DiagnosticPurgePanel({
  setStep1SubTab,
  dxfData,
  manualLayers,
  purgeState,
  wcsConfig,
  setWcsConfig,
  handleRunDeepPurge,
  handleAlignWcsOrigin,
  hasRealData,
  totalHealthScore,
  handleDownloadScr,
}: DiagnosticPurgePanelProps) {
  return (
    <div className="space-y-5">
      {/* Phân đoạn 1.1: Chẩn đoán & Health Score */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Báo Cáo Chẩn Đoán Dị Tật Bản Vẽ CAD ({dxfData?.fileName || "DXF Model"})
            </h2>
            <p className="text-xs text-zinc-400">
              Tự động phân tích toàn bộ thực thể CAD, phát hiện lỗi font SHX/TCVN3, layer rác, kiểm
              tra tỷ lệ chuẩn AIA và sự sẵn sàng cho đùn 3D BIM.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadScr}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Kịch Bản .SCR</span>
            </button>
          </div>
        </div>

        {/* Health Score & Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-1">
            <span className="text-[11px] text-zinc-400">Điểm Chuẩn Hóa CAD</span>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {hasRealData ? (dxfData?.diagnostic?.healthScore ?? totalHealthScore) : 0} / 100
            </div>
            <span className="text-[10px] text-emerald-400">
              {hasRealData
                ? totalHealthScore >= 80
                  ? "Đủ điều kiện dựng 3D"
                  : "Cần hoàn thiện chuẩn hóa"
                : "Chưa nạp bản vẽ"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Tổng Thực Thể (Entities)</span>
            <div className="text-2xl font-bold font-mono text-zinc-200">
              {hasRealData
                ? (dxfData?.diagnostic?.totalEntities ?? dxfData?.entities.length ?? 0)
                : 0}
            </div>
            <span className="text-[10px] text-zinc-400">Line, Polyline, Text, Block</span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Layer Chuẩn AIA</span>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {hasRealData
                ? (dxfData?.diagnostic?.standardLayersCount ??
                  manualLayers.filter(
                    (l) =>
                      l.standardName.startsWith("M-") ||
                      l.standardName.startsWith("E-") ||
                      l.standardName.startsWith("P-") ||
                      l.standardName.startsWith("F-"),
                  ).length)
                : 0}{" "}
              / {hasRealData ? (dxfData?.diagnostic?.totalLayers ?? manualLayers.length) : 0}
            </div>
            <span className="text-[10px] text-zinc-400">Đã map phân hệ MEPF</span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Text Lỗi Font / Mã Cũ</span>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {hasRealData ? (dxfData?.diagnostic?.corruptedTextCount ?? 0) : 0}
            </div>
            <span className="text-[10px] text-zinc-400">
              {hasRealData ? "TCVN3 / VNI detected" : "—"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-400">Kích Thước Bao Bản Vẽ</span>
            <div className="text-xs font-bold font-mono text-sky-400 pt-1">
              {hasRealData && dxfData?.diagnostic?.boundingDimensions
                ? `${(dxfData.diagnostic.boundingDimensions.widthMm / 1000).toFixed(1)}m × ${(dxfData.diagnostic.boundingDimensions.lengthMm / 1000).toFixed(1)}m`
                : "—"}
            </div>
            <span className="text-[10px] text-zinc-400">
              {hasRealData ? "Tọa độ WCS thực tế" : "Chưa xác định"}
            </span>
          </div>
        </div>

        {/* Recommendations & Action list */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Khuyến Nghị Xử Lý Kỹ Thuật Tự Động</span>
          </h3>
          <ul className="space-y-1 text-xs text-zinc-300">
            {hasRealData &&
            dxfData?.diagnostic?.recommendations &&
            dxfData.diagnostic.recommendations.length > 0 ? (
              dxfData.diagnostic.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>{rec}</span>
                </li>
              ))
            ) : (
              <li className="flex items-start gap-2 text-zinc-500">
                <span>
                  • Vui lòng tải lên hoặc chọn bản vẽ CAD thật để hệ thống tự động chẩn đoán và đưa
                  ra khuyến nghị.
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Phân đoạn 1.2: Dọn rác sâu (Deep Purge & Overkill) & WCS Normalizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Cột Trái: Deep Purge & Overkill Engine */}
        <div className="lg:col-span-6 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-amber-400" />
                Động Cơ Dọn Rác Sâu (Deep Purge & Overkill)
              </h2>
              <p className="text-xs text-zinc-400">
                Tự động gộp các nét vẽ trùng đè, xóa nét mồ côi 0mm và purge triệt để block vô danh
                rác.
              </p>
            </div>
            {purgeState.isPurged ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono flex items-center gap-1 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã Tối Ưu
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold font-mono border border-amber-500/30">
                Cần Dọn Rác
              </span>
            )}
          </div>

          {/* Thống kê rác phát hiện */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-[11px] text-zinc-400">Nét Trùng Đè (Overlapping)</div>
              <div className="text-sm font-bold font-mono text-amber-400">
                {purgeState.overlappingCount} nét
              </div>
              <p className="text-[10px] text-zinc-500">Tự động hàn gộp thành 1 polyline</p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-[11px] text-zinc-400">Nét Mồ Côi Độ Dài 0 (Zero-Length)</div>
              <div className="text-sm font-bold font-mono text-rose-400">
                {purgeState.zeroLengthCount} đối tượng
              </div>
              <p className="text-[10px] text-zinc-500">Xóa bỏ hoàn toàn rác đồ họa</p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-[11px] text-zinc-400">Block Vô Danh Rác (*U...)</div>
              <div className="text-sm font-bold font-mono text-sky-400">
                {purgeState.anonymousBlocksCount} blocks
              </div>
              <p className="text-[10px] text-zinc-500">Purge sạch unreferenced definitions</p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-[11px] text-zinc-400">Layer Trống Rác (Empty Layers)</div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                {purgeState.emptyLayersCount} layers
              </div>
              <p className="text-[10px] text-zinc-500">Loại bỏ khỏi bảng quản lý layer</p>
            </div>
          </div>

          {/* Tối ưu dung lượng */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-zinc-400 block">Dung Lượng Bản Vẽ:</span>
              <span className="text-xs font-mono font-bold text-zinc-200">
                {purgeState.originalSizeMb} MB →{" "}
                <span className="text-emerald-400">{purgeState.purgedSizeMb} MB</span>
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
              Tiết kiệm 90.1% dung lượng
            </span>
          </div>

          <button
            onClick={handleRunDeepPurge}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Kích Hoạt Thuật Toán Deep Purge & Overkill</span>
          </button>
        </div>

        {/* Cột Phải: World Coordinate System (WCS) 2D & Scale Normalizer */}
        <div className="lg:col-span-6 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-sky-400" />
                Căn Chỉnh Gốc Tọa Độ WCS 2D (X, Y) & Tỷ Lệ Đơn Vị Bản Vẽ
              </h2>
              <p className="text-xs text-zinc-400">
                Đưa gốc tọa độ 2D (X:0, Y:0) về đúng tim giao trục chính A-1 và chuẩn hóa đơn vị 1
                Unit = 1 mm để bản vẽ kỹ thuật đạt độ chính xác hình học tuyệt đối.
              </p>
            </div>
            {wcsConfig.isAligned ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono flex items-center gap-1 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã Khóa WCS 2D
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold font-mono border border-amber-500/30">
                Chưa Căn Gốc
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">
                Mốc Tim Trục Tọa Độ Gốc Công Trình (Base Point Reference):
              </label>
              <input
                type="text"
                aria-label="Mốc tim trục tọa độ gốc công trình"
                value={wcsConfig.gridAxisReference}
                onChange={(e) =>
                  setWcsConfig((prev) => ({ ...prev, gridAxisReference: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Tọa Độ Gốc X (mm)</label>
                <input
                  type="number"
                  aria-label="Tọa độ gốc X (mm)"
                  value={wcsConfig.originX}
                  onChange={(e) =>
                    setWcsConfig((prev) => ({ ...prev, originX: Number(e.target.value) }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Tọa Độ Gốc Y (mm)</label>
                <input
                  type="number"
                  aria-label="Tọa độ gốc Y (mm)"
                  value={wcsConfig.originY}
                  onChange={(e) =>
                    setWcsConfig((prev) => ({ ...prev, originY: Number(e.target.value) }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Đơn Vị Vẽ (Units):</label>
                <select
                  aria-label="Đơn vị vẽ"
                  value={wcsConfig.unit}
                  onChange={(e) =>
                    setWcsConfig((prev) => ({ ...prev, unit: e.target.value as any }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
                >
                  <option value="mm">Milimet (1 Unit = 1 mm - Chuẩn Kỹ Thuật)</option>
                  <option value="m">Mét (1 Unit = 1 m - Chuyển về mm)</option>
                  <option value="inch">Inches (Hệ Imperial - Chuyển mm)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Tỷ Lệ Model/Layout:</label>
                <select
                  aria-label="Tỷ lệ model/layout"
                  value={wcsConfig.scale}
                  onChange={(e) =>
                    setWcsConfig((prev) => ({ ...prev, scale: e.target.value as any }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
                >
                  <option value="1:1">Tỷ lệ 1:1 (Không gian Model thực tế)</option>
                  <option value="1:50">Tỷ lệ 1:50 (Mặt bằng chi tiết căn hộ)</option>
                  <option value="1:100">Tỷ lệ 1:100 (Mặt bằng tổng thể tầng)</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={handleAlignWcsOrigin}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Khóa Tọa Độ Chuẩn WCS 2D (X:0, Y:0) Cho Bản Vẽ</span>
          </button>
        </div>
      </div>

      {/* Next Step CTA */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <div className="text-xs text-zinc-300">
          <span className="font-bold text-amber-300">Bước tiếp theo:</span> Chuẩn hóa cây Layer theo
          chuẩn AIA/BS1192 và phục hồi font chữ Tiếng Việt UTF-8.
        </div>
        <button
          onClick={() => setStep1SubTab("layers_font")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs transition"
        >
          <span>Chuyển Sang Mục 2: Layer AIA & Bác Sĩ Font</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
