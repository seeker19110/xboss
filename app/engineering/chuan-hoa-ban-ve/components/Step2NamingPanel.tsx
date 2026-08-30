"use client";

import { Dispatch, SetStateAction } from "react";
import {
  Layers,
  Boxes,
  Download,
  Check,
  FileCheck,
  CheckCircle2,
  ShieldCheck,
  Clock,
  BadgeCheck,
  Edit3,
  Save,
  Folder,
  FolderTree,
} from "lucide-react";
import { DxfLayerInfo } from "@/lib/ky-thuat/cad/dxf-parser";
import type {
  Cad2dApprovalStatus,
  ManualBlockItem,
  ManualLayerItem,
  ManualTextItem,
  SaveConfig,
  SavedResult,
} from "../types";

// BƯỚC 2 — Đặt tên chuẩn ISO 19650, ký duyệt Gate 0 & lưu trữ vào thư mục dự án.

interface Step2NamingPanelProps {
  setCad2dApprovalStatus: Dispatch<SetStateAction<Cad2dApprovalStatus>>;
  approverName: string;
  setApproverName: Dispatch<SetStateAction<string>>;
  approvedAt: string;
  manualLayers: ManualLayerItem[];
  manualTexts: ManualTextItem[];
  manualBlocks: ManualBlockItem[];
  reviewerRemarks: string;
  setReviewerRemarks: Dispatch<SetStateAction<string>>;
  handleUpdateManualLayer: (
    id: string,
    field: "standardName" | "discipline" | "colorHex",
    val: string,
  ) => void;
  handleUpdateManualText: (id: string, val: string) => void;
  handleUpdateManualBlock: (id: string, field: "mappedBoqCode" | "customName", val: string) => void;
  handleSaveManualReview: () => void;
  handleApprove2d: () => void;
  saveConfig: SaveConfig;
  setSaveConfig: Dispatch<SetStateAction<SaveConfig>>;
  savingToServer: boolean;
  savedResult: SavedResult | null;
  generatedFileName: string;
  is2dApproved: boolean;
  targetFolderDisplay: string;
  handleSaveToProjectServer: (overrideApproved?: boolean) => void | Promise<void>;
  handleDownloadStandardizedNamedDxf: () => void;
  handleDownloadMasterBundle: () => void;
}

