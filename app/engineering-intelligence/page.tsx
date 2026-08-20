"use client";
import { Suspense, useState } from "react";
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
      label: "Đối Tượng Kỹ Thuật",
      value: "1,420 Items",
      change: "100% Provenance",
      isPositive: true,
      icon: Boxes,
    },
    {
      label: "Đề Xuất AI Chờ Duyệt",
      value: "5 Đề Xuất",
      change: "Gate 0 Gatekeeper",
      isPositive: true,
      icon: Lightbulb,
    },
    {
      label: "Tác Tử Hoạt Động",
      value: "11 Agents",
      change: "Swarm Active",
      isPositive: true,
      icon: Network,
    },
    {
      label: "Chỉ Số Sức Khỏe EHI",
      value: "94.2%",
      change: "Rủi ro thấp",
      isPositive: true,
      icon: Brain,
    },
  ]);

  // Tab 1: Omnichannel Field Copilot (Zalo & Telegram)
  const copilotTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              Zalo Field Copilot & Interactive Site Gateway
            </h3>
            <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
              OTP 15 Mins
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Nhận diện ý định tiếng Việt từ tin nhắn Zalo (Báo cáo sản lượng, Tra cứu tồn kho, Lập
            phiếu NCR, Yêu cầu nghiệm thu) và tự động ghi nhận vào CSDL.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/zalo-copilot"
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Mở Zalo Copilot Hub (M86)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Bot className="w-4 h-4 text-amber-400" />
              Trợ Lý Hiện Trường Telegram 2 Chiều & Voice Copilot
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Voice-to-Action</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Giao tiếp bằng giọng nói ngoài hiện trường, chuyển đổi khẩu lệnh âm thanh thành phiếu
            nhật ký công trường và gửi cảnh báo trễ hạn tức thì về nhóm chat.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/site-copilot"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Mở Telegram Voice Hub (M76)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 2: Gate 0 & AI Suggestions
  const gate0Tab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-amber-400" />
              Cổng Thẩm Định Gate 0 & Đề Xuất Kỹ Thuật AI
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Ranh giới ủy quyền kỹ sư có kiểm soát (Controlled Autonomy A0-A2) và xếp hạng đề xuất
              có bằng chứng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/engineering/workflows"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Workflow className="w-3.5 h-3.5" /> Luồng Phê Duyệt Gate 0
            </a>
            <a
              href="/engineering/suggestions"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Đề Xuất AI
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <a
            href="/engineering"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Kho Đối Tượng (ENG-1)</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Engineering Objects Hub</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/engineering/autonomy"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Cấp Độ Tự Trị (OS-4)</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Controlled Autonomy A0-A2</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/engineering/data-quality"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Toàn Vẹn Dữ Liệu</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Data Quality Sentinel</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
        </div>
      </div>
    </div>
  );

  // Tab 3: Multi-Agent Swarm & Merkle Ledger
  const swarmTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              AI Swarm Debates & Đồng Thuận Kỹ Thuật
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              11 Agents
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Kích hoạt phiên tranh biện tự động giữa 3 Persona Agent (Lead Engineer, Chief QS, Site
            Commander) để giải quyết xung đột kỹ thuật và sinh nghị quyết đồng thuận.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <a
              href="/engineering/swarm"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Swarm Debates (PIN-3)
            </a>
            <a
              href="/engineering/mepf-studio"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              MEPF Worker Studio
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Sổ Cái Mật Mã Merkle Tree & Hàng Đợi Tác Vụ
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Merkle Proof</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Niêm phong cây băm Merkle Tree SHA-256 bất biến cho các giao dịch kỹ thuật và quản trị
            hàng đợi tác vụ bất đồng bộ PostgreSQL Skip Locked.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/quantum-hub"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Quantum & Merkle Hub (M73)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Digital Twin & IoT Predictive
  const digitalTwinTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" />
              Living Digital Twin, IoT Telemetry & Bảo Trì Dự Báo
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Mô hình tài sản số LOD 500, tiếp nhận cảm biến IoT thời gian thực và thuật toán
              Weibull tính MTBF/RUL.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/engineering/iot-telemetry"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Activity className="w-3.5 h-3.5" /> IoT Telemetry (M83)
            </a>
            <a
              href="/engineering/twin"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5" /> Living Twin (L0-L6)
            </a>
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
        "Tranh luận đa tác tử, hàng đợi xử lý ngầm MEPF Worker và sổ cái mật mã Merkle Tree bất biến.",
      content: swarmTab,
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
