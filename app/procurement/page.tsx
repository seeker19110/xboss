"use client";

import { Suspense, useState, useEffect } from "react";
import {
  Package,
  Calculator,
  Truck,
  QrCode,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";
import InventoryTab from "./_components/InventoryTab";
import OrdersTab from "./_components/OrdersTab";
import QrLogisticsTab from "./_components/QrLogisticsTab";
import SuppliersTab from "./_components/SuppliersTab";
import BoqBiddingTab from "./_components/BoqBiddingTab";

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
  // Dải KPI: khởi tạo "—", chỉ đổi khi API trả thật. Trước đây khởi tạo bằng số cắm cứng
  // ("320 Mục", "28 Đơn", "142 Phiếu") và fallback `|| 320` / `|| 28` / `|| 142` biến dự
  // án rỗng (đếm 0) thành số bịa — đúng lớp lỗi ở audit 2026-08-25 §3.2.
  const [stats, setStats] = useState<HubStat[]>([
    { label: "Tổng Danh Mục Vật Tư", value: "—", icon: Calculator },
    { label: "Đơn Đặt Hàng (PO)", value: "—", icon: Truck },
    { label: "Lô Hàng Tiếp Nhận (GRN)", value: "—", icon: QrCode },
    { label: "Cảnh Báo Vượt Định Mức", value: "—", icon: CheckCircle2 },
  ]);

  useEffect(() => {
    const get = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([
      get("/api/materials"),
      get("/api/purchase-orders"),
      get("/api/engineering/logistics/shipments"),
    ]).then(([matData, poData, shpData]) => {
      const matList: { qtyPlanned?: number; qtyUsed?: number }[] | null =
        matData?.materials ?? null;
      const poList: { status?: string }[] | null = poData?.orders ?? null;
      const shpList: unknown[] | null = shpData?.data ?? null;

      const overBudget =
        matList == null
          ? null
          : matList.filter((m) => (m.qtyPlanned ?? 0) > 0 && (m.qtyUsed ?? 0) > (m.qtyPlanned ?? 0))
              .length;
      const deliveringCount =
        poList == null
          ? null
          : poList.filter((p) => p.status === "delivering" || p.status === "partial").length;

      setStats([
        {
          label: "Tổng Danh Mục Vật Tư",
          value: matList == null ? "—" : `${matList.length} Mục`,
          icon: Calculator,
        },
        {
          label: "Đơn Đặt Hàng (PO)",
          value: poList == null ? "—" : `${poList.length} Đơn`,
          change: deliveringCount == null ? undefined : `${deliveringCount} Đơn đang vận chuyển`,
          icon: Truck,
        },
        {
          label: "Lô Hàng Tiếp Nhận (GRN)",
          value: shpList == null ? "—" : `${shpList.length} Lô`,
          icon: QrCode,
        },
        {
          label: "Cảnh Báo Vượt Định Mức",
          value: overBudget == null ? "—" : `${overBudget} Vật tư`,
          change:
            overBudget == null ? undefined : overBudget === 0 ? "Kiểm soát an toàn" : "Cần rà soát",
          isPositive: overBudget == null ? undefined : overBudget === 0,
          icon: overBudget === 0 ? CheckCircle2 : AlertTriangle,
        },
      ]);
    });
  }, []);

  const tabs: HubTab[] = [
    {
      id: "inventory",
      label: "Kho & Định Mức",
      icon: Package,
      badge: "Vật tư & Tồn kho",
      description:
        "Kiểm soát định mức BOQ vs Tháp A, tồn kho an toàn, đồng bộ Google Sheets và in tem QR.",
      content: <InventoryTab />,
    },
    {
      id: "orders",
      label: "Đơn Hàng & PR",
      icon: Truck,
      badge: "Vòng đời PO",
      description:
        "Phát hành đơn đặt hàng PO (6 bước), tiếp nhận yêu cầu mua PR, nhập hàng và đánh giá NCC.",
      content: <OrdersTab />,
    },
    {
      id: "qr-logistics",
      label: "Quét QR & GRN",
      icon: QrCode,
      badge: "3-Way Match",
      description:
        "Quét mã QR camera tiếp nhận hàng tại cổng, đối soát 3 chiều (PO ≡ GRN ≡ Invoice) và cấp phiếu GRN.",
      content: <QrLogisticsTab />,
    },
    {
      id: "suppliers",
      label: "Nhà Cung Cấp",
      icon: Building2,
      badge: "Vendor Matrix",
      description:
        "Danh bạ nhà cung cấp vật tư chính hãng, thông tin pháp lý bên Mua/Bán và chấm điểm uy tín.",
      content: <SuppliersTab />,
    },
    {
      id: "boq",
      label: "BOQ & Đấu Thầu",
      icon: Calculator,
      badge: "M75",
      description:
        "Cây bóc tách khối lượng BOQ WBS và ma trận so sánh đơn giá chào thầu chống Front-Loading.",
      content: <BoqBiddingTab />,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Chuỗi Cung Ứng, Mua Sắm & Kho Vận"
      subtitle="Hợp nhất toàn diện Vòng đời Vật tư từ Định mức BOQ, Đơn hàng PO, Quét QR GRN đến Quản lý Kho"
      icon={Package}
      badge="Procurement Master"
      tabs={tabs}
      defaultTab="inventory"
      stats={stats}
    />
  );
}
