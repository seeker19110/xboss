"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Bot,
  Workflow,
  Network,
  Cpu,
  Boxes,
  Lightbulb,
  ShieldCheck,
  Zap,
  Activity,
  Radio,
  Sparkles,
  ArrowUpRight,
  Send,
  MessageSquare,
  Volume2,
  GitBranch,
  KeyRound,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  Layers,
  Database,
  Search,
} from "lucide-react";
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
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Đối Tượng Kỹ Thuật (ENG-1)",
      value: "1,420 Items",
      change: "100% Gắn mã SHA-256",
      isPositive: true,
      icon: Boxes,
    },
    {
      label: "Đề Xuất AI Chờ Duyệt",
      value: "5 Đề Xuất",
      change: "Gate 0 Kiểm Định",
      isPositive: true,
      icon: Lightbulb,
    },
    {
      label: "Tác Tử Swarm Hoạt Động",
      value: "11 Agents",
      change: "Đồng thuận ≥ 0.80",
      isPositive: true,
      icon: Network,
    },
    {
      label: "Sổ Cái Merkle Mật Mã (M73)",
      value: "Niêm Phong",
      change: "Toàn vẹn 100%",
      isPositive: true,
      icon: Zap,
    },
  ]);

  // Tab 1: Omnichannel Field Copilot (Zalo & Telegram Voice)
  const copilotTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Mở Zalo Copilot Hub (M86)
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Bot className="w-4 h-4 text-amber-400" />
              Trợ Lý Hiện Trường Telegram 2 Chiều & Voice Copilot (M76)
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Voice-to-Action</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Giao tiếp bằng giọng nói ngoài hiện trường, chuyển đổi khẩu lệnh âm thanh tiếng Việt
            thành phiếu nhật ký thi công Thông tư 06/2021/TT-BXD và phát cảnh báo trễ hạn tức thì về
            nhóm chat dự án.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/site-copilot"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" /> Mở Telegram Voice Hub (M76)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 2: Gate 0 & Evidence-Based AI Suggestions
  const gate0Tab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-amber-400" />
              Cổng Thẩm Định Trạm Gác Gate 0 & Đề Xuất Kỹ Thuật AI
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Ranh giới ủy quyền kỹ sư có kiểm soát (Controlled Autonomy A0-A2), kiểm định 5 trụ cột
              và xếp hạng đề xuất có chứng cứ định lượng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/engineering/workflows"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-on-accent-dark font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Workflow className="w-3.5 h-3.5" /> Luồng Phê Duyệt Gate 0
            </Link>
            <Link
              href="/engineering/suggestions"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Đề Xuất AI (ENG-2)
            </Link>
          </div>
        </div>

        {/* 5 Gate 0 Pillars Checklist Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2">
          {[
            { title: "1. Provenance Trace", desc: "Nguồn gốc SHA-256", icon: CheckCircle2 },
            { title: "2. Role Authorization", desc: "Ủy quyền an toàn A1/A2", icon: ShieldCheck },
            { title: "3. Evidence Sufficiency", desc: "Bằng chứng định lượng", icon: Lightbulb },
            { title: "4. Conflict Resolution", desc: "Đồng thuận ≥ 0.80", icon: Network },
            { title: "5. Merkle Sealing", desc: "Mã băm niêm phong M73", icon: Zap },
          ].map((pillar, idx) => {
            const PillarIcon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1"
              >
                <div className="flex items-center gap-1.5 text-amber-400">
                  <PillarIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold text-zinc-200">{pillar.title}</span>
                </div>
                <p className="text-[11px] text-zinc-400">{pillar.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Tab 3: Multi-Agent Swarm Debates & Merkle Ledger
  const swarmTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              AI Swarm Debates & Hòa Giải Tranh Chấp 7 Bước (PIN-3/ENG-4)
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              11 Agents Swarm
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Kích hoạt phiên tranh biện tự động giữa các Persona Agent (Lead MEPF Engineer, Chief QS,
            Site Commander, QA/QC Sentinel) để giải quyết xung đột kỹ thuật, tối ưu hóa Pareto đa
            mục tiêu và sinh nghị quyết đồng thuận.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Link
              href="/engineering/swarm"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              <Network className="w-3.5 h-3.5" /> Swarm Debates (PIN-3)
            </Link>
            <Link
              href="/engineering/agent-sessions"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Phiên Hòa Giải (ENG-4)
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Sổ Cái Mật Mã Merkle Tree & Hàng Đợi MEPF Worker (M73)
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Merkle Proof SHA-256</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Niêm phong cây băm Merkle Tree SHA-256 bất biến cho mọi giao dịch điều chỉnh kỹ thuật,
            truy xuất Memory Bank ngữ cảnh và quản trị hàng đợi bất đồng bộ PostgreSQL Skip Locked.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Link
              href="/engineering/quantum-hub"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Sổ Cái Merkle (M73)
            </Link>
            <Link
              href="/engineering/memory"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Memory Bank (PIN-4)
            </Link>
            <Link
              href="/engineering/mepf-studio"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              MEPF Worker
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Controlled Autonomy & Data Quality Sentinel
  const autonomyDataTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Cấp Độ Tự Trị Có Kiểm Soát (Controlled Autonomy A0-A2)
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">OS-4 Safe Envelope</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Thiết lập giới hạn an toàn tự trị: A0 (Hỗ trợ đọc/tính toán), A1 (Đề xuất có bằng
            chứng), A2 (Ủy quyền tự động dưới ngưỡng rủi ro) và ngắt mạch an toàn khi phát hiện can
            thiệp ngoài thẩm quyền.
          </p>
          <div className="pt-2">
            <Link
              href="/engineering/autonomy"
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-on-accent-dark font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              <Sliders className="w-3.5 h-3.5" /> Bảng Điều Khiển Tự Trị (OS-4)
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Vệ Binh Toàn Vẹn Dữ Liệu & Uy Tín Thầu Phụ (ENG-1/M82)
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Data Quality Sentinel
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Kiểm tra tính nhất quán dữ liệu 4 chiều (BIM - BOQ - PO - Field), phát hiện bất thường,
            và chấm điểm tín nhiệm thầu phụ (Subcon Trust Score) phục vụ giao thầu thông minh.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Link
              href="/engineering/data-quality"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Data Quality Sentinel
            </Link>
            <Link
              href="/engineering/subcon-ai"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Uy Tín Thầu Phụ (M82)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 5: Living Digital Twin & IoT Telemetry
  const digitalTwinTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" />
              Living Digital Twin (L0-L6), IoT Telemetry & Bảo Trì Dự Báo
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Mô hình tài sản số LOD 500, tiếp nhận luồng cảm biến IoT thời gian thực và thuật toán
              Weibull tính toán MTBF/RUL dự báo hư hỏng sớm.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/engineering/iot-telemetry"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-on-accent-dark font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Activity className="w-3.5 h-3.5" /> IoT Telemetry (M83)
            </Link>
            <Link
              href="/engineering/twin"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5" /> Digital Twin (L0-L3)
            </Link>
            <Link
              href="/engineering/reality"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              Living Twin (L4-L6)
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Link
            href="/engineering/predictions"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group transition-all"
          >
            <div className="text-zinc-400">Dự Báo Rủi Ro Kỹ Thuật (OS-3)</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Predictive Engineering Risk</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Cảnh báo sớm xung đột tiến độ và hư hỏng thiết bị
            </p>
          </Link>

          <Link
            href="/engineering/prescriptive"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group transition-all"
          >
            <div className="text-zinc-400">Quy Chuẩn & Khuyến Nghị Tối Ưu (O3+)</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Prescriptive Engine</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Khuyến nghị giải pháp kỹ thuật theo TCVN/QCVN
            </p>
          </Link>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "copilot",
      label: "Trợ Lý Đa Kênh",
      icon: Bot,
      badge: "Zalo / Voice",
      description:
        "Trợ lý hiện trường Zalo Copilot, Telegram Voice và bóc tách khẩu lệnh tiếng Việt ra WBS/NCR.",
      content: copilotTab,
    },
    {
      id: "gate0",
      label: "Gate 0 & Đề Xuất AI",
      icon: Workflow,
      badge: "Gatekeeper",
      description:
        "Cổng thẩm định Gate 0 uỷ quyền kỹ sư có kiểm soát và xếp hạng đề xuất AI có bằng chứng.",
      content: gate0Tab,
    },
    {
      id: "swarm",
      label: "AI Swarm & Merkle",
      icon: Network,
      badge: "11 Agents",
      description:
        "Tranh luận đa tác tử, hàng đợi xử lý MEPF Worker và sổ cái mật mã Merkle Tree bất biến.",
      content: swarmTab,
    },
    {
      id: "autonomy-data",
      label: "Tự Trị & Dữ Liệu",
      icon: ShieldAlert,
      badge: "Safe OS-4",
      description:
        "Cấp độ tự trị Controlled Autonomy A0-A2, ranh giới an toàn và Data Quality Sentinel.",
      content: autonomyDataTab,
    },
    {
      id: "digital-twin",
      label: "Digital Twin & IoT",
      icon: Cpu,
      badge: "LOD 500",
      description:
        "Mô hình tài sản số Living Twin, cảm biến IoT Telemetry và dự báo hỏng hóc thiết bị MTBF/RUL.",
      content: digitalTwinTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Trí Tuệ Kỹ Thuật AI & Digital Twin"
      subtitle="Phân hệ hợp nhất 19 công cụ Trợ lý Copilot, Thẩm định Gate 0, AI Swarm, Digital Twin và IoT Telemetry"
      icon={Brain}
      badge="Engineering Intelligence"
      tabs={tabs}
      defaultTab="copilot"
      stats={stats}
    />
  );
}
