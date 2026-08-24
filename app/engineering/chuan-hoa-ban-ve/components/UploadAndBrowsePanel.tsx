"use client";

import { Dispatch, RefObject, SetStateAction } from "react";
import {
  Sparkles,
  RefreshCw,
  Download,
  FileCheck,
  Search,
  CheckCircle2,
  UploadCloud,
  FileSpreadsheet,
  Layers2,
  FileCode2,
  FileUp,
  Clock,
  Printer,
  Folder,
  FolderArchive,
  FolderOpen,
  FolderTree,
  Link2,
  Plus,
  Minus,
  AlertTriangle,
  FileQuestion,
} from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import type {
  ConversionInfo,
  DrawingOption,
  FolderFileItem,
  FolderFilter,
  RunDxfAnalysis,
  SourceMode,
} from "../types";

// Khu vực chọn nguồn bản vẽ CAD đầu vào: trình duyệt cây thư mục bản vẽ thiết kế,
// tải tệp đơn .DXF/.DWG và tải nguyên thư mục dự án (kèm XREF/CTB).

interface UploadAndBrowsePanelProps {
  sourceMode: SourceMode;
  setSourceMode: Dispatch<SetStateAction<SourceMode>>;
  selectedDrawingId: number | null;
  setSelectedDrawingId: Dispatch<SetStateAction<number | null>>;
  uploadedFileName: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  explorerCategory: string;
  setExplorerCategory: Dispatch<SetStateAction<string>>;
  expandedSystems: string[];
  drawingSearchQuery: string;
  setDrawingSearchQuery: Dispatch<SetStateAction<string>>;
  toggleSystemExpand: (sys: string) => void;
  allDrawingsList: DrawingOption[];
  filteredExplorerDrawings: DrawingOption[];
  folderFiles: FolderFileItem[];
  folderName: string;
  selectedFolderFile: string;
  folderFilter: FolderFilter;
  setFolderFilter: Dispatch<SetStateAction<FolderFilter>>;
  loading: boolean;
  conversionInfo: ConversionInfo | null;
  runDxfAnalysis: RunDxfAnalysis;
  handleSyncServerDrawings: () => void | Promise<void>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownloadConvertedDxf: () => void;
  handleFolderUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  handleSelectFolderDrawing: (fileName: string) => void | Promise<void>;
  /** Lỗi phân tích bản vẽ gần nhất — hiển thị bền, không chỉ toast thoáng qua. */
  analysisError: string | null;
  /** 409: nhiều tệp cùng khớp trên máy chủ — người dùng phải chỉ đích danh, không tự chọn hộ. */
  ambiguousCandidates: string[];
  resolveAmbiguousCandidate: (relativePath: string) => void;
  cancelAmbiguousCandidates: () => void;
}

