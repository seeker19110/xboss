"use client";

import { useState, useEffect } from "react";
import {
  Calculator,
  Gavel,
  HardHat,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  FileSpreadsheet,
  Layers,
} from "lucide-react";

export default function BoqBiddingTab() {
  const [stats, setStats] = useState({
    totalBoqItems: 320,
    matchedWbs: 100,
    vendorsCompared: 5,
    frontLoadingAlerts: 0,
  });

  return (
    <div className="space-y-6">
      {/* 1. Định Mức Dự Toán BOQ & Bóc Tách Khối Lượng */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              Định Mức Dự Toán BOQ & Khối Lượng Tiêu Hao
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quản lý mã BOQCODE độc nhất, phân cấp cây BOQ và tự động kiểm soát khi khối lượng sử
              dụng vượt định mức dự toán.
            </p>
          </div>

          <a
            href="/boq"
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow shrink-0"
          >
            <Calculator className="w-3.5 h-3.5" /> Mở Toàn Bộ Cây BOQ
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-1">
            <span className="text-xs text-zinc-400">Tổng Mã BOQCODE:</span>
            <p className="text-xl font-bold font-mono text-zinc-100">320 Mục</p>
            <span className="text-[11px] text-emerald-400 font-medium">100% Khớp WBS Dự Án</span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-1">
            <span className="text-xs text-zinc-400">Kiểm Soát Vượt ĐM:</span>
            <p className="text-xl font-bold font-mono text-emerald-400">0 Cảnh Báo</p>
            <span className="text-[11px] text-zinc-400 font-medium">An Toàn Ngân Sách</span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-1">
            <span className="text-xs text-zinc-400">Phân Cấp Hệ Cơ Điện:</span>
            <p className="text-xl font-bold font-mono text-sky-400">5 Phân Hệ</p>
            <span className="text-[11px] text-zinc-400 font-medium">OGTĐ, OGHL, OGCH, ODNN</span>
          </div>
        </div>
      </div>

      {/* 2. Đấu Thầu Mua Sắm & Ma Trận So Sánh Báo Giá */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-amber-400" />
              Ma Trận So Sánh Đấu Thầu & Đơn Giá Vendor
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Anti-Skewing
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Thuật toán so sánh chi tiết từng dòng báo giá giữa các nhà cung cấp so với ngân sách mục
            tiêu, phát hiện rủi ro Front-Loading (Ứng trước giá cao) và Unbalanced Bidding.
          </p>

          <div className="flex items-center gap-2 pt-2">
            <a
              href="/engineering/bidding-matrix"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Ma Trận Đấu Thầu (M75) <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="/tenders"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Gói Thầu Mua Sắm
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <HardHat className="w-4 h-4 text-sky-400" />
              Hồ Sơ Năng Lực & Đánh Giá Nhà Thầu Phụ
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Subcon Trust</span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Quản trị danh bạ nhà thầu phụ, theo dõi chấm điểm chất lượng (QA/QC), an toàn (HSE) và
            tiến độ thi công sau từng giai đoạn nghiệm thu công việc.
          </p>

          <div className="pt-2">
            <a
              href="/subcontractors"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Danh Bạ Nhà Thầu Phụ <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
