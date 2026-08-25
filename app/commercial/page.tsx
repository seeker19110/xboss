"use client";

import { Suspense, useState, useEffect } from "react";
import { Coins, FileSignature, Receipt, Scale, TrendingUp, FilePlus2 } from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";
import { addMoney, formatVnd, parseMoney } from "@/lib/nen/money";
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
  // Dải KPI: khởi tạo "—", chỉ đổi khi API trả thật. Trước đây khởi tạo bằng GIÁ TRỊ TIỀN
  // cắm cứng ("48.5 Tỷ", "24.2 Tỷ", "3.8 Tỷ") — API lỗi/dự án rỗng là số tiền bịa đứng
  // nguyên trên màn hình (audit 2026-08-25 §3.2). Cùng đợt sửa 3 lỗi đọc sai dữ liệu:
  //  - `voData.variations` / `clmData.claims`: API trả khoá `items` → hai ô luôn rỗng.
  //  - `v.totalApproved`: trường không tồn tại (đúng tên là `approvedValue`) → luôn 0.
  //  - Tổng tiền hợp đồng cộng trên float JS; nay cộng qua lib/nen/money.ts trên cột
  //    `valueText` (`::text`) đúng quy ước tiền tệ M45 PR1.
  const [stats, setStats] = useState<HubStat[]>([
    { label: "Giá Trị Hợp Đồng A-B", value: "—", icon: FileSignature },
    { label: "Chứng Chỉ IPC Đã Duyệt", value: "—", icon: Receipt },
    { label: "Phát Sinh VO Đã Duyệt", value: "—", icon: Scale },
    { label: "Sổ Khiếu Nại Claims", value: "—", icon: TrendingUp },
  ]);

  useEffect(() => {
    const get = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([
      get("/api/contracts"),
      get("/api/payment-certs"),
      get("/api/variations"),
      get("/api/claims"),
    ]).then(([cData, certData, voData, clmData]) => {
      const cList: { valueText?: string }[] | null = cData?.contracts ?? null;
      const certList: { status?: string }[] | null = certData?.certs ?? null;
      const voList: { status?: string }[] | null = voData?.items ?? null;
      const clmList: unknown[] | null = clmData?.items ?? null;

      const contractTotal =
        cList == null ? null : addMoney(...cList.map((c) => parseMoney(c.valueText ?? "0")));

      setStats([
        {
          label: "Giá Trị Hợp Đồng A-B",
          value: contractTotal == null ? "—" : formatVnd(contractTotal),
          change: cList == null ? undefined : `${cList.length} Hợp đồng`,
          icon: FileSignature,
        },
        {
          label: "Chứng Chỉ IPC Đã Duyệt",
          value:
            certList == null ? "—" : `${certList.filter((c) => c.status === "approved").length} Kỳ`,
          change: certList == null ? undefined : `${certList.length} Kỳ đã lập`,
          icon: Receipt,
        },
        {
          label: "Phát Sinh VO Đã Duyệt",
          value:
            voList == null
              ? "—"
              : `${voList.filter((v) => v.status === "approved" || v.status === "partially_approved" || v.status === "contract_added").length} Phiếu`,
          change: voList == null ? undefined : `${voList.length} Phiếu VO`,
          icon: Scale,
        },
        {
          label: "Sổ Khiếu Nại Claims",
          value: clmList == null ? "—" : `${clmList.length} Vụ`,
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