export default function UploadAndBrowsePanel({
  sourceMode,
  setSourceMode,
  selectedDrawingId,
  setSelectedDrawingId,
  uploadedFileName,
  fileInputRef,
  folderInputRef,
  explorerCategory,
  setExplorerCategory,
  expandedSystems,
  drawingSearchQuery,
  setDrawingSearchQuery,
  toggleSystemExpand,
  allDrawingsList,
  filteredExplorerDrawings,
  folderFiles,
  folderName,
  selectedFolderFile,
  folderFilter,
  setFolderFilter,
  loading,
  conversionInfo,
  runDxfAnalysis,
  handleSyncServerDrawings,
  handleFileUpload,
  handleDownloadConvertedDxf,
  handleFolderUpload,
  handleSelectFolderDrawing,
  analysisError,
  ambiguousCandidates,
  resolveAmbiguousCandidate,
  cancelAmbiguousCandidates,
}: UploadAndBrowsePanelProps) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-200">
            <Layers2 className="w-4 h-4 text-amber-400" />
            <span>Nguồn Bản Vẽ CAD Đầu Vào</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Chọn bản vẽ thiết kế sẵn có trong dự án hoặc tải lên tệp tin CAD (.DXF) từ máy tính để
            chuẩn hóa.
          </p>
        </div>

        {/* Toggle Switcher: Thiết Kế vs Tệp Đơn vs Cả Thư Mục */}
        <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0 gap-1">
          <button
            onClick={() => setSourceMode("design")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              sourceMode === "design"
                ? "bg-amber-500 text-on-accent-dark font-bold shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>1. Thiết Kế Dự Án</span>
          </button>

          <button
            onClick={() => setSourceMode("upload")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              sourceMode === "upload"
                ? "bg-amber-500 text-on-accent-dark font-bold shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>2. Tải Tệp Đơn (.DXF/.DWG)</span>
          </button>

          <button
            onClick={() => setSourceMode("folder")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              sourceMode === "folder"
                ? "bg-amber-500 text-on-accent-dark font-bold shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>3. 📁 Tải Nguyên Thư Mục (XREF)</span>
          </button>
        </div>
      </div>

      {/* Lỗi phân tích bản vẽ gần nhất — hiển thị bền (không chỉ toast thoáng qua rồi mất). */}
      {analysisError && ambiguousCandidates.length === 0 && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{analysisError}</span>
        </div>
      )}

      {/* 409: nhiều bản vẽ cùng khớp trên máy chủ — bắt người dùng chỉ đích danh, không tự chọn hộ
          (chống lỗi "chọn bản vẽ A, hệ thống trả bản vẽ B"). */}
      {ambiguousCandidates.length > 0 && (
        <Modal onClose={cancelAmbiguousCandidates} className="max-w-lg">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <FileQuestion className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="font-semibold text-sm flex-1 text-zinc-100">
              Chọn đúng bản vẽ cần phân tích
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-zinc-400">{analysisError}</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {ambiguousCandidates.map((path) => (
                <button
                  key={path}
                  onClick={() => resolveAmbiguousCandidate(path)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-left text-xs font-mono text-zinc-200 transition min-h-[40px]"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={cancelAmbiguousCandidates}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-xl transition font-medium min-h-[40px]"
              >
                Huỷ
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Source 1: Trình Duyệt Cây Thư Mục & Danh Sách Bản Vẽ (2 Cột File Explorer) */}
      {sourceMode === "design" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
          {/* Cột 1 (Trái): Cây Thư Mục Phân Cấp (Directory Tree & Phân Hệ MEPF) */}
          <div className="lg:col-span-4 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-amber-400" />
                <span>Cây Thư Mục Bản Vẽ</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {allDrawingsList.length} tệp
              </span>
            </div>

            {/* Cấu Trúc drawings/[SYSTEMS]/... */}
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {/* Root drawings/ */}
              <button
                onClick={() => setExplorerCategory("all")}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition text-left ${
                  explorerCategory === "all"
                    ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate font-semibold">drawings/ (Tất cả)</span>
                </div>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {allDrawingsList.length}
                </span>
              </button>

              {/* Systems Folders */}
              {[
                { id: "HVAC", label: "HVAC", desc: "Gió & ĐHKK", icon: "🌀" },
                { id: "PLUMBING", label: "PLUMBING", desc: "Cấp thoát nước", icon: "💧" },
                { id: "ELECTRICAL", label: "ELECTRICAL", desc: "Điện & Máng cáp", icon: "⚡" },
                {
                  id: "FIREFIGHTING",
                  label: "FIREFIGHTING",
                  desc: "PCCC & Sprinkler",
                  icon: "🔥",
                },
                { id: "ELV", label: "ELV", desc: "Điện nhẹ & BMS", icon: "📡" },
              ].map((sys) => {
                const isExpanded = expandedSystems.includes(sys.id);
                const sysDrawings = allDrawingsList.filter((d) => d.systemGroup === sys.id);
                const isSysActive = explorerCategory === sys.id;

                return (
                  <div
                    key={sys.id}
                    className="space-y-0.5 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-1"
                  >
                    {/* System Header */}
                    <div className="flex items-center justify-between gap-1">
                      <button
                        onClick={() => setExplorerCategory(sys.id)}
                        className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition text-left truncate ${
                          isSysActive
                            ? "bg-amber-500/20 text-amber-300 font-bold"
                            : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/50"
                        }`}
                      >
                        <span className="text-xs">{sys.icon}</span>
                        <span className="font-bold font-mono">{sys.id}/</span>
                        <span className="text-[10px] text-zinc-500 truncate font-normal">
                          ({sys.desc})
                        </span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0 pr-1">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
                          {sysDrawings.length}
                        </span>
                        <button
                          onClick={() => toggleSystemExpand(sys.id)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                          aria-label={isExpanded ? `Thu gọn hệ ${sys.id}` : `Mở rộng hệ ${sys.id}`}
                        >
                          {isExpanded ? (
                            <Minus className="w-3 h-3" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Subfolders */}
                    {isExpanded && (
                      <div className="pl-3.5 pr-1 py-1 space-y-0.5 border-l border-zinc-800 ml-3">
                        {/* 0. temp (Thư mục tạm) */}
                        <button
                          onClick={() => setExplorerCategory(`${sys.id}/temp`)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition text-left ${
                            explorerCategory === `${sys.id}/temp`
                              ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="truncate">temp/ (Thư mục tạm)</span>
                          </div>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800/80 text-amber-400 font-bold">
                            {sysDrawings.filter((d) => d.kind === "temp").length}
                          </span>
                        </button>

                        {/* 1. design/origin */}
                        <button
                          onClick={() => setExplorerCategory(`${sys.id}/design/origin`)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition text-left ${
                            explorerCategory === `${sys.id}/design/origin`
                              ? "bg-sky-500/15 text-sky-300 font-bold border border-sky-500/30"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <FolderOpen className="w-3 h-3 text-sky-400 shrink-0" />
                            <span className="truncate">design/origin/ (Gốc)</span>
                          </div>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400">
                            {
                              sysDrawings.filter(
                                (d) =>
                                  d.kind === "design" && (d.subFolder === "origin" || !d.subFolder),
                              ).length
                            }
                          </span>
                        </button>

                        {/* 2. design/iso */}
                        <button
                          onClick={() => setExplorerCategory(`${sys.id}/design/iso`)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition text-left ${
                            explorerCategory === `${sys.id}/design/iso`
                              ? "bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="truncate">design/iso/ (Chuẩn hóa)</span>
                          </div>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400">
                            {sysDrawings.filter((d) => d.subFolder === "iso").length}
                          </span>
                        </button>

                        {/* 3. shop */}
                        <button
                          onClick={() => setExplorerCategory(`${sys.id}/shop`)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition text-left ${
                            explorerCategory === `${sys.id}/shop`
                              ? "bg-purple-500/15 text-purple-300 font-bold border border-purple-500/30"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="w-3 h-3 text-purple-400 shrink-0" />
                            <span className="truncate">shop/ (Shopdrawing)</span>
                          </div>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400">
                            {sysDrawings.filter((d) => d.kind === "shop").length}
                          </span>
                        </button>

                        {/* 4. bim */}
                        <button
                          onClick={() => setExplorerCategory(`${sys.id}/bim`)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition text-left ${
                            explorerCategory === `${sys.id}/bim`
                              ? "bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="truncate">bim/ (Mô hình 3D)</span>
                          </div>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400">
                            {sysDrawings.filter((d) => d.kind === "bim").length}
                          </span>
                        </button>

                        {/* 5. asbuilt */}
                        <button
                          onClick={() => setExplorerCategory(`${sys.id}/asbuilt`)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition text-left ${
                            explorerCategory === `${sys.id}/asbuilt`
                              ? "bg-rose-500/15 text-rose-300 font-bold border border-rose-500/30"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="w-3 h-3 text-rose-400 shrink-0" />
                            <span className="truncate">asbuilt/ (Hoàn công)</span>
                          </div>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400">
                            {sysDrawings.filter((d) => d.kind === "asbuilt").length}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cột 2 (Phải): Danh Sách Tệp Bản Vẽ & Chi Tiết Lựa Chọn */}
          <div className="lg:col-span-8 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              {/* Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên bản vẽ, mã CAD, tầng..."
                    value={drawingSearchQuery}
                    onChange={(e) => setDrawingSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleSyncServerDrawings}
                    disabled={loading}
                    title="Quét toàn bộ thư mục data/uploads/drawings và đồng bộ vào CSDL"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 text-xs font-semibold border border-emerald-700/60 transition shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>Đồng Bộ Máy Chủ</span>
                  </button>

                  <button
                    onClick={() => runDxfAnalysis({ drawingId: selectedDrawingId })}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>Nạp Lại Bản Vẽ</span>
                  </button>
                </div>
              </div>

              {/* File Grid / Explorer List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {filteredExplorerDrawings.length > 0 ? (
                  filteredExplorerDrawings.map((d) => {
                    const isSelected = selectedDrawingId === d.id;
                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          setSelectedDrawingId(d.id);
                          runDxfAnalysis({ drawingId: d.id, name: `${d.code}.dxf` });
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                          isSelected
                            ? "bg-amber-500/10 border-amber-500 shadow-sm"
                            : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              isSelected
                                ? "bg-amber-500 text-on-accent-dark"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            <FileCode2 className="w-4 h-4" />
                          </div>

                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-xs text-amber-400">
                                [{d.code}]
                              </span>
                              <span className="text-xs font-semibold text-zinc-200 truncate">
                                {d.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
                              {d.systemGroup && (
                                <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                                  {d.systemGroup}
                                </span>
                              )}
                              {d.floorLabel && <span>• {d.floorLabel}</span>}
                              {d.latestRev && (
                                <span className="font-mono text-emerald-400">• {d.latestRev}</span>
                              )}
                              <span className="font-mono text-zinc-500">
                                • drawings/{d.systemGroup}/
                                {d.kind === "design"
                                  ? `design/${d.subFolder || "origin"}/`
                                  : `${d.kind}/`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {isSelected ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Đang Chọn
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono hover:text-amber-400">
                              Chọn nạp →
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-xs text-zinc-500 space-y-1">
                    <FolderOpen className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                    <p>Không tìm thấy bản vẽ phù hợp trong thư mục này.</p>
                    <button
                      onClick={() => {
                        setExplorerCategory("all");
                        setDrawingSearchQuery("");
                      }}
                      className="text-amber-400 underline text-xs pt-1"
                    >
                      Xem tất cả bản vẽ dự án
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Selected Item Info Footer */}
            {selectedDrawingId && (
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80 flex items-center justify-between text-xs mt-2">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-zinc-400 font-mono text-[11px]">Đang nạp xử lý:</span>
                  <span className="font-bold font-mono text-amber-300 truncate">
                    {allDrawingsList.find((d) => d.id === selectedDrawingId)?.code ||
                      "AVIO-DWG-M-FL04-01"}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 shrink-0 font-bold">
                  Sẵn sàng chuẩn hóa 5 bước ✓
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Source 2: Tải lên tệp đơn DXF / DWG */}
      {sourceMode === "upload" && (
        <div className="space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-5 rounded-xl border-2 border-dashed border-zinc-800 hover:border-amber-500/60 bg-zinc-950/60 flex flex-col items-center justify-center gap-2 cursor-pointer transition group text-center"
          >
            <div className="p-3 rounded-full bg-amber-500/10 text-amber-400 group-hover:scale-110 transition">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-200">
                Kéo thả hoặc bấm để tải lên tệp tin bản vẽ CAD (.DXF / .DWG)
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Nhận tệp DXF (ASCII lẫn nhị phân) mọi phiên bản AutoCAD. Tệp xuất ra theo chuẩn
                AutoCAD 2007 — mở được bằng AutoCAD 2007 cho tới bản mới nhất.
              </p>
            </div>
            {uploadedFileName && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                <FileCheck className="w-3.5 h-3.5" />
                <span>Đã nạp: {uploadedFileName}</span>
              </div>
            )}
          </div>

          {/* Bảng Thông Báo Chuyển Đổi Sang .DXF Trước Khi Xử Lý */}
          {conversionInfo && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                    <span>ĐÃ TỰ ĐỘNG CHUYỂN ĐỔI SANG .DXF TRƯỚC KHI XỬ LÝ</span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      ({conversionInfo.convertedAt})
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 font-mono">
                    {conversionInfo.originalFileName} <span className="text-amber-400">➔</span>{" "}
                    {conversionInfo.dxfFileName} ({conversionInfo.entityCount} thực thể, chuẩn ASCII
                    AutoCAD R2018)
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadConvertedDxf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-on-accent text-xs font-semibold shadow-xs transition shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về file .DXF</span>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf,.dwg,.txt,.json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Source 3: Tải nguyên cả thư mục bản vẽ dự án (Hỗ trợ XREF, DWG, DXF, CTB) */}
      {sourceMode === "folder" && (
        <div className="space-y-3">
          <div
            onClick={() => folderInputRef.current?.click()}
            className="p-5 rounded-xl border-2 border-dashed border-amber-500/40 hover:border-amber-500 bg-amber-500/5 flex flex-col items-center justify-center gap-2 cursor-pointer transition group text-center"
          >
            <div className="p-3 rounded-full bg-amber-500/20 text-amber-400 group-hover:scale-110 transition">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-100">
                Bấm vào đây để chọn hoặc kéo thả NGUYÊN THƯ MỤC BẢN VẼ DỰ ÁN
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Hệ thống sẽ quét toàn bộ cây thư mục con, tự động kết nối các tệp liên kết XREF
                (Kiến trúc, Kết cấu, MEPF) và nạp bảng nét in .CTB.
              </p>
            </div>
            {folderFiles.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{folderName}</span> ({folderFiles.length} tệp tin)
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-400 text-[11px] font-mono font-semibold">
                  {folderFiles.filter((f) => f.isDwg || f.isDxf).length} Bản vẽ CAD
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-400 text-[11px] font-mono font-semibold">
                  {folderFiles.filter((f) => f.isXref).length} XREF Liên Kết
                </span>
              </div>
            )}
          </div>

          {/* Danh sách tệp tin trong thư mục đã tải lên */}
          {folderFiles.length > 0 && (
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <div className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-amber-400" />
                  <span>Danh Mục Bản Vẽ Trong Thư Mục &quot;{folderName}&quot;:</span>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFolderFilter("all")}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                      folderFilter === "all"
                        ? "bg-amber-500 text-on-accent-dark font-bold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Tất cả ({folderFiles.length})
                  </button>
                  <button
                    onClick={() => setFolderFilter("cad")}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                      folderFilter === "cad"
                        ? "bg-amber-500 text-on-accent-dark font-bold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Bản vẽ chính (
                    {folderFiles.filter((f) => !f.isXref && (f.isDwg || f.isDxf)).length})
                  </button>
                  <button
                    onClick={() => setFolderFilter("xref")}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                      folderFilter === "xref"
                        ? "bg-amber-500 text-on-accent-dark font-bold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    XREF ({folderFiles.filter((f) => f.isXref).length})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {folderFiles
                  .filter((f) => {
                    if (folderFilter === "cad") return !f.isXref && (f.isDwg || f.isDxf);
                    if (folderFilter === "xref") return f.isXref;
                    if (folderFilter === "ctb") return f.isCtb;
                    return true;
                  })
                  .map((f) => {
                    const isSelected = selectedFolderFile === f.name;
                    return (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFolderDrawing(f.name)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-xs"
                            : "bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {f.isXref ? (
                            <Link2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          ) : f.isCtb ? (
                            <Printer className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold font-mono truncate">{f.name}</div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              {f.relativePath}
                            </div>
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-on-accent-dark text-[10px] font-bold shrink-0">
                            Master ✓
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                            {(f.sizeBytes / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <input
            ref={folderInputRef}
            type="file"
            {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
            onChange={handleFolderUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
