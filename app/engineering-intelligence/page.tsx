"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Bot, Boxes, Zap, MessageSquare } from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

export default function EngineeringIntelligenceHubPage() {
  return (
    <Suspense fallback={<IntelligenceSkeleton />}>
      <EngineeringIntelligenceContent />
    </Suspense>
  );
}

function IntelligenceSkeleton() {
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

function EngineeringIntelligenceContent() {
  // Dải KPI khởi tạo bằng "—" và CHỈ đổi khi API trả về thật. Trước đây khởi tạo bằng số
  // cắm cứng ("1.420 Items", "11 Agents", "Niêm Phong") mà trang không gọi API bao giờ
  // (audit 2026-08-25 §3.2). Nguồn nào 403/lỗi/module đang tắt thì giữ "—", không đoán.
  const [stats, setStats] = useState<HubStat[]>([
    { label: "Đối Tượng Kỹ Thuật (ENG-1)", value: "—", icon: Boxes },
    { label: "Khối Merkle Đã Niêm Phong", value: "—", icon: Zap },
  ]);

  useEffect(() => {
    const get = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([get("/api/engineering/objects"), get("/api/engineering/ledger/merkle")]).then(
      ([objects, merkle]) => {
        setStats([
          {
            label: "Đối Tượng Kỹ Thuật (ENG-1)",
            value: objects ? `${objects.objects?.length ?? 0} đối tượng` : "—",
            icon: Boxes,
          },
          {
            label: "Khối Merkle Đã Niêm Phong",
            value: merkle ? `${merkle.totalCount ?? 0} khối` : "—",
            icon: Zap,
          },
        ]);
      },
    );
  }, []);

  // Tab 1: Omnichannel Field Copilot (Zalo)
  const copilotTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              Zalo Field Copilot & Tác Nghiệp Hiện Trường (M86)
            </h3>
            <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
              OTP 15 Phút
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Nhận diện ý định tiếng Việt từ tin nhắn Zalo (Báo cáo sản lượng hoàn thành, Tra cứu tồn
            kho vật tư, Lập phiếu sự cố NCR, Yêu cầu nghiệm thu 2 bước) và tự động ghi nhận trực
            tiếp vào CSDL.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/zalo-copilot"
              className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-on-accent font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Mở Zalo Copilot Hub (M86)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "copilot",
      label: "Trợ Lý Đa Kênh",
      icon: Bot,
      badge: "Zalo",
      description: "Trợ lý hiện trường Zalo Copilot, bóc tách khẩu lệnh tiếng Việt ra WBS/NCR.",
      content: copilotTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Trí Tuệ Kỹ Thuật AI"
      subtitle="Trợ lý hiện trường Zalo Copilot"
      icon={Brain}
      badge="Engineering Intelligence"
      tabs={tabs}
      defaultTab="copilot"
      stats={stats}
    />
  );
}
