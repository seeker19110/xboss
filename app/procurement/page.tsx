"use client";
import { Suspense, useState } from "react";
import {
  Package,
  Calculator,
  Truck,
  QrCode,
  Gavel,
  HardHat,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  FileSpreadsheet,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

export default function ProcurementHubPage() {
  return (
    <Suspense fallback={<ProcurementSkeleton />}>
      <ProcurementContent />
    </Suspense>
  );
}

function ProcurementSkeleton() {
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Skeleton className="h-12 w-64 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

function ProcurementContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Tổng Danh Mục BOQ",
      value: "320 Mục",
      change: "100% Khớp WBS",
      isPositive: true,
      icon: Calculator,
    },
    {
      label: "Đơn Đặt Hàng (PO)",
      value: "28 Đơn",
      change: "4 Đơn đang giao",
      isPositive: true,
      icon: Truck,
    },
    {
      label: "Lô Hàng Đã Nhập Kho (GRN)",
      value: "142 Phiếu",
      change: "QR Scan 100%",
      isPositive: true,
      icon: QrCode,
    },
    {
      label: "Cảnh Báo Vượt Định Mức",
      value: "0 Vật tư",
      change: "Kiểm soát an toàn",
      isPositive: true,
      icon: CheckCircle2,
    },
  ]);

  // Tab 1: BOQ & Consumption Norms
  const boqTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              Định Mức Dự Toán BOQ & Khối Lượng Tiêu Hao
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quản lý mã BOQCODE độc nhất, phân cấp cây BOQ và tự động cảnh báo khi khối lượng sử
              dụng vượt định mức.
            </p>
          </div>
          <a
            href="/boq"
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
          >
            <Calculator className="w-3.5 h-3.5" /> Mở Bảng Định Mức BOQ
          </a>
        </div>
      </div>
    </div>
  );

  // Tab 2: Tenders & Bidding Matrix
  const biddingTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-amber-400" />
              Ma Trận So Sánh Đấu Thầu & Đơn Giá Vendor
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Anti-Skewing
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Thuật toán so sánh chi tiết từng dòng báo giá giữa các nhà cung cấp so với ngân sách mục
            tiêu, phát hiện rủi ro Front-Loading (Ứng sớm) và Unbalanced Bidding.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <a
              href="/engineering/bidding-matrix"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Ma Trận Đấu Thầu (M75)
            </a>
            <a
              href="/tenders"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Gói Thầu Mua Sắm
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <HardHat className="w-4 h-4 text-sky-400" />
              Hồ Sơ Năng Lực & Đánh Giá Nhà Thầu Phụ
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Subcon Trust</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Quản trị danh bạ nhà thầu phụ, theo dõi chấm điểm chất lượng (QA/QC), an toàn (HSE) và
            tiến độ thi công sau từng giai đoạn nghiệm thu.
          </p>
          <div className="pt-2">
            <a
              href="/subcontractors"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Danh Bạ Nhà Thầu Phụ
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 3: Purchase Orders & Supply Schedule
  const ordersTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-400" />
              Đơn Đặt Hàng PO & Kế Hoạch Cung Ứng Vật Tư
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Phát hành đơn đặt hàng, theo dõi giao hàng và quản lý danh bạ nhà cung cấp vật tư
              chính hãng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/materials/purchase-orders"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Truck className="w-3.5 h-3.5" /> Quản Lý Đơn Hàng PO
            </a>
            <a
              href="/materials/suppliers"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              Nhà Cung Cấp
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Warehouse & QR Logistics
  const warehouseTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              Kho Vật Tư & Tồn Kho Hiện Trường
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Inventory</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Kiểm soát số lượng nhập, xuất, tồn kho, tự động ghi nhận giao dịch vật tư (Transactions)
            và hỗ trợ đồng bộ hai chiều với Google Sheets bằng Service Account.
          </p>
          <div className="pt-2">
            <a
              href="/materials"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Bảng Kho Vật Tư
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              Tiếp Nhận Hàng Bằng QR Code & Cấp Phiếu GRN
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              3-Way Match
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Quét mã vạch/QR bằng Camera di động hoặc máy quét cầm tay, tự động đối soát 3 chiều (PO
            ≡ GRN ≡ Invoice) và cấp mã Biên Bản Nhập Kho điện tử.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/qr-logistics"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Máy Quét QR Logistics (M78)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "boq",
      label: "Định Mức BOQ",
      icon: Calculator,
      badge: "320 Mục",
      description: "Cây bóc tách khối lượng BOQ, mã BOQCODE độc nhất và kiểm soát tiêu hao vật tư.",
      content: boqTab,
    },
    {
      id: "bidding",
      label: "Đấu Thầu & Vendor",
      icon: Gavel,
      badge: "M75",
      description:
        "Ma trận so sánh báo giá nhà cung cấp, chống Front-loading và đánh giá nhà thầu phụ.",
      content: biddingTab,
    },
    {
      id: "orders",
      label: "Đơn Hàng PO",
      icon: Truck,
      badge: "28 Đơn",
      description: "Phát hành đơn đặt hàng, yêu cầu vật tư và theo dõi tiến độ giao hàng.",
      content: ordersTab,
    },
    {
      id: "warehouse",
      label: "Kho Bãi & QR GRN",
      icon: Package,
      badge: "QR Scan",
      description:
        "Kiểm soát kho bãi, quét mã QR nhận hàng GRN và đối soát 3 chiều PO-GRN-Invoice.",
      content: warehouseTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Chuỗi Cung Ứng, Mua Sắm & Kho Vận"
      subtitle="Phân hệ hợp nhất 11 công cụ Định mức BOQ, Đơn hàng PO, Kho QR Logistics và Đấu thầu báo giá"
      icon={Package}
      badge="Supply Chain Master"
      tabs={tabs}
      defaultTab="boq"
      stats={stats}
    />
  );
}
