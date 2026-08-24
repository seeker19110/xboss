"use client";

import { Dispatch, SetStateAction } from "react";
import {
  Boxes,
  RefreshCw,
  Download,
  Check,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Ruler,
  Printer,
} from "lucide-react";
import type { BlockCatalogItem, CtbMapping, DimOverrideItem, Step1SubTab } from "../types";

// BƯỚC 1.3 — Bóc tách thiết bị BOQ, bác sĩ Dim ảo & bảng nét in CTB.

interface BoqDimCtbPanelProps {
  setStep1SubTab: Dispatch<SetStateAction<Step1SubTab>>;
  blockCatalogs: BlockCatalogItem[];
  loadingBlocks: boolean;
  dimOverrides: DimOverrideItem[];
  ctbMappings: CtbMapping[];
  handleFixDimOverride: (id: string) => void;
  handleFixAllDims: () => void;
  handleDownloadCtb: () => void;
  fetchBlockCatalogs: () => void | Promise<void>;
}

export default function BoqDimCtbPanel({
  setStep1SubTab,
  blockCatalogs,
  loadingBlocks,
  dimOverrides,
  ctbMappings,
  handleFixDimOverride,
  handleFixAllDims,
  handleDownloadCtb,
  fetchBlockCatalogs,
}: BoqDimCtbPanelProps) {
  return (
    <div className="space-y-5">
      {/* Phân đoạn 3.1: Trích Xuất Block Sang BOQ Dự Toán */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-amber-400" />
              Trích Xuất Thuộc Tính Block Thiết Bị sang Family BIM & BOQ
            </h2>
            <p className="text-xs text-zinc-400">
              Bóc tách tự động tên block, thuộc tính công suất, lưu lượng, kích thước và ánh xạ sang
              Revit BIM Family Components LOD 300.
            </p>
          </div>

          <button
            onClick={fetchBlockCatalogs}
            disabled={loadingBlocks}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBlocks ? "animate-spin" : ""}`} />
            <span>Cập Nhật Block</span>
          </button>
        </div>

        {blockCatalogs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {blockCatalogs.map((b, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 shadow-xs hover:border-zinc-700 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                    {b.discipline}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {b.mapped_boq_code || "Chưa map BOQ"}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-zinc-100 font-mono">{b.block_name}</h4>
                  <p className="text-[11px] text-zinc-400">{b.category}</p>
                </div>

                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800/80 space-y-1 font-mono text-[10px]">
                  {Object.entries(b.attribute_schema).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-zinc-300">
                      <span className="text-zinc-500">{k}:</span>
                      <span className="text-zinc-200 font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-zinc-950 text-center text-xs text-zinc-500 border border-zinc-800/60">
            Chưa có danh mục block CAD nào trong cơ sở dữ liệu dự án.
          </div>
        )}
      </div>

      {/* Phân đoạn 3.2: Dim Override Doctor (Chống Gian Lận Kích Thước) */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-rose-400" />
              Bác Sĩ Dim Ảo (Dim Override Doctor — Chống Gian Lận Kích Thước)
            </h2>
            <p className="text-xs text-zinc-400">
              Phát hiện và cảnh báo các kích thước bị sửa đè chữ số (Text Override) sai lệch so với
              số đo hình học thực tế trong bản vẽ CAD.
            </p>
          </div>

          {dimOverrides.length > 0 && (
            <button
              onClick={handleFixAllDims}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-on-accent-dark font-bold text-xs shadow-sm transition shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Khôi Phục Tất Cả Về Đo Thực Tế</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                <th className="py-2.5 px-3">Mã Dim</th>
                <th className="py-2.5 px-3">Vị Trí Đo / Đối Tượng</th>
                <th className="py-2.5 px-3">Chữ Số Ghi Đè (Hiển thị)</th>
                <th className="py-2.5 px-3">Khoảng Cách Thực Tế</th>
                <th className="py-2.5 px-3">Độ Sai Lệch</th>
                <th className="py-2.5 px-3">Trạng Thái</th>
                <th className="py-2.5 px-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {dimOverrides.map((dim) => {
                const diff = dim.actualMeasMm - (parseInt(dim.nominalText) || 0);
                return (
                  <tr key={dim.id} className="hover:bg-zinc-800/40 transition">
                    <td className="py-2 px-3 font-bold text-amber-400">{dim.id}</td>
                    <td className="py-2 px-3 font-sans text-zinc-300">{dim.location}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          dim.isFake && !dim.fixed
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "text-zinc-200"
                        }`}
                      >
                        {dim.nominalText}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">{dim.actualMeasMm} mm</td>
                    <td className="py-2 px-3">
                      {dim.isFake && !dim.fixed ? (
                        <span className="text-rose-400 font-bold">
                          {diff > 0 ? `+${diff}` : diff} mm (Lệch)
                        </span>
                      ) : (
                        <span className="text-emerald-400">0 mm (Khớp chuẩn)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {dim.isFake && !dim.fixed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Dim Ảo / Bị Sửa Số
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đạt Chuẩn
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-sans">
                      {!dim.fixed ? (
                        <button
                          onClick={() => handleFixDimOverride(dim.id)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
                        >
                          Sửa về số đo thật
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-500 font-mono">Đã khôi phục ✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phân đoạn 3.3: Bảng Cấu Hình Độ Dày Nét In CTB */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-400" />
              Bảng Cấu Hình Độ Dày Nét In CTB (Standard Plot Style Table)
            </h2>
            <p className="text-xs text-zinc-400">
              Quy chuẩn độ dày nét in theo màu ACI tiêu chuẩn xây dựng Việt Nam và quốc tế, đảm bảo
              in ra PDF/bản giấy sắc nét, phân biệt rõ tuyến chính và nền.
            </p>
          </div>

          <button
            onClick={handleDownloadCtb}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất File Cấu Hình In xboss_standard.ctb</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                <th className="py-2.5 px-3">Mã Màu ACI</th>
                <th className="py-2.5 px-3">Mẫu Màu</th>
                <th className="py-2.5 px-3">Độ Dày Nét In (mm)</th>
                <th className="py-2.5 px-3">Độ Đậm (Screening)</th>
                <th className="py-2.5 px-3">Mục Đích Sử Dụng Kỹ Thuật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {ctbMappings.map((c) => (
                <tr key={c.colorIndex} className="hover:bg-zinc-800/40 transition">
                  <td className="py-2 px-3 font-bold text-zinc-200">{c.colorName}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border border-zinc-600"
                        style={{ backgroundColor: c.colorHex }}
                      />
                      <span className="text-zinc-400">{c.colorHex}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-amber-400 font-bold">{c.lineweightMm} mm</td>
                  <td className="py-2 px-3 text-zinc-300">{c.screeningPct}%</td>
                  <td className="py-2 px-3 font-sans text-zinc-300">{c.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Next Step CTA */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <div className="text-xs text-zinc-300">
          <span className="font-bold text-amber-300">Bước tiếp theo:</span> Quản lý cây liên kết
          XREF, so sánh chênh lệch phiên bản (CAD 2D Diff) và trình sinh mã AutoLISP 2D.
        </div>
        <button
          onClick={() => setStep1SubTab("xref_diff_lisp")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-on-accent-dark font-bold text-xs transition"
        >
          <span>Chuyển Sang Mục 4: Cây XREF, Diff & AutoLISP 2D</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
