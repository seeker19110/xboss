"use client";

import { Dispatch, SetStateAction } from "react";
import {
  Code,
  FileDiff,
  Sparkles,
  RefreshCw,
  Copy,
  Download,
  Check,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Network,
  Link2,
  Plus,
  Minus,
} from "lucide-react";
import { DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";
import type { CadDiffResult, LispTemplateType } from "../types";

// BƯỚC 1.4 — Cây liên kết XREF, so sánh phiên bản Diff & sinh mã AutoLISP 2D.

interface XrefDiffLispPanelProps {
  setActiveStep: Dispatch<SetStateAction<1 | 2>>;
  copied: boolean;
  dxfData: DxfParseResult | null;
  diffResult: CadDiffResult | null;
  lispType: LispTemplateType;
  setLispType: Dispatch<SetStateAction<LispTemplateType>>;
  hangerWidth: number;
  setHangerWidth: Dispatch<SetStateAction<number>>;
  hangerHeight: number;
  setHangerHeight: Dispatch<SetStateAction<number>>;
  rodDiameter: number;
  setRodDiameter: Dispatch<SetStateAction<number>>;
  sleeveDiameter: number;
  setSleeveDiameter: Dispatch<SetStateAction<number>>;
  sleeveTag: string;
  setSleeveTag: Dispatch<SetStateAction<string>>;
  inletWidth: number;
  setInletWidth: Dispatch<SetStateAction<number>>;
  inletHeight: number;
  setInletHeight: Dispatch<SetStateAction<number>>;
  outletWidth: number;
  setOutletWidth: Dispatch<SetStateAction<number>>;
  outletHeight: number;
  setOutletHeight: Dispatch<SetStateAction<number>>;
  transitionLength: number;
  setTransitionLength: Dispatch<SetStateAction<number>>;
  generatedLispCode: string;
  hasRealData: boolean;
  handleToggleXrefBind: (xrefId: string) => void;
  runDiffAnalysis: () => void | Promise<void>;
  handleGenerateLisp: () => void | Promise<void>;
  handleCopyCode: () => void;
  handleDownloadLisp: () => void;
}

export default function XrefDiffLispPanel({
  setActiveStep,
  copied,
  dxfData,
  diffResult,
  lispType,
  setLispType,
  hangerWidth,
  setHangerWidth,
  hangerHeight,
  setHangerHeight,
  rodDiameter,
  setRodDiameter,
  sleeveDiameter,
  setSleeveDiameter,
  sleeveTag,
  setSleeveTag,
  inletWidth,
  setInletWidth,
  inletHeight,
  setInletHeight,
  outletWidth,
  setOutletWidth,
  outletHeight,
  setOutletHeight,
  transitionLength,
  setTransitionLength,
  generatedLispCode,
  hasRealData,
  handleToggleXrefBind,
  runDiffAnalysis,
  handleGenerateLisp,
  handleCopyCode,
  handleDownloadLisp,
}: XrefDiffLispPanelProps) {
  return (
    <div className="space-y-5">
      {/* Phân đoạn 4.1: Cây Liên Kết XREF & Phục Hồi Đường Dẫn Gãy */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-purple-400" />
              Cây Liên Kết Bản Vẽ Tham Chiếu XREF (External Reference Doctor)
            </h2>
            <p className="text-xs text-zinc-400">
              Tự động nhận diện cấu trúc file XREF đính kèm (Kiến trúc, Kết cấu, MEPF), khắc phục
              triệt để lỗi gãy đường dẫn tuyệt đối khi sao chép giữa các máy tính và quản lý chế độ
              Gộp (Bind) / Tham chiếu (Overlay).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold font-mono border border-purple-500/30 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5" />
              <span>{dxfData?.xrefs?.length || 0} XREFs</span>
            </span>
          </div>
        </div>

        {/* XREF Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                <th className="py-2.5 px-3">Tên Khối XREF</th>
                <th className="py-2.5 px-3">Mục Đích Tham Chiếu Kỹ Thuật</th>
                <th className="py-2.5 px-3">Đường Dẫn Gốc Trong CAD</th>
                <th className="py-2.5 px-3">Tệp Đối Soát Khớp (Local)</th>
                <th className="py-2.5 px-3">Thực Thể / Layer</th>
                <th className="py-2.5 px-3">Loại Liên Kết</th>
                <th className="py-2.5 px-3">Trạng Thái</th>
                <th className="py-2.5 px-3 text-right">Chế Độ Xử Lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {dxfData?.xrefs && dxfData.xrefs.length > 0 ? (
                dxfData.xrefs.map((xref) => (
                  <tr key={xref.id} className="hover:bg-zinc-800/40 transition">
                    <td className="py-2.5 px-3 font-bold text-purple-400 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                      <span>{xref.name}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-zinc-300">{xref.description}</td>
                    <td
                      className="py-2.5 px-3 text-zinc-400 truncate max-w-[160px]"
                      title={xref.originalPath}
                    >
                      {xref.originalPath}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold truncate max-w-[160px]">
                      {xref.resolvedFileName || xref.fileName}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      <span className="text-sky-400 font-bold">{xref.entityCount}</span> net •{" "}
                      <span className="text-zinc-400">{xref.layerCount} layers</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {xref.isBound ? (
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[11px] font-bold border border-sky-500/30">
                          Attach (Đã Gộp)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px] font-semibold">
                          Overlay (Nền mờ 50%)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {xref.status === "resolved" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đã Khớp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Thiếu Tệp
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <button
                        onClick={() => handleToggleXrefBind(xref.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          xref.isBound
                            ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
                            : "bg-purple-600 hover:bg-purple-700 text-white border-purple-500 shadow-xs"
                        }`}
                      >
                        {xref.isBound ? "Chuyển sang Overlay" : "Gộp (Bind) vào Master"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                    {hasRealData
                      ? "✓ Bản vẽ này độc lập, không sử dụng liên kết tham chiếu ngoài (XREF)."
                      : "Chưa có bản vẽ nào được nạp để kiểm tra liên kết XREF."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phân đoạn 4.2: So Sánh Phiên Bản (CAD Vector Diff) */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <FileDiff className="w-4 h-4 text-amber-400" />
              So Sánh Phiên Bản Bản Vẽ CAD (Vector Geometry Diffing)
            </h2>
            <p className="text-xs text-zinc-400">
              Thuật toán so khớp tọa độ Hausdorff & Centroid Distance phát hiện chính xác các tuyến
              ống, miệng gió bị di dời, thêm mới hoặc xóa bỏ giữa các Revision.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
              +{diffResult?.summary?.added ?? 0} Mới
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold">
              -{diffResult?.summary?.removed ?? 0} Xóa
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-bold">
              ~{diffResult?.summary?.modified ?? 0} Dời
            </span>
          </div>
        </div>

        {/* Action and Refresh */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-400">
            Phân tích so khớp hình học giữa các phiên bản revision bản vẽ (Base vs Compare).
          </div>
          <button
            onClick={runDiffAnalysis}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Chạy Lại So Khớp Diff</span>
          </button>
        </div>

        {/* Changes Detailed Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                <th className="py-2.5 px-3">Loại Thay Đổi</th>
                <th className="py-2.5 px-3">Mã Thực Thể</th>
                <th className="py-2.5 px-3">Layer</th>
                <th className="py-2.5 px-3">Chi Tiết Sai Khác Tọa Độ / Kích Thước</th>
                <th className="py-2.5 px-3 text-right">Độ Sai Lệch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {diffResult?.differences && diffResult.differences.length > 0 ? (
                diffResult.differences.map((c, i) => (
                  <tr key={i} className="hover:bg-zinc-800/40 transition">
                    <td className="py-2.5 px-3 font-sans">
                      {c.diffStatus === "added" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold text-[10px]">
                          <Plus className="w-3 h-3" /> Thêm Mới
                        </span>
                      )}
                      {c.diffStatus === "removed" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 font-semibold text-[10px]">
                          <Minus className="w-3 h-3" /> Đã Xóa
                        </span>
                      )}
                      {c.diffStatus === "modified" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-semibold text-[10px]">
                          <RefreshCw className="w-3 h-3" /> Dời Tọa Độ
                        </span>
                      )}
                      {c.diffStatus === "unchanged" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-semibold text-[10px]">
                          Trùng Khớp
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300 font-bold">{c.entityId}</td>
                    <td className="py-2.5 px-3 text-zinc-400">{c.layer}</td>
                    <td className="py-2.5 px-3 text-zinc-200 font-sans">{c.changeDescription}</td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                        {c.type}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500 font-sans">
                    {hasRealData
                      ? "Chọn một phiên bản bản vẽ khác để chạy so sánh đối chiếu sai khác hình học (CAD Diff)."
                      : "Chưa có bản vẽ nào được nạp để so sánh phiên bản."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phân đoạn 4.3: AutoLISP Sinh Chi Tiết Thi Công */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Cột Trái: Thông số đầu vào */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
          <div className="space-y-1 border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Code className="w-4 h-4 text-amber-400" />
              Trình Sinh Mã AutoLISP Chi Tiết Mặt Bằng 2D
            </h2>
            <p className="text-xs text-zinc-400">
              Tự động tạo lệnh LISP tham số hóa để vẽ nhanh mặt bằng giá treo Trapeze, lỗ mở xuyên
              dầm và côn thu ống gió 2D ngay trong AutoCAD.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                Loại Chi Tiết Cần Sinh Script:
              </label>
              <select
                value={lispType}
                onChange={(e) => setLispType(e.target.value as any)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                <option value="hanger">Giá Treo Đa Tầng Trapeze Hanger (Unistrut)</option>
                <option value="sleeve">Lỗ Mở Xuyên Dầm (Sleeve/Opening Builder)</option>
                <option value="duct_transition">Côn Chuyển Ống Gió (Eccentric Reducer)</option>
              </select>
            </div>

            {lispType === "hanger" && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Bề Rộng Giá Treo (mm)
                  </label>
                  <input
                    type="number"
                    value={hangerWidth}
                    onChange={(e) => setHangerWidth(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Chiều Cao Ty Treo (mm)
                  </label>
                  <input
                    type="number"
                    value={hangerHeight}
                    onChange={(e) => setHangerHeight(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Đường Kính Ty Treo (mm)
                  </label>
                  <select
                    value={rodDiameter}
                    onChange={(e) => setRodDiameter(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                  >
                    <option value={10}>Ty Treo M10 (10mm)</option>
                    <option value={12}>Ty Treo M12 (12mm)</option>
                    <option value={16}>Ty Treo M16 (16mm)</option>
                  </select>
                </div>
              </div>
            )}

            {lispType === "sleeve" && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Đường Kính Lỗ Mở (mm)
                  </label>
                  <input
                    type="number"
                    value={sleeveDiameter}
                    onChange={(e) => setSleeveDiameter(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Mã Ký Hiệu Lỗ</label>
                  <input
                    type="text"
                    value={sleeveTag}
                    onChange={(e) => setSleeveTag(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
              </div>
            )}

            {lispType === "duct_transition" && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Miệng Vào (WxH mm)</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={inletWidth}
                      onChange={(e) => setInletWidth(Number(e.target.value))}
                      className="w-1/2 px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                    />
                    <input
                      type="number"
                      value={inletHeight}
                      onChange={(e) => setInletHeight(Number(e.target.value))}
                      className="w-1/2 px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Miệng Ra (WxH mm)</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={outletWidth}
                      onChange={(e) => setOutletWidth(Number(e.target.value))}
                      className="w-1/2 px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                    />
                    <input
                      type="number"
                      value={outletHeight}
                      onChange={(e) => setOutletHeight(Number(e.target.value))}
                      className="w-1/2 px-2 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Chiều Dài Côn Thu (Length mm)
                  </label>
                  <input
                    type="number"
                    value={transitionLength}
                    onChange={(e) => setTransitionLength(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateLisp}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tạo Kịch Bản AutoLISP Mới</span>
            </button>
          </div>
        </div>

        {/* Cột Phải: Xem và Tải Script */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <span className="text-xs font-mono text-amber-400 font-bold">
              xboss_{lispType}.lsp (AutoCAD LISP Program)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? "Đã copy" : "Sao chép"}</span>
              </button>
              <button
                onClick={handleDownloadLisp}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về .LSP</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-amber-300/90 overflow-x-auto max-h-[420px] leading-relaxed">
              {generatedLispCode || ";; Đang sinh mã LISP..."}
            </pre>
          </div>
        </div>
      </div>

      {/* Next Step CTA */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-sky-500/10 border border-emerald-500/30">
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Hoàn tất Studio Chuẩn Hóa Bản Vẽ CAD 2D!</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Chuyển sang Bước 2 để đặt tên file ISO 19650, Ký Duyệt Gate 0 và lưu vào cây thư mục dự
            án.
          </p>
        </div>
        <button
          onClick={() => setActiveStep(2)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow-md transition shrink-0"
        >
          <span>Chuyển Sang Bước 2: Đặt Tên & Lưu Trữ</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
