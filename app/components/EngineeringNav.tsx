"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Lightbulb,
  GitBranch,
  Bot,
  Network,
  ShieldCheck,
  Cpu,
  TrendingUp,
  ShieldAlert,
  Radio,
  Sliders,
  Code,
  Layers,
  Zap,
  Route,
  QrCode,
  Scale,
  Users,
  Activity,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Boxes;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/engineering/esign", label: "Paperless e-Sign (M84)", icon: ShieldCheck },
  { href: "/engineering/cashflow", label: "Dynamic Cashflow (M85)", icon: TrendingUp },
  { href: "/engineering/zalo-copilot", label: "Zalo Copilot (M86)", icon: Bot },
  { href: "/engineering/hse-vision", label: "HSE AI Vision (M87)", icon: ShieldAlert },
  { href: "/engineering/subcon-ai", label: "AI Subcon Trust (M82)", icon: Users },
  { href: "/engineering/iot-telemetry", label: "IoT Smart Telemetry (M83)", icon: Activity },
  { href: "/engineering/bim-viewer", label: "3D BIM & 4D Simulation (M80)", icon: Boxes },
  { href: "/engineering/fidic-claims", label: "FIDIC Claims & EOT (M79)", icon: Scale },
  { href: "/engineering/qr-logistics", label: "Smart QR Logistics (M78)", icon: QrCode },
  { href: "/engineering/auto-routing", label: "Auto-Routing & Sleeve (M77)", icon: Route },
  { href: "/engineering/site-copilot", label: "Site Telegram & Voice (M76)", icon: Bot },
  { href: "/engineering/bidding-matrix", label: "Smart Bidding Matrix (M75)", icon: Layers },
  { href: "/engineering/spatial-viewer", label: "Spatial Viewer & Pinning (M74)", icon: Layers },
  { href: "/engineering/mepf-studio", label: "MEPF Agent Studio", icon: Cpu },
  { href: "/engineering/quantum-hub", label: "Quantum Core & Merkle (M73)", icon: Zap },
  { href: "/engineering/mepf-lifecycle", label: "MEPF AI Lifecycle (M67)", icon: Cpu },
  { href: "/engineering/cad-tracking", label: "CAD & QTO Tracking (M66)", icon: Layers },
  { href: "/engineering/cad", label: "CAD Studio (M65)", icon: Code },
  { href: "/engineering/bim", label: "BIM-CAD 3D/4D/5D", icon: Boxes },
  { href: "/engineering/swarm", label: "Swarm Debates & RFI (PIN-3)", icon: Bot },
  { href: "/engineering/memory", label: "Memory Bank (PIN-4)", icon: Cpu },
  { href: "/engineering/prescriptive", label: "Prescriptive & Quy chuẩn (O3+)", icon: Sliders },
  { href: "/engineering/reality", label: "Living Twin (L4–L6)", icon: Radio },
  { href: "/engineering/twin", label: "Digital Twin (L0–L3)", icon: Cpu },
  { href: "/engineering/graph", label: "Knowledge Graph", icon: Network },
  { href: "/engineering/suggestions", label: "Đề xuất AI", icon: Lightbulb },
  { href: "/engineering/workflows", label: "Quy trình phê duyệt", icon: GitBranch },
  { href: "/engineering/agent-sessions", label: "Phiên Agent", icon: Bot },
  { href: "/engineering/predictions", label: "Dự báo rủi ro (OS-3)", icon: TrendingUp },
  { href: "/engineering/autonomy", label: "Tự động hóa (OS-4)", icon: ShieldAlert },
  { href: "/engineering/data-quality", label: "Chất lượng dữ liệu", icon: ShieldCheck },
];

export default function EngineeringNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-zinc-800 pb-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/engineering"
            ? pathname === "/engineering"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-zinc-800 text-amber-400"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
