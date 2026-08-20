"use client";

import { Suspense, useState, useEffect } from "react";
import {
  HardHat,
  ClipboardList,
  CheckSquare,
  LandPlot,
  ShieldAlert,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";
import TasksDiaryTab from "./_components/TasksDiaryTab";
import ApprovalsQcTab from "./_components/ApprovalsQcTab";
import WorkFrontsTab from "./_components/WorkFrontsTab";
import HseSafetyTab from "./_components/HseSafetyTab";
import EquipmentVehiclesTab from "./_components/EquipmentVehiclesTab";

export default function SiteCommandHubPage() {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <SiteCommandContent />
    </Suspense>
  );
}

function SiteSkeleton() {
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

function SiteCommandContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Việc Chờ Xử Lý",
      value: "14 Task",
      change: "Hạn hôm nay: 3",
      isPositive: false,
      icon: ClipboardList,
    },
    {
      label: "Nghiệm Thu Chờ Duyệt",
      value: "6 Phiếu",
      change: "2 BBNT e-Sign",
      isPositive: true,
      icon: CheckSquare,
    },
    {
      label: "Mặt Bằng Đang Thi Công",
      value: "8 Sàn",
      change: "FL06 - FL13",
      isPositive: true,
      icon: LandPlot,
    },
    {
      label: "Chỉ Số An Toàn HSE",
      value: "96/100",
      change: "0 Tai nạn",
      isPositive: true,
      icon: ShieldCheck,
    },
  ]);

  useEffect(() => {
    Promise.all([
      fetch("/api/approvals").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/work-fronts").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : null)),
    ]).then(([appData, wfData, eqData]) => {
      const appCount = appData?.pending?.length || 6;
      const wfCount = wfData?.fronts?.filter((f: any) => f.status === "active")?.length || 8;
      const eqCount = eqData?.items?.length || 12;

      setStats([
        {
          label: "Nghiệm Thu Chờ Duyệt",
          value: `${appCount} Phiếu`,
          change: "Cần ký duyệt",
          isPositive: appCount < 10,
          icon: CheckSquare,
        },
        {
          label: "Mặt Bằng Đang Thi Công",
          value: `${wfCount} Sàn`,
          change: "FL06 - FL13",
          isPositive: true,
          icon: LandPlot,
        },
        {
          label: "Thiết Bị Cơ Giới",
          value: `${eqCount} Máy móc`,
          change: "Kiểm định TT36 OK",
          isPositive: true,
          icon: Wrench,
        },
        {
          label: "Chỉ Số An Toàn HSE",
          value: "96/100",
          change: "0 Tai nạn",
          isPositive: true,
          icon: ShieldCheck,
        },
      ]);
    });
  }, []);

  const tabs: HubTab[] = [
    {
      id: "tasks-diary",
      label: "Việc & Nhật Ký TT06",
      icon: ClipboardList,
      badge: "TT06 & Chấm công",
      description:
        "Danh sách việc cần làm cá nhân, chấm công hiện trường và sổ nhật ký thi công điện tử Thông tư 06.",
      content: <TasksDiaryTab />,
    },
    {
      id: "approvals-qc",
      label: "Nghiệm Thu & QA/QC",
      icon: CheckSquare,
      badge: "Nghiệm thu & NCR",
      description:
        "Nghiệm thu 2 bước, kiểm soát điểm dừng Hold-Points và quản lý phiếu NCR không phù hợp.",
      content: <ApprovalsQcTab />,
    },
    {
      id: "work-fronts",
      label: "Mặt Bằng & Phân Khu",
      icon: LandPlot,
      badge: "8 Sàn",
      description: "Điều phối giao diện thi công theo tầng/zone và theo dõi giải phóng mặt bằng.",
      content: <WorkFrontsTab />,
    },
    {
      id: "hse-safety",
      label: "An Toàn HSE & AI Vision",
      icon: ShieldAlert,
      badge: "QCVN 18",
      description:
        "Giám sát an toàn QCVN 18, AI Camera Vision nhận diện vi phạm PPE và quản trị rủi ro.",
      content: <HseSafetyTab />,
    },
    {
      id: "equipment",
      label: "Thiết Bị & Phương Tiện",
      icon: Wrench,
      badge: "TT 36",
      description: "Quản lý kiểm định máy móc nghiêm ngặt và nhật trình xe ra vào công trường.",
      content: <EquipmentVehiclesTab />,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Chỉ Huy Tác Nghiệp Hiện Trường"
      subtitle="Phân hệ hợp nhất 14 công cụ Việc của tôi, Nhật ký TT06, Nghiệm thu, Mặt bằng, HSE và Thiết bị máy móc"
      icon={HardHat}
      badge="Site Commander"
      tabs={tabs}
      defaultTab="tasks-diary"
      stats={stats}
    />
  );
}
