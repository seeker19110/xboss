"use client";

import { Suspense, useState, useEffect } from "react";
import { Coins, FileSignature, Receipt, Scale, TrendingUp, FilePlus2 } from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";
import ContractsTab from "./_components/ContractsTab";
import IpcPaymentsTab from "./_components/IpcPaymentsTab";
import VariationsTab from "./_components/VariationsTab";
import ClaimsTab from "./_components/ClaimsTab";
import FinanceCashflowTab from "./_components/FinanceCashflowTab";

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

  useEffect(() => {
    Promise.all([
      fetch("/api/contracts").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/payment-certs").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/variations").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/claims").then((r) => (r.ok ? r.json() : null)),
    ]).then(([cData, certData, voData, clmData]) => {
      const cList = cData?.contracts || [];
      const certList = certData?.certs || [];
      const voList = voData?.variations || [];
      const clmList = clmData?.claims || [];

      const totalContract = cList.reduce((acc: number, c: any) => acc + (Number(c.value) || 0), 0);
      const totalVo = voList.reduce(
        (acc: number, v: any) => acc + (Number(v.totalApproved) || 0),
        0,
      );

      function fmtShort(n: number) {
        if (!n) return "0 Tỷ";
        return `${(n / 1_000_000_000).toFixed(1)} Tỷ`;
      }

      setStats([
        {
          label: "Giá Trị Hợp Đồng A-B",
          value: fmtShort(totalContract) || "48.5 Tỷ",
          change: `${cList.length} Hợp đồng`,
          isPositive: true,
          icon: FileSignature,
        },
        {
          label: "Chứng Chỉ IPC Đã Duyệt",
          value: `${certList.filter((c: any) => c.status === "approved").length} Kỳ`,
          change: `${certList.length} Kỳ đã lập`,
          isPositive: true,
          icon: Receipt,
        },
        {
          label: "Phát Sinh VO Đã Duyệt",
          value: fmtShort(totalVo) || "3.8 Tỷ",
          change: `${voList.length} Phiếu VO`,
          isPositive: true,
          icon: Scale,
        },
        {
          label: "Sổ Khiếu Nại Claims",
          value: `${clmList.length} Vụ`,
          change: "Time-Bar 28D OK",
          isPositive: true,
          icon: TrendingUp,
        },
      ]);
    });
  }, []);

  const tabs: HubTab[] = [
    {
      id: "contracts",
      label: "Hợp Đồng & Ngân Sách",
      icon: FileSignature,
      badge: "Hợp đồng & Chi phí",
      description:
        "Quản trị hợp đồng chính A-B, thầu phụ B-B', kiểm soát chi phí hạn mức và bảo lãnh ngân hàng.",
      content: <ContractsTab />,
    },
    {
      id: "ipc-payments",
      label: "Quyết Toán & IPC",
      icon: Receipt,
      badge: "TT96 & IPC",
      description:
        "Nghiệm thu khối lượng TT96, phát hành chứng chỉ thanh toán IPC, thu hồi tạm ứng và đề nghị chi.",
      content: <IpcPaymentsTab />,
    },
    {
      id: "vo-variations",
      label: "Phát Sinh & Bù Giá",
      icon: FilePlus2,
      badge: "VO & GSO",
      description:
        "Thay đổi thiết kế ngoài hợp đồng, thứ bậc đơn giá Điều 12.3 FIDIC và bù trượt giá đa thành phần GSO.",
      content: <VariationsTab />,
    },
    {
      id: "fidic-claims",
      label: "Phòng Vệ & Claim FIDIC",
      icon: Scale,
      badge: "Time-Bar 28D",
      description:
        "Trạm gác Time-Bar 28 ngày, phân tích tác động đường găng TIA và lập hồ sơ khiếu nại song ngữ chuẩn mực.",
      content: <ClaimsTab />,
    },
    {
      id: "cashflow-esign",
      label: "Dòng Tiền & Ký Số",
      icon: TrendingUp,
      badge: "S-Curve & e-Sign",
      description:
        "Mô phỏng dòng tiền vốn lưu động S-Curve và quy trình ký số 3 bên sinh chứng thư điện tử bất biến.",
      content: <FinanceCashflowTab />,
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
