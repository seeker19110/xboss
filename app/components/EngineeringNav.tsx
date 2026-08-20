"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Brain,
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
  Coins,
  FileSignature,
} from "lucide-react";

export type NavCategory =
  "all" | "unified" | "spatial" | "copilot" | "commercial" | "twin" | "governance";

export interface NavItem {
  href: string;
  label: string;
  category: "unified" | "spatial" | "copilot" | "commercial" | "twin" | "governance";
  icon: typeof Boxes;
  badge?: string;
}

const CATEGORIES: { key: NavCategory; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unified", label: "🏛️ Trung Tâm Hợp Nhất" },
  { key: "copilot", label: "AI & Copilot" },
  { key: "commercial", label: "Thương Mại & Pháp Lý" },
  { key: "spatial", label: "BIM/CAD & Không Gian" },
  { key: "twin", label: "Digital Twin & Sổ Cái" },
  { key: "governance", label: "Quy Trình & Quản Trị" },
];

const NAV_ITEMS: NavItem[] = [
  // ── Unified Cockpits & Master Hubs ──
  {
    href: "/engineering-intelligence",
    label: "Trí Tuệ Kỹ Thuật AI & Digital Twin",
    category: "unified",
    icon: Brain,
    badge: "AI Unified Hub",
  },
  {
    href: "/commercial",
    label: "Hợp Đồng, Chi Phí & Pháp Lý FIDIC",
    category: "unified",
    icon: Coins,
    badge: "Commercial Hub",
  },
  {
    href: "/mepf-cad-bim-studio",
    label: "MEPF CAD/BIM Studio",
    category: "unified",
    icon: Sparkles,
    badge: "Master Studio",
  },

  // ── Spatial & BIM/CAD ──
  {
    href: "/engineering/pipe-stash-hunter",
    label: "Pipe Stash Hunter (M95)",
    category: "spatial",
    icon: Scale,
    badge: "5-Way Mass",
  },
  {
    href: "/engineering/cad-corridor",
    label: "CAD Corridor & Trapeze (M92)",
    category: "spatial",
    icon: Layers,
    badge: "Apex",
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
    href: "/engineering/auto-routing",
    label: "Auto-Routing & Sleeve (M77)",
    category: "spatial",
    icon: Route,
  },
  {
    href: "/engineering/spatial-viewer",
    label: "Spatial Viewer (M74)",
    category: "spatial",
    icon: Layers,
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

  // ── AI & Copilots (Gom vào /engineering-intelligence) ──
  {
    href: "/engineering/zalo-copilot",
    label: "Zalo Copilot (M86)",
    category: "copilot",
    icon: Bot,
    badge: "OTP Zalo",
  },
  {
    href: "/engineering/site-copilot",
    label: "Site Telegram & Voice (M76)",
    category: "copilot",
    icon: Bot,
    badge: "Voice",
  },
  {
    href: "/engineering/hse-vision",
    label: "HSE AI Vision (M87)",
    category: "copilot",
    icon: ShieldAlert,
    badge: "CV Vision",
  },
  {
    href: "/engineering/swarm",
    label: "Swarm Debates & RFI (PIN-3)",
    category: "copilot",
    icon: Network,
    badge: "11 Agents",
  },
  {
    href: "/engineering/agent-sessions",
    label: "Phiên Hòa Giải Đa Agent (ENG-4)",
    category: "copilot",
    icon: Bot,
  },
  {
    href: "/engineering/mepf-studio",
    label: "MEPF Agent Worker Studio",
    category: "copilot",
    icon: Cpu,
  },

  // ── Commercial & Contracts (Gom vào /commercial) ──
  {
    href: "/engineering/cashflow",
    label: "Dynamic Cashflow (M85)",
    category: "commercial",
    icon: TrendingUp,
    badge: "S-Curve",
  },
  {
    href: "/engineering/esign",
    label: "Smart e-Sign 3 Bên (M84)",
    category: "commercial",
    icon: ShieldCheck,
    badge: "PKI e-Sign",
  },
  {
    href: "/engineering/fidic-claims",
    label: "FIDIC Claims & EOT (M79)",
    category: "commercial",
    icon: Scale,
    badge: "Time-Bar 28D",
  },
  {
    href: "/procurement?tab=qr-logistics",
    label: "Smart QR Logistics (M78)",
    category: "commercial",
    icon: QrCode,
  },
  {
    href: "/engineering/bidding-matrix",
    label: "Smart Bidding Matrix (M75)",
    category: "commercial",
    icon: Layers,
  },

  // ── Digital Twin & Merkle Ledger ──
  {
    href: "/engineering/quantum-hub",
    label: "Sổ Cái Merkle & Quantum (M73)",
    category: "twin",
    icon: Zap,
    badge: "Merkle Root",
  },
  { href: "/engineering/memory", label: "Memory Bank (PIN-4)", category: "twin", icon: Cpu },
  {
    href: "/engineering/prescriptive",
    label: "Prescriptive & Quy Chuẩn (O3+)",
    category: "twin",
    icon: Sliders,
  },
  { href: "/engineering/reality", label: "Living Twin (L4–L6)", category: "twin", icon: Radio },
  { href: "/engineering/twin", label: "Digital Twin (L0–L3)", category: "twin", icon: Cpu },

  // ── Governance & Workflows ──
  {
    href: "/engineering",
    label: "Apex Cockpit (M88)",
    category: "governance",
    icon: Sparkles,
    badge: "Master",
  },
  {
    href: "/engineering/nextgen-apex",
    label: "Next-Gen Apex OS (M93/M94)",
    category: "governance",
    icon: Zap,
  },
  {
    href: "/engineering/zero-error",
    label: "Zero-Error & Anti-Fraud (M90)",
    category: "governance",
    icon: ShieldCheck,
  },
  {
    href: "/engineering/subcon-ai",
    label: "Uy Tín Thầu Phụ Subcon (M82)",
    category: "governance",
    icon: Users,
  },
  {
    href: "/engineering/iot-telemetry",
    label: "IoT Smart Telemetry (M83)",
    category: "governance",
    icon: Activity,
  },
  { href: "/engineering/graph", label: "Knowledge Graph", category: "governance", icon: Network },
  {
    href: "/engineering/suggestions",
    label: "Đề Xuất AI (ENG-2)",
    category: "governance",
    icon: Lightbulb,
  },
  {
    href: "/engineering/workflows",
    label: "Luồng Duyệt Gate 0 (ENG-3)",
    category: "governance",
    icon: GitBranch,
  },
  {
    href: "/engineering/predictions",
    label: "Dự Báo Rủi Ro (OS-3)",
    category: "governance",
    icon: TrendingUp,
  },
  {
    href: "/engineering/autonomy",
    label: "Tự Động Hóa (OS-4)",
    category: "governance",
    icon: ShieldAlert,
  },
  {
    href: "/engineering/data-quality",
    label: "Chất Lượng Dữ Liệu",
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
      const matchCategory =
        selectedCategory === "all" ||
        (selectedCategory === "unified"
          ? item.category === "unified"
          : item.category === selectedCategory);
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
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
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
            placeholder="Tìm kiếm phân hệ kỹ thuật..."
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
              : pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href + "/"));

          const isUnified = item.category === "unified";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[38px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-zinc-800 text-amber-400 border border-amber-500/30 shadow-inner font-semibold"
                  : isUnified
                    ? "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-zinc-900/60 text-zinc-300 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              <Icon
                size={14}
                className={
                  isActive ? "text-amber-400" : isUnified ? "text-amber-300" : "text-zinc-400"
                }
              />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
                    isUnified
                      ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                      : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  }`}
                >
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
