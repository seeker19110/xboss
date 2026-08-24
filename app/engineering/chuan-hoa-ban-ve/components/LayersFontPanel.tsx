"use client";

import { Dispatch, SetStateAction } from "react";
import {
  Layers,
  Sparkles,
  Copy,
  Download,
  FileCheck,
  Search,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { DxfLayerInfo } from "@/lib/ky-thuat/cad/dxf-parser";
import { showToast } from "@/app/components/Toast";
import type { FontSnippet, Step1SubTab } from "../types";

// BƯỚC 1.2 — Chuẩn hóa layer AIA/BS1192 & bác sĩ font chữ UTF-8.

interface LayersFontPanelProps {
  setStep1SubTab: Dispatch<SetStateAction<Step1SubTab>>;
  selectedDisciplineFilter: string;
  setSelectedDisciplineFilter: Dispatch<SetStateAction<string>>;
  layerSearch: string;
  setLayerSearch: Dispatch<SetStateAction<string>>;
  legacyInput: string;
  setLegacyInput: Dispatch<SetStateAction<string>>;
  convertedText: string;
  sampleFontSnippets: FontSnippet[];
  handleConvertFont: (customText?: string) => void | Promise<void>;
  handleDownloadScr: () => void;
  filteredLayers: DxfLayerInfo[];
}

export default function LayersFontPanel({
  setStep1SubTab,
  selectedDisciplineFilter,
  setSelectedDisciplineFilter,
  layerSearch,
  setLayerSearch,
  legacyInput,
  setLegacyInput,
  convertedText,
  sampleFontSnippets,
  handleConvertFont,
  handleDownloadScr,
  filteredLayers,
}: LayersFontPanelProps) {
  return (
    <div className="space-y-5">
      {/* Phân đoạn 2.1: Chuẩn hóa Layer AIA & Kịch bản .SCR */}
      <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Bảng Quy Chuẩn Layer AIA/BS1192 Sang Mô Hình BIM MEPF
            </h2>
            <p className="text-xs text-zinc-400">
              Tự động ánh xạ layer gốc sang tên chuẩn AIA/BS1192, phân loại mã màu và gán độ dày nét
              cho 5 phân hệ kỹ thuật.
            </p>
          </div>

          {/* Filter and Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Tìm layer..."
                value={layerSearch}
                onChange={(e) => setLayerSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 w-40 sm:w-52"
              />
            </div>

            <button
              onClick={handleDownloadScr}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-on-accent-dark font-bold text-xs shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Kịch Bản .SCR</span>
            </button>
          </div>
        </div>

        {/* Discipline Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "Tất cả phân hệ" },
            { id: "M", label: "M - Gió & Điều hòa" },
            { id: "E", label: "E - Điện & Chiếu sáng" },
            { id: "P", label: "P - Cấp thoát nước" },
            { id: "F", label: "F - Phòng cháy PCCC" },
            { id: "ELV", label: "ELV - Điện nhẹ & BMS" },
            { id: "S", label: "S - Trục lưới kết cấu" },
          ].map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDisciplineFilter(d.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 ${
                selectedDisciplineFilter === d.id
                  ? "bg-zinc-800 text-amber-300 border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200 bg-zinc-950/40"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Layer Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-semibold">
                <th className="py-2.5 px-3">Phân Hệ</th>
                <th className="py-2.5 px-3">Tên Layer Gốc (Bản Vẽ Thiết Kế)</th>
                <th className="py-2.5 px-3">Layer Chuẩn Hóa BIM (AIA)</th>
                <th className="py-2.5 px-3">Mã Màu Chuẩn</th>
                <th className="py-2.5 px-3">Số Đối Tượng</th>
                <th className="py-2.5 px-3 text-right">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {filteredLayers.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-800/40 transition">
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-amber-400 font-bold text-[10px]">
                      {r.discipline}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 line-through">{r.name}</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">{r.standardName}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5 font-sans">
                      <span
                        className="w-3 h-3 rounded-full border border-zinc-700"
                        style={{ backgroundColor: r.colorHex }}
                      />
                      <span className="text-[11px] text-zinc-300">Mã {r.colorNumber}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-300 tabular-nums">
                    {r.entityCount} entities
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã Chuẩn Hóa
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phân đoạn 2.2: Bác Sĩ Font Chữ Tiếng Việt (Font Doctor & Ký Hiệu CAD) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Interactive Font Converter */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-amber-400" />
              Trình Chữa Lành Font Chữ Tiếng Việt & Ký Hiệu Kỹ Thuật (Font Doctor)
            </h2>
            <p className="text-xs text-zinc-400">
              Chuyển đổi bảng mã font nhị phân .shx, VNI-Windows và TCVN3-ABC bị vỡ font sang
              Unicode UTF-8 chuẩn xác, bảo toàn trọn vẹn số liệu cao độ, đường kính $\varnothing$ và
              dung sai $\pm$.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">
              Văn bản CAD nguồn (Lỗi font / Bảng mã cũ):
            </label>
            <textarea
              rows={4}
              value={legacyInput}
              onChange={(e) => setLegacyInput(e.target.value)}
              placeholder="Dán text hoặc cao độ từ bản vẽ CAD vào đây..."
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleConvertFont()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Chuyển Đổi Sang Unicode UTF-8</span>
            </button>
          </div>

          {convertedText && (
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                <span>Kết quả chuẩn hóa Unicode:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(convertedText);
                    showToast("Đã copy text UTF-8!");
                  }}
                  className="p-1 hover:text-white transition flex items-center gap-1 text-[11px]"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>
              <p className="text-sm font-medium text-zinc-100 font-sans">{convertedText}</p>
            </div>
          )}
        </div>

        {/* Right Column: Sample Snippets & Technical Symbols */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-sky-400" />
            Mẫu Text Thường Gặp & Thử Nghiệm Nhanh
          </h3>

          <div className="space-y-2 pt-1">
            {sampleFontSnippets.map((s, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setLegacyInput(s.source);
                  handleConvertFont(s.source);
                }}
                className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-amber-500/50 cursor-pointer transition space-y-1 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-300">{s.label}</span>
                  <span className="text-[10px] text-amber-400 group-hover:underline">
                    Thử ngay →
                  </span>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 line-through">{s.source}</div>
                <div className="text-xs font-medium text-emerald-400 font-sans">{s.expected}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next Step CTA */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <div className="text-xs text-zinc-300">
          <span className="font-bold text-amber-300">Bước tiếp theo:</span> Trích xuất Block sang
          BOQ Dự toán, rà soát Dim ảo và thiết lập bảng nét in CTB.
        </div>
        <button
          onClick={() => setStep1SubTab("boq_dim_ctb")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-on-accent-dark font-bold text-xs transition"
        >
          <span>Chuyển Sang Mục 3: Block BOQ, Dim & Nét In</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
