"use client";
import { Suspense, useState } from "react";
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
  Printer,
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
      change: "Đã ký 100%",
      isPositive: true,
      icon: FileSignature,
    },
    {
      label: "Chứng Chỉ IPC Đã Xuất",
      value: "6 Kỳ (24.2 Tỷ)",
      change: "Giải ngân 98%",
      isPositive: true,
      icon: Receipt,
    },
    {
      label: "Hồ Sơ Claim FIDIC",
      value: "2 Hồ Sơ",
      change: "Time-Bar an toàn",
      isPositive: true,
      icon: Scale,
    },
    {
      label: "Dự Báo Dòng Tiền",
      value: "Thặng Dư",
      change: "Không hụt vốn",
      isPositive: true,
      icon: TrendingUp,
    },
  ]);

  // Tab 1: Contracts & Budget
  const contractsTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-amber-400" />
              Hợp Đồng Xây Dựng & Kiểm Soát Ngân Sách
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quản lý hợp đồng chính A-B và các gói thầu phụ B-B&apos;, hạn mức chi phí, bảo lãnh
              ngân hàng và bảo hiểm.
            </p>
          </div>
          <a
            href="/contracts"
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
          >
            <FileSignature className="w-3.5 h-3.5" /> Quản Lý Hợp Đồng
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <a
            href="/costs"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Kiểm Soát Chi Phí</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Hạn Mức Dự Toán</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/proposals"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Đề Xuất & Phê Duyệt</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Phiếu Đề Xuất</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/insurance"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Bảo Lãnh & Bảo Hiểm</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Bảo Hiểm Công Trình</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/finance"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Tài Chính Kế Toán</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Sổ Kế Toán Dự Án</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
        </div>
      </div>
    </div>
  );

  // Tab 2: IPC & Progress Payments
  const ipcPaymentsTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Nghiệm Thu Khối Lượng Hoàn Thành & Chứng Chỉ IPC
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quyết toán A-B theo Thông tư 96/2021/TT-BTC, phát hành chứng chỉ thanh toán IPC và in
              ủy nhiệm chi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/payment-certs"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Receipt className="w-3.5 h-3.5" /> Chứng Chỉ IPC
            </a>
            <a
              href="/payments"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5" /> Đề Nghị Thanh Toán
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 3: Variations & FIDIC Claims
  const voClaimsTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400" />
              Phòng Vệ Pháp Lý & Claim FIDIC (Time-Bar 28 Ngày)
            </h3>
            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              FIDIC Red/Yellow
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Tự động ánh xạ điều khoản FIDIC (EOT, Cost, Profit), trạm gác kiểm soát thời hạn thông
            báo 28 ngày Điều 20.1, phân tích tác động đường găng TIA và biên soạn hồ sơ khiếu nại
            song ngữ.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/fidic-claims"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Studio Khiếu Nại FIDIC (M79)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-sky-400" />
              Thay Đổi Phát Sinh (Variation Orders) & Bù Giá
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">VO Log</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Quản lý danh mục thay đổi thiết kế ngoài hợp đồng, đơn giá điều chỉnh, bù trượt giá vật
            liệu và phê duyệt phụ lục hợp đồng.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <a
              href="/variations"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Phát Sinh (VO)
            </a>
            <a
              href="/claims"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Claim Chi Phí
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Cashflow & e-Sign BBNT
  const cashflowEsignTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Mô Phỏng Dòng Tiền (Dynamic Cashflow) & Vốn Lưu Động
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              S-Curve Cash
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Mô phỏng dòng tiền Thu/Chi ($Cash-In$ vs $Cash-Out$), phát hiện điểm uốn thâm hụt vốn
            lưu động khi có độ trễ phê duyệt IPC và đề xuất giải pháp tài chính kịp thời.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/cashflow"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Mô Phỏng Dòng Tiền (M85)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Ký Số Điện Tử 3 Bên & Chứng Thư BBNT Bất Biến
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">SHA-256 PKI</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Luồng ký số tuần tự (Kỹ sư Nhà thầu ➔ TVGS ➔ Chủ đầu tư), niêm phong mật mã bất biến và
            sinh chứng thư kiểm toán điện tử không thể chối bỏ.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/esign"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Studio Ký Số e-Sign (M84)
            </a>
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
        "Quản lý hợp đồng chính A-B, thầu phụ B-B', kiểm soát chi phí và bảo lãnh bảo hiểm.",
      content: contractsTab,
    },
    {
      id: "ipc-payments",
      label: "Quyết Toán & IPC",
      icon: Receipt,
      badge: "6 Kỳ",
      description:
        "Nghiệm thu khối lượng TT96, phát hành chứng chỉ thanh toán IPC và đề nghị thanh toán.",
      content: ipcPaymentsTab,
    },
    {
      id: "vo-claims",
      label: "Phát Sinh & Claim FIDIC",
      icon: Scale,
      badge: "Time-Bar 28D",
      description:
        "Thay đổi phát sinh VO, phân tích TIA và hồ sơ khiếu nại chuẩn mực theo hợp đồng FIDIC.",
      content: voClaimsTab,
    },
    {
      id: "cashflow-esign",
      label: "Dòng Tiền & Ký Số",
      icon: TrendingUp,
      badge: "Dynamic",
      description:
        "Mô phỏng dòng tiền vốn lưu động và quy trình ký số 3 bên sinh chứng thư điện tử.",
      content: cashflowEsignTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Hợp Đồng, Chi Phí, Quyết Toán & FIDIC"
      subtitle="Phân hệ hợp nhất 13 công cụ Hợp đồng A-B, Chứng chỉ IPC, Phát sinh VO, Khiếu nại FIDIC, e-Sign và Dòng tiền"
      icon={Coins}
      badge="Commercial Cockpit"
      tabs={tabs}
      defaultTab="contracts"
      stats={stats}
    />
  );
}
