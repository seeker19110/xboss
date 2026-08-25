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
  // Dải KPI: khởi tạo "—", chỉ đổi khi API trả thật. Trước đây khởi tạo bằng số cắm cứng
  // ("14 Task", "8 Sàn", "96/100") và fallback `|| 6` / `|| 8` / `|| 12` biến API lỗi hoặc
  // dự án rỗng thành số bịa trông như thật (audit 2026-08-25 §3.2).
  const [stats, setStats] = useState<HubStat[]>([
    { label: "Nghiệm Thu Chờ Duyệt", value: "—", icon: CheckSquare },
    { label: "Mặt Bằng Đang Thi Công", value: "—", icon: LandPlot },
    { label: "Thiết Bị Cơ Giới", value: "—", icon: Wrench },
    { label: "Ghi Nhận HSE Chưa Đóng", value: "—", icon: ShieldCheck },
  ]);

  useEffect(() => {
    const get = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([
      get("/api/approvals"),
      get("/api/work-fronts"),
      get("/api/equipment"),
      get("/api/hse"),
    ]).then(([appData, wfData, eqData, hseData]) => {
      const appCount: number | null = appData?.pending?.length ?? null;
      const fronts: { status?: string }[] | null = wfData?.fronts ?? null;
      const eqCount: number | null = eqData?.items?.length ?? null;
      const hseOpen: number | null =
        hseData?.records?.filter((r: { actionStatus?: string }) => r.actionStatus === "open")
          .length ?? null;

      setStats([
        {
          label: "Nghiệm Thu Chờ Duyệt",
          value: appCount == null ? "—" : `${appCount} Phiếu`,
          isPositive: appCount == null ? undefined : appCount < 10,
          icon: CheckSquare,
        },
        {
          label: "Mặt Bằng Đang Thi Công",
          value: fronts == null ? "—" : `${fronts.filter((f) => f.status === "active").length} Sàn`,
          icon: LandPlot,
        },
        {
          label: "Thiết Bị Cơ Giới",
          value: eqCount == null ? "—" : `${eqCount} Máy móc`,
          icon: Wrench,
        },
        {
          label: "Ghi Nhận HSE Chưa Đóng",
          value: hseOpen == null ? "—" : `${hseOpen} Ghi nhận`,
          isPositive: hseOpen == null ? undefined : hseOpen === 0,
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
      badge: "Phân khu",
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
