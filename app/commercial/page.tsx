"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import {
  Coins,
  FileSignature,
  Receipt,
  Scale,
  TrendingUp,
  ShieldCheck,
  Wallet,
  Umbrella,
  FilePlus2,
  FileCheck2,
  Banknote,
  ArrowUpRight,
  Calculator,
  Percent,
  Clock,
  FileText,
  AlertTriangle,
  Layers,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

export default function CommercialHubPage() {
  return (
    <Suspense fallback={<CommercialSkeleton />}>
      <CommercialContent />
    </Suspense>
  );
}

function CommercialSkeleton() {
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

function CommercialContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Giá Trị Hợp Đồng A-B",
      value: "48.5 Tỷ",
      change: "100% Ký kết",
      isPositive: true,
      icon: FileSignature,
    },
    {
      label: "Lũy Kế IPC Đã Duyệt",
      value: "24.2 Tỷ",
      change: "6 Kỳ (49.8%)",
      isPositive: true,
      icon: Receipt,
    },
    {
      label: "Phát Sinh VO & Claims",
      value: "3.8 Tỷ",
      change: "4 VO / 2 Claims",
      isPositive: true,
      icon: Scale,
    },
    {
      label: "Dự Báo Dòng Tiền",
      value: "Thặng Dư",
      change: "Vốn an toàn 90N",
      isPositive: true,
      icon: TrendingUp,
    },
  ]);

  // Tab 1: Contracts & Subcontracts
  const contractsTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-amber-400" />
              Quản Trị Hợp Đồng Chính A-B, Thầu Phụ B-B&apos; & Ngân Sách
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quản lý toàn diện hợp đồng nhận thầu (A-B), giao thầu phụ (B-B&apos;), cam kết chi,
              hạn mức dự toán và bảo lãnh ngân hàng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/contracts"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
            >
              <FileSignature className="w-3.5 h-3.5" /> Quản Lý Hợp Đồng
            </Link>
            <Link
              href="/costs"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" /> Hạn Mức Chi Phí
            </Link>
          </div>
        </div>

        {/* 4 Financial Pillar Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <Link
            href="/costs"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group transition-all"
          >
            <div className="text-zinc-400">Kiểm Soát Chi Phí</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Hạn Mức Dự Toán</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Theo dõi cam kết chi vs thực tế</p>
          </Link>
          <Link
            href="/proposals"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group transition-all"
          >
            <div className="text-zinc-400">Đề Xuất & Duyệt Chi</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Phiếu Đề Xuất</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Luồng duyệt đa cấp tự động</p>
          </Link>
          <Link
            href="/insurance"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group transition-all"
          >
            <div className="text-zinc-400">Bảo Lãnh & Bảo Hiểm</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Bảo Hiểm Công Trình</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Hạn bảo lãnh tạm ứng & bảo hành</p>
          </Link>
          <Link
            href="/finance"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group transition-all"
          >
            <div className="text-zinc-400">Tài Chính Kế Toán</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Sổ Kế Toán Dự Án</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Hạch toán thu chi & đối soát ngân hàng</p>
          </Link>
        </div>
      </div>
    </div>
  );

  // Tab 2: IPC & Progress Billings
  const ipcPaymentsTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Nghiệm Thu Khối Lượng TT96/2021 & Chứng Chỉ Thanh Toán IPC
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quyết toán khối lượng hoàn thành, thu hồi tạm ứng lũy tiến theo tỷ lệ 20% - 80%, trích
              giữ tiền bảo hành 5%-10% và thuế VAT theo Nghị định 70/2025/NĐ-CP.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/payment-certs"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Receipt className="w-3.5 h-3.5" /> Chứng Chỉ IPC
            </Link>
            <Link
              href="/payments"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5" /> Đề Nghị Thanh Toán
            </Link>
          </div>
        </div>

        {/* IPC Accounting Equation Formula Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
              Công Thức Bất Biến IPC
            </span>
            <div className="text-xs font-mono text-zinc-200">
              NetPayable = Giá Trị Kỳ - Thu Tạm Ứng - Giữ BH (5%) + VO
            </div>
            <p className="text-[11px] text-zinc-400">
              Tự động cân đối tài khoản không sai lệch từng xu
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-sky-400 font-bold">
              Thu Hồi Tạm Ứng Lũy Tiến
            </span>
            <div className="text-xs font-mono text-zinc-200">20% ≤ Lũy Kế ≤ 80%</div>
            <p className="text-[11px] text-zinc-400">
              Khấu trừ đều đặn theo tỷ lệ hoàn thành nghiệm thu
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
              Thuế VAT & Hóa Đơn Điện Tử
            </span>
            <div className="text-xs font-mono text-zinc-200">NĐ 70/2025/NĐ-CP</div>
            <p className="text-[11px] text-zinc-400">
              Tích hợp mã xác thực CQT và bảng kê hóa đơn điện tử
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 3: Variations & Price Escalation
  const voEscalationTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-sky-400" />
              Thay Đổi Phát Sinh (VO) & Bù Giá Trượt Giá Đa Thành Phần GSO
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Thẩm định thứ bậc đơn giá phát sinh theo Điều 12.3 FIDIC, công thức bù giá trượt giá
              GSO và phát hành phụ lục hợp đồng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/variations"
              className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <FilePlus2 className="w-3.5 h-3.5" /> Sổ Phát Sinh (VO)
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-sky-400" /> Thứ Bậc Đơn Giá Điều 12.3 FIDIC
              </span>
              <span className="text-[10px] font-mono text-zinc-400">Valuation Hierarchy</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              1. Đơn giá Hợp đồng gốc → 2. Đơn giá Tương tự đã duyệt → 3. Đơn giá Chiết tính mới
              theo Thông tư 12/2021/TT-BXD.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-emerald-400" /> Bù Giá GSO Đa Thành Phần
              </span>
              <span className="text-[10px] font-mono text-zinc-400">Formula Pn/P0</span>
            </div>
            <p className="text-xs font-zinc-300 font-mono text-emerald-300/90 text-xs">
              Pn = P0 × (a + b·Ln/L0 + c·Mn/M0 + d·En/E0)
            </p>
            <p className="text-[11px] text-zinc-400">
              Tự động cập nhật chỉ số nhân công, vật liệu, ca máy từ Sở Xây dựng
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: FIDIC Claims & Time-Bar Defense
  const fidicClaimsTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400" />
              Phòng Vệ Pháp Lý & Studio Claim FIDIC (M79)
            </h3>
            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Time-Bar 28 Ngày
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Trạm gác kiểm soát thời hạn thông báo 28 ngày Điều 20.1 (FIDIC 1999) & Điều 20.2 (FIDIC
            2017), tự động ánh xạ điều khoản EOT / Cost / Profit và phân tích chậm trễ đồng thời
            (Concurrent Delays theo SCL Protocol).
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Link
              href="/engineering/fidic-claims"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              <Scale className="w-3.5 h-3.5" /> Studio Khiếu Nại FIDIC (M79)
            </Link>
            <Link
              href="/claims"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Sổ Claim Chi Phí
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              Phân Tích Tác Động TIA & Chi Phí Quản Lý Kéo Dài
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">SCL Protocol</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Chèn mạng công việc Fragnet vào mô hình CPM để tính toán ΔEOT hợp lệ. Tính toán chi phí
            định phí doanh nghiệp kéo dài theo công thức chuẩn quốc tế Hudson, Emden và Eichleay.
          </p>
          <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-amber-300/90 space-y-1">
            <div>Claim Eichleay = (Overhead Dự Án / Ngày Thực Hiện) × ΔEOT</div>
            <div className="text-zinc-400">
              Site Overheads = ΔEOT × (Lương BCH + Thuê Lán Trại + Điện Nước)
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 5: Cashflow & e-Sign BBNT
  const cashflowEsignTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Mô Phỏng Dòng Tiền Dynamic Cashflow (M85)
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              S-Curve Cash
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Mô phỏng dòng tiền Thu/Chi ($Cash-In$ vs $Cash-Out$) theo phân phối chuẩn tích lũy, phát
            hiện điểm uốn thâm hụt vốn lưu động trước 30/60/90 ngày khi có độ trễ giải ngân IPC.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/cashflow"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              <TrendingUp className="w-3.5 h-3.5" /> Mô Phỏng Dòng Tiền (M85)
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Ký Số Điện Tử 3 Bên & Chứng Thư BBNT Bất Biến (M84)
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">SHA-256 PKI</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Luồng ký số tuần tự 3 bên (Kỹ sư Nhà thầu ➔ TVGS ➔ Chủ đầu tư) theo Nghị định
            06/2021/NĐ-CP, niêm phong mã băm mật mã và sinh chứng thư kiểm toán điện tử không thể
            chối bỏ.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/esign"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Studio Ký Số e-Sign (M84)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "contracts",
      label: "Hợp Đồng & Ngân Sách",
      icon: FileSignature,
      badge: "48.5 Tỷ",
      description:
        "Quản trị hợp đồng chính A-B, thầu phụ B-B', kiểm soát chi phí hạn mức và bảo lãnh ngân hàng.",
      content: contractsTab,
    },
    {
      id: "ipc-payments",
      label: "Quyết Toán & IPC",
      icon: Receipt,
      badge: "6 Kỳ",
      description:
        "Nghiệm thu khối lượng TT96, phát hành chứng chỉ thanh toán IPC, thu hồi tạm ứng và đề nghị chi.",
      content: ipcPaymentsTab,
    },
    {
      id: "vo-variations",
      label: "Phát Sinh & Bù Giá",
      icon: FilePlus2,
      badge: "4 VO",
      description:
        "Thay đổi thiết kế ngoài hợp đồng, thứ bậc đơn giá Điều 12.3 FIDIC và bù trượt giá đa thành phần GSO.",
      content: voEscalationTab,
    },
    {
      id: "fidic-claims",
      label: "Phòng Vệ & Claim FIDIC",
      icon: Scale,
      badge: "Time-Bar 28D",
      description:
        "Trạm gác Time-Bar 28 ngày, phân tích tác động đường găng TIA và lập hồ sơ khiếu nại song ngữ chuẩn mực.",
      content: fidicClaimsTab,
    },
    {
      id: "cashflow-esign",
      label: "Dòng Tiền & Ký Số",
      icon: TrendingUp,
      badge: "Dynamic",
      description:
        "Mô phỏng dòng tiền vốn lưu động S-Curve và quy trình ký số 3 bên sinh chứng thư điện tử bất biến.",
      content: cashflowEsignTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Hợp Đồng, Chi Phí, Quyết Toán & Pháp Lý FIDIC"
      subtitle="Chuỗi giá trị thương mại hợp nhất 13 công cụ Hợp đồng A-B, Chứng chỉ IPC, Phát sinh VO, Khiếu nại FIDIC, e-Sign và Dòng tiền"
      icon={Coins}
      badge="Commercial Cockpit"
      tabs={tabs}
      defaultTab="contracts"
      stats={stats}
    />
  );
}
