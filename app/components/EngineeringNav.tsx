"use client";
import { useState, useMemo } from "react";
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
  Search,
  Sparkles,
  LayoutGrid,
  Scan,
  Scissors,
} from "lucide-react";

export type NavCategory = "all" | "copilot" | "spatial" | "commercial" | "twin" | "governance";

export interface NavItem {
  href: string;
  label: string;
  category: "copilot" | "spatial" | "commercial" | "twin" | "governance";
  icon: typeof Boxes;
  badge?: string;
}

const CATEGORIES: { key: NavCategory; label: string }[] = [
  { key: "all", label: "Tất cả (36)" },
  { key: "copilot", label: "AI & Copilot" },
  { key: "spatial", label: "BIM/CAD & Không gian" },
  { key: "commercial", label: "Tài chính & Pháp lý" },
  { key: "twin", label: "Digital Twin & Sổ cái" },
  { key: "governance", label: "Quy trình & Quản trị" },
];

const NAV_ITEMS: NavItem[] = [
  {
    href: "/engineering/pipe-stash-hunter",
    label: "Pipe Stash Hunter (M95)",
    category: "spatial",
    icon: Scale,
    badge: "5-Way Mass",
  },
  {
    href: "/engineering/nextgen-apex",
    label: "Next-Gen Apex OS (M93/M94)",
    category: "governance",
    icon: Zap,
    badge: "Next-Gen",
  },
  {
    href: "/engineering",
    label: "Apex Cockpit (M88)",
    category: "governance",
    icon: Sparkles,
    badge: "Master",
  },
  {
    href: "/engineering/cad-corridor",
    label: "CAD Corridor & Trapeze (M92)",
    category: "spatial",
    icon: Layers,
    badge: "Apex",
  },
  {
    href: "/engineering/zero-error",
    label: "Zero-Error & Anti-Fraud (M90)",
    category: "governance",
    icon: ShieldCheck,
    badge: "Zero-Defect",
  },
  {
    href: "/engineering/esign",
    label: "Paperless e-Sign (M84)",
    category: "commercial",
    icon: ShieldCheck,
  },
  {
    href: "/engineering/cashflow",
    label: "Dynamic Cashflow (M85)",
    category: "commercial",
    icon: TrendingUp,
  },
  {
    href: "/engineering/zalo-copilot",
    label: "Zalo Copilot (M86)",
    category: "copilot",
    icon: Bot,
  },
  {
    href: "/engineering/hse-vision",
    label: "HSE AI Vision (M87)",
    category: "copilot",
    icon: ShieldAlert,
  },
  {
    href: "/engineering/subcon-ai",
    label: "AI Subcon Trust (M82)",
    category: "governance",
    icon: Users,
  },
  {
    href: "/engineering/iot-telemetry",
    label: "IoT Smart Telemetry (M83)",
    category: "governance",
    icon: Activity,
  },
  {
    href: "/engineering/cad-nesting",
    label: "Fabrication Nesting (M89)",
    category: "spatial",
    icon: Scissors,
  },
  {
    href: "/engineering/scan-to-bim",
    label: "Scan-to-BIM (M70)",
    category: "spatial",
    icon: Scan,
  },
  {
    href: "/engineering/bim-viewer",
    label: "3D BIM & 4D Sim (M80)",
    category: "spatial",
    icon: Boxes,
  },
  {
    href: "/engineering/fidic-claims",
    label: "FIDIC Claims & EOT (M79)",
    category: "commercial",
    icon: Scale,
  },
  {
    href: "/engineering/qr-logistics",
    label: "Smart QR Logistics (M78)",
    category: "commercial",
    icon: QrCode,
  },
  {
    href: "/engineering/auto-routing",
    label: "Auto-Routing & Sleeve (M77)",
    category: "spatial",
    icon: Route,
  },
  {
    href: "/engineering/site-copilot",
    label: "Site Telegram & Voice (M76)",
    category: "copilot",
    icon: Bot,
  },
  {
    href: "/engineering/bidding-matrix",
    label: "Smart Bidding Matrix (M75)",
    category: "commercial",
    icon: Layers,
  },
  {
    href: "/engineering/spatial-viewer",
    label: "Spatial Viewer (M74)",
    category: "spatial",
    icon: Layers,
  },
  { href: "/engineering/mepf-studio", label: "MEPF Agent Studio", category: "copilot", icon: Cpu },
  {
    href: "/engineering/quantum-hub",
    label: "Quantum Core & Merkle (M73)",
    category: "twin",
    icon: Zap,
  },
  {
    href: "/engineering/mepf-lifecycle",
    label: "MEPF AI Lifecycle (M67)",
    category: "spatial",
    icon: Cpu,
  },
  {
    href: "/engineering/cad-tracking",
    label: "CAD & QTO Tracking (M66)",
    category: "spatial",
    icon: Layers,
  },
  { href: "/engineering/cad", label: "CAD Studio (M65)", category: "spatial", icon: Code },
  { href: "/engineering/bim", label: "BIM-CAD 3D/4D/5D", category: "spatial", icon: Boxes },
  {
    href: "/engineering/swarm",
    label: "Swarm Debates & RFI (PIN-3)",
    category: "copilot",
    icon: Bot,
  },
  { href: "/engineering/memory", label: "Memory Bank (PIN-4)", category: "twin", icon: Cpu },
  {
    href: "/engineering/prescriptive",
    label: "Prescriptive & Quy chuẩn (O3+)",
    category: "twin",
    icon: Sliders,
  },
  { href: "/engineering/reality", label: "Living Twin (L4–L6)", category: "twin", icon: Radio },
  { href: "/engineering/twin", label: "Digital Twin (L0–L3)", category: "twin", icon: Cpu },
  { href: "/engineering/graph", label: "Knowledge Graph", category: "governance", icon: Network },
  {
    href: "/engineering/suggestions",
    label: "Đề xuất AI",
    category: "governance",
    icon: Lightbulb,
  },
  {
    href: "/engineering/workflows",
    label: "Quy trình phê duyệt",
    category: "governance",
    icon: GitBranch,
  },
  { href: "/engineering/agent-sessions", label: "Phiên Agent", category: "copilot", icon: Bot },
  {
    href: "/engineering/predictions",
    label: "Dự báo rủi ro (OS-3)",
    category: "governance",
    icon: TrendingUp,
  },
  {
    href: "/engineering/autonomy",
    label: "Tự động hóa (OS-4)",
    category: "governance",
    icon: ShieldAlert,
  },
  {
    href: "/engineering/data-quality",
    label: "Chất lượng dữ liệu",
    category: "governance",
    icon: ShieldCheck,
  },
];

export default function EngineeringNav() {
  const pathname = usePathname();
  const [selectedCategory, setSelectedCategory] = useState<NavCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchSearch =
        !searchQuery ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.href.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="mb-6 space-y-3">
      {/* Category Pills & Search Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`min-h-[36px] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                selectedCategory === cat.key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm phân hệ..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/90 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Nav Items Grid / Flow */}
      <nav className="flex flex-wrap gap-1.5">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/engineering"
              ? pathname === "/engineering"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[38px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-zinc-800 text-amber-400 border border-amber-500/30 shadow-inner"
                  : "bg-zinc-900/60 text-zinc-300 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              <Icon size={14} className={isActive ? "text-amber-400" : "text-zinc-400"} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
