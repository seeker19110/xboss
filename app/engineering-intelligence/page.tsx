"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Bot, Boxes, Zap, ArrowUpRight } from "lucide-react";
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

  // Tab 1: Đối tượng kỹ thuật & tác tử — 2 phân hệ AI còn lại sau đợt dọn 2026-09-22
  // (tab "Trợ Lý Đa Kênh" đã gỡ cùng module Zalo Field Copilot, xem PROGRESS.md).
  const cognitiveTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-emerald-400" />
            Đối Tượng Kỹ Thuật & Duyệt Gate 0 (ENG-1)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Tiếp nhận, soát và duyệt đối tượng kỹ thuật (thiết bị, tuyến ống, ống gió) kèm quan hệ
            và lịch sử phiên bản trong Trung Tâm Điều Hành Kỹ Thuật.
          </p>
          <Link
            href="/engineering"
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-on-accent font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
          >
            Mở Trung Tâm Điều Hành Kỹ Thuật
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-sky-400" />
            Phiên Hòa Giải Đa Tác Tử (Agent Sessions)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Theo dõi các phiên tác tử phân tích xung đột kỹ thuật và chốt phương án xử lý, kèm luận
            cứ của từng tác tử.
          </p>
          <Link
            href="/engineering/agent-sessions"
            className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-on-accent font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
          >
            Mở Phiên Đa Tác Tử
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "cognitive",
      label: "Đối Tượng & Tác Tử",
      icon: Brain,
      description: "Duyệt đối tượng kỹ thuật ENG-1 và theo dõi phiên hoà giải đa tác tử.",
      content: cognitiveTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Trí Tuệ Kỹ Thuật AI"
      subtitle="Đối tượng kỹ thuật, sổ cái Merkle & tác tử phân tích"
      icon={Brain}
      badge="Engineering Intelligence"
      tabs={tabs}
      defaultTab="cognitive"
      stats={stats}
    />
  );
}