export default function Step2NamingPanel({
  setCad2dApprovalStatus,
  approverName,
  setApproverName,
  approvedAt,
  manualLayers,
  manualTexts,
  manualBlocks,
  reviewerRemarks,
  setReviewerRemarks,
  handleUpdateManualLayer,
  handleUpdateManualText,
  handleUpdateManualBlock,
  handleSaveManualReview,
  handleApprove2d,
  saveConfig,
  setSaveConfig,
  savingToServer,
  savedResult,
  generatedFileName,
  is2dApproved,
  targetFolderDisplay,
  handleSaveToProjectServer,
  handleDownloadStandardizedNamedDxf,
  handleDownloadMasterBundle,
}: Step2NamingPanelProps) {
  return (
    <div className="space-y-5">
      {/* Trạm Gác Phê Duyệt & Quy Trình Thư Mục Tạm vs Chính Thức */}
      <div
        className={`p-5 rounded-2xl border shadow-sm space-y-4 ${
          is2dApproved
            ? "bg-emerald-950/20 border-emerald-500/40"
            : "bg-zinc-900/90 border-amber-500/30"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`p-2 rounded-xl border ${
                  is2dApproved
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                }`}
              >
                {is2dApproved ? <ShieldCheck className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-zinc-100">
                    {is2dApproved
                      ? "Đã Ghi Nhận Rà Soát Cục Bộ (Lưu Vào Vị Trí Chính Thức)"
                      : "Trạng Thái: Lưu Tạm Thời Chờ Kỹ Sư Trưởng Rà Soát"}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      is2dApproved
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse"
                    }`}
                  >
                    {is2dApproved ? "✓ ĐÃ RÀ SOÁT (CHƯA KÝ DUYỆT)" : "⏳ DRAFT / TEMP STAGING"}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {is2dApproved
                    ? `Đã ghi nhận rà soát cục bộ bởi ${approverName} (${approvedAt}) — CHƯA phải chữ ký duyệt chính thức (ký duyệt/nghiệm thu hồ sơ bản vẽ thực hiện tại sổ bản vẽ /ban-ve). Bản vẽ sẽ lưu vào thư mục chính thức.`
                    : `File sau khi chuẩn hóa sẽ lưu tại thư mục tạm drawings/${saveConfig.systems}/temp/. Sau khi ghi nhận rà soát, hệ thống sẽ lưu vào đúng vị trí và dọn sạch file tạm.`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!is2dApproved ? (
              <button
                onClick={() => {
                  handleApprove2d();
                  handleSaveToProjectServer(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-on-accent-dark font-bold text-xs shadow-md transition"
              >
                <BadgeCheck className="w-4 h-4" />
                <span>Ghi Nhận Rà Soát & Lưu Chính Thức Ngay</span>
              </button>
            ) : (
              <button
                onClick={() => setCad2dApprovalStatus("in_progress")}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
              >
                Mở lại chỉnh sửa
              </button>
            )}
          </div>
        </div>

        {/* Form Người Soát Xét & Nhận Xét */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4 space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Kỹ Sư Trưởng / Người Rà Soát (cục bộ):
            </label>
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
            />
          </div>

          <div className="sm:col-span-8 space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Nhận Xét Thẩm Tra Kỹ Thuật (ghi chú cục bộ, chưa lưu DB):
            </label>
            <input
              type="text"
              value={reviewerRemarks}
              onChange={(e) => setReviewerRemarks(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200"
            />
          </div>
        </div>
      </div>

      {/* Trung Tâm Đặt Tên Chuẩn ISO 19650 & Chọn Thư Mục Máy Chủ */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-sky-500/30 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-sky-400" />
              <span>Quy Chuẩn Đặt Tên & Thư Mục Lưu Trữ Dự Án (ISO 19650)</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Công thức đặt tên tự động:{" "}
              <code className="text-sky-300 font-mono">
                [project_id]_[work_package]_[systems]_[kind]_[name]_[date]_[version].dxf
              </code>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
                is2dApproved
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/30"
              }`}
            >
              {is2dApproved ? "Thư mục chính thức: " : "Thư mục lưu tạm: "}
              {targetFolderDisplay}
            </span>
          </div>
        </div>

        {/* 7 Interactive Selectors for Naming */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
          {/* 1. Project ID */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              1. Mã Dự Án (project_id):
            </label>
            <input
              type="text"
              value={saveConfig.projectCode}
              onChange={(e) => setSaveConfig({ ...saveConfig, projectCode: e.target.value })}
              placeholder="PRJ01"
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono font-bold text-amber-400"
            />
          </div>

          {/* 2. Systems */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              2. Phân Hệ (systems):
            </label>
            <select
              value={saveConfig.systems}
              onChange={(e) => setSaveConfig({ ...saveConfig, systems: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200"
            >
              <option value="HVAC">HVAC (Gió & Điều hòa)</option>
              <option value="ELECTRICAL">ELECTRICAL (Điện)</option>
              <option value="PLUMBING">PLUMBING (Nước)</option>
              <option value="FIREFIGHTING">FIREFIGHTING (PCCC)</option>
              <option value="ELV">ELV (Điện nhẹ / BMS)</option>
              <option value="STRUCTURE">STRUCTURE (Kết cấu)</option>
              <option value="ARCHITECTURE">ARCHITECTURE (Kiến trúc)</option>
            </select>
          </div>

          {/* 3. Work Package */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              3. Gói Thầu (work_package):
            </label>
            <input
              type="text"
              value={saveConfig.workPackageCode}
              onChange={(e) => setSaveConfig({ ...saveConfig, workPackageCode: e.target.value })}
              placeholder="WP-MEPF-01"
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
            />
          </div>

          {/* 4. Kind & Subfolder */}
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              4. Vị Trí Thư Mục Đích (drawings/{saveConfig.systems}/...):
            </label>
            <select
              value={
                saveConfig.kind === "design" ? `design/${saveConfig.subFolder}` : saveConfig.kind
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith("design/")) {
                  setSaveConfig({
                    ...saveConfig,
                    kind: "design",
                    subFolder: val.split("/")[1] as any,
                  });
                } else {
                  setSaveConfig({
                    ...saveConfig,
                    kind: val as any,
                  });
                }
              }}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-emerald-400"
            >
              <option value="design/iso">design/iso/ (Bản vẽ thiết kế chuẩn hóa ISO)</option>
              <option value="design/origin">design/origin/ (Bản vẽ thiết kế gốc ban đầu)</option>
              <option value="shop">shop/ (Bản vẽ Shopdrawing 2D thi công)</option>
              <option value="asbuilt">asbuilt/ (Bản vẽ hoàn công 2D)</option>
            </select>
          </div>

          {/* 5. Date */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              5. Ngày (date):
            </label>
            <input
              type="text"
              value={saveConfig.date}
              onChange={(e) => setSaveConfig({ ...saveConfig, date: e.target.value })}
              placeholder="20260822"
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
            />
          </div>

          {/* 6. Version */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
              6. Phiên Bản (version):
            </label>
            <select
              value={saveConfig.drawingVersions}
              onChange={(e) => setSaveConfig({ ...saveConfig, drawingVersions: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-amber-400 font-bold"
            >
              <option value="Rev01">Rev01</option>
              <option value="Rev02">Rev02</option>
              <option value="RevA">RevA</option>
              <option value="RevB">RevB</option>
              <option value="v1.0">v1.0</option>
            </select>
          </div>
        </div>

        {/* 7. Drawing Name description */}
        <div>
          <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
            7. Tên Diễn Giải Bản Vẽ (name):
          </label>
          <input
            type="text"
            value={saveConfig.name}
            onChange={(e) => setSaveConfig({ ...saveConfig, name: e.target.value })}
            placeholder="Mat_Bang_Cap_Gio_Tang_4"
            className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-200"
          />
        </div>

        {/* Realtime Live Preview Banner */}
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300">
              Xem trước đường dẫn tệp thực tế trên máy chủ:
            </span>
            <span
              className={`font-mono font-bold text-xs ${
                is2dApproved ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {is2dApproved ? "✓ Vị trí chính thức" : "⏳ Thư mục tạm (chờ duyệt)"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-sky-300 flex items-center gap-2 overflow-x-auto">
            <Folder
              className={`w-4 h-4 shrink-0 ${is2dApproved ? "text-emerald-400" : "text-amber-400"}`}
            />
            <span className="text-zinc-500">{targetFolderDisplay}</span>
            <span className="font-bold text-amber-300">{generatedFileName}</span>
          </div>
        </div>

        {/* Action Buttons for Saving */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="text-xs text-zinc-400">
            {savedResult ? (
              <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {savedResult.message || `Đã lưu thành công (Mã ${savedResult.drawingCode})!`}
              </span>
            ) : (
              <span>
                {is2dApproved
                  ? "Bản vẽ sẽ được lưu vĩnh viễn vào vị trí chuẩn hóa chính thức."
                  : "Bản vẽ sẽ được lưu vào thư mục tạm drawings/" + saveConfig.systems + "/temp/."}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Tải DXF */}
            <button
              onClick={handleDownloadStandardizedNamedDxf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Tải .DXF</span>
            </button>

            {/* Tải Trọn Bộ Master Pack */}
            <button
              onClick={handleDownloadMasterBundle}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>📦 Tải Trọn Bộ Master Pack</span>
            </button>

            {/* Lưu Tạm Thời (nếu chưa duyệt) */}
            {!is2dApproved && (
              <button
                onClick={() => handleSaveToProjectServer(false)}
                disabled={savingToServer}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-on-accent-dark font-bold text-xs shadow-sm transition disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{savingToServer ? "Đang Lưu..." : "Lưu Vào Thư Mục Tạm"}</span>
              </button>
            )}

            {/* Lưu Chính Thức */}
            <button
              onClick={() => {
                if (!is2dApproved) handleApprove2d();
                handleSaveToProjectServer(true);
              }}
              disabled={savingToServer}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-on-accent-dark font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {savingToServer
                  ? "Đang Lưu..."
                  : is2dApproved
                    ? "Lưu Vào Thư Mục Máy Chủ"
                    : "Ghi Nhận Rà Soát & Lưu Chính Thức"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Chi Tiết Bảng Sửa Tay Kỹ Thuật (Layers, Text, Block BOQ) */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-amber-400" />
            <span>Bảng Rà Soát & Hiệu Chỉnh Tay (Manual Fine-Tuning)</span>
          </h3>
          <button
            onClick={handleSaveManualReview}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Lưu Bản Sửa Tay</span>
          </button>
        </div>

        {/* Sub-Tabs cho Sửa Tay */}
        <div className="space-y-4">
          {/* 1. Sửa Layer AIA */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>1. Bảng Ánh Xạ Layer AIA/BS1192 ({manualLayers.length} layers)</span>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                    <th className="py-2 px-3">Layer Gốc</th>
                    <th className="py-2 px-3">Tên Layer Chuẩn</th>
                    <th className="py-2 px-3">Phân Hệ</th>
                    <th className="py-2 px-3">Màu</th>
                    <th className="py-2 px-3 text-right">Số Đối Tượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {manualLayers.slice(0, 10).map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-800/40 transition">
                      <td className="py-1.5 px-3 text-zinc-400">{l.name}</td>
                      <td className="py-1.5 px-3">
                        <input
                          type="text"
                          value={l.standardName}
                          onChange={(e) =>
                            handleUpdateManualLayer(l.id, "standardName", e.target.value)
                          }
                          className="w-full max-w-[200px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-amber-400 font-bold"
                        />
                      </td>
                      <td className="py-1.5 px-3 font-sans">
                        <select
                          value={l.discipline}
                          onChange={(e) =>
                            handleUpdateManualLayer(l.id, "discipline", e.target.value as any)
                          }
                          className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-300"
                        >
                          <option value="M">HVAC (M)</option>
                          <option value="E">Điện (E)</option>
                          <option value="P">Nước (P)</option>
                          <option value="F">PCCC (F)</option>
                          <option value="ELV">ELV</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: l.colorHex }}
                        />
                        <span className="text-zinc-400 text-[10px]">{l.colorHex}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right text-zinc-400">{l.entityCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Sửa Text UTF-8 */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>2. Ghi Chú Kỹ Thuật & Text UTF-8 ({manualTexts.length} chuỗi)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {manualTexts.slice(0, 6).map((txt) => (
                <div
                  key={txt.id}
                  className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <span>Layer: {txt.layer}</span>
                    <span className="text-zinc-400 truncate max-w-[150px]">Gốc: {txt.raw}</span>
                  </div>
                  <input
                    type="text"
                    value={txt.edited}
                    onChange={(e) => handleUpdateManualText(txt.id, e.target.value)}
                    className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs text-emerald-300 font-medium"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3. Khớp Block BOQ */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-emerald-400" />
              <span>3. Khớp Mã Block Thiết Bị Sang Dự Toán BOQ ({manualBlocks.length} blocks)</span>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                    <th className="py-2 px-3">Tên Block Gốc</th>
                    <th className="py-2 px-3">Tên Thiết Bị (Sửa tay)</th>
                    <th className="py-2 px-3">Mã BOQ Dự Toán</th>
                    <th className="py-2 px-3 text-right">Số Lượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {manualBlocks.map((b) => (
                    <tr key={b.id} className="hover:bg-zinc-800/40 transition">
                      <td className="py-1.5 px-3 text-zinc-300 font-bold">{b.name}</td>
                      <td className="py-1.5 px-3 font-sans">
                        <input
                          type="text"
                          value={b.customName}
                          onChange={(e) =>
                            handleUpdateManualBlock(b.id, "customName", e.target.value)
                          }
                          className="w-full px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          type="text"
                          value={b.mappedBoqCode}
                          onChange={(e) =>
                            handleUpdateManualBlock(b.id, "mappedBoqCode", e.target.value)
                          }
                          className="w-full px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-amber-400 font-bold"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right text-zinc-300 font-bold">
                        {b.count} cái
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
