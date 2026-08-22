"use client";
import { useState, useMemo, useEffect } from "react";
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
  Scan,
  Scissors,
  Coins,
  ChevronDown,
  ChevronUp,
  UserCheck,
  HardHat,
  CalendarCheck,
  Package,
  Landmark,
  Workflow,
} from "lucide-react";
import { fetchMe, type Me } from "@/app/lib/me";
import { ROLE_LABELS, type Role } from "@/lib/roles";

const NAV_COLLAPSED_KEY = "xboss_eng_nav_collapsed";
const NAV_ROLE_FILTER_KEY = "xboss_eng_nav_role_filter";

export type NavCategory =
  "all" | "unified" | "spatial" | "copilot" | "commercial" | "twin" | "governance";

export interface NavItem {
  href: string;
  label: string;
  category: "unified" | "spatial" | "copilot" | "commercial" | "twin" | "governance";
  icon: typeof Boxes;
  badge?: string;
  roles?: Role[];
}

const CATEGORIES: { key: NavCategory; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unified", label: "🏛️ 7 Đại Trung Tâm Hợp Nhất" },
  { key: "spatial", label: "📐 MEPF & Không Gian" },
  { key: "copilot", label: "🤖 AI & Hiện Trường" },
  { key: "commercial", label: "💼 Thương Mại & Pháp Lý" },
  { key: "twin", label: "⚡ Digital Twin & Sổ Cái" },
  { key: "governance", label: "🛡️ Quản Trị & Quy Trình" },
];

const NAV_ITEMS: NavItem[] = [
  // ── Unified Cockpits & Master Hubs ──
  {
    href: "/engineering/god-tier-studio",
    label: "MEPF CAD/BIM Studio",
    category: "unified",
    icon: Sparkles,
    badge: "Studio Tổng",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"],
  },
  {
    href: "/site",
    label: "Chỉ Huy Tác Nghiệp Hiện Trường & HSE",
    category: "unified",
    icon: HardHat,
    badge: "Hub Hiện Trường",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"],
  },
  {
    href: "/schedule",
    label: "Quản Trị Kế Hoạch & Tiến Độ WBS",
    category: "unified",
    icon: CalendarCheck,
    badge: "Hub Tiến Độ",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"],
  },
  {
    href: "/procurement",
    label: "Chuỗi Cung Ứng, Mua Sắm & Kho Vận",
    category: "unified",
    icon: Package,
    badge: "Hub Cung Ứng",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"],
  },
  {
    href: "/commercial",
    label: "Hợp Đồng, Chi Phí & Pháp Lý FIDIC",
    category: "unified",
    icon: Coins,
    badge: "Hub Thương Mại",
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },
  {
    href: "/engineering-intelligence",
    label: "Trí Tuệ Kỹ Thuật AI & Digital Twin",
    category: "unified",
    icon: Brain,
    badge: "Hub Trí Tuệ",
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },
  {
    href: "/governance",
    label: "Quản Trị Dự Án, Bàn Giao & Cấu Hình",
    category: "unified",
    icon: Landmark,
    badge: "Hub Quản Trị",
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },

  // ── Spatial & BIM/CAD ──
  {
    href: "/engineering/bim-viewer",
    label: "Mô phỏng 3D BIM & 4D",
    category: "spatial",
    icon: Boxes,
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },
  {
    href: "/engineering/auto-routing",
    label: "Tự động nắn tuyến 3D",
    category: "spatial",
    icon: Route,
    badge: "Xử lý va chạm",
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/cad-corridor",
    label: "Hành lang kỹ thuật & Giá đỡ",
    category: "spatial",
    icon: Layers,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/cad-nesting",
    label: "Tối ưu cắt phôi ống",
    category: "spatial",
    icon: Scissors,
    roles: ["admin", "pm", "engineer", "subcon"],
  },
  {
    href: "/engineering/pipe-stash-hunter",
    label: "Tối ưu ống tồn kho",
    category: "spatial",
    icon: Scale,
    roles: ["admin", "pm", "engineer", "subcon"],
  },
  {
    href: "/engineering/scan-to-bim",
    label: "Scan-to-BIM Đám mây điểm",
    category: "spatial",
    icon: Scan,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/spatial-viewer",
    label: "Không gian WebGL",
    category: "spatial",
    icon: Layers,
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },
  {
    href: "/engineering/cad-tracking",
    label: "Bóc tách khối lượng CAD",
    category: "spatial",
    icon: Layers,
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/chuan-hoa-ban-ve",
    label: "Chuẩn hóa bản vẽ CAD 2D",
    category: "spatial",
    icon: Code,
    badge: "ISO 19650",
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/mepf-lifecycle",
    label: "Vòng đời thiết bị MEPF",
    category: "spatial",
    icon: Cpu,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/bim",
    label: "Mô hình BIM 5D",
    category: "spatial",
    icon: Boxes,
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },

  // ── AI & Copilots ──
  {
    href: "/engineering/zalo-copilot",
    label: "Zalo Trợ lý Hiện trường",
    category: "copilot",
    icon: Bot,
    badge: "Zalo OTP",
    roles: ["admin", "pm", "engineer", "subcon", "bch"],
  },
  {
    href: "/engineering/hse-vision",
    label: "Thị giác An toàn HSE AI",
    category: "copilot",
    icon: ShieldAlert,
    badge: "AI Vision",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"],
  },
  {
    href: "/engineering/site-copilot",
    label: "Telegram & Khẩu lệnh Voice",
    category: "copilot",
    icon: Bot,
    roles: ["admin", "pm", "engineer", "subcon", "bch"],
  },
  {
    href: "/engineering/swarm",
    label: "Hòa giải Tranh biện & RFI",
    category: "copilot",
    icon: Network,
    badge: "Đa tác tử",
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/agent-sessions",
    label: "Phiên hòa giải Đa tác tử",
    category: "copilot",
    icon: Bot,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/mepf-studio",
    label: "Xử lý tác vụ MEPF",
    category: "copilot",
    icon: Cpu,
    roles: ["admin", "pm", "engineer"],
  },

  // ── Commercial & Contracts ──
  {
    href: "/engineering/cashflow",
    label: "Dòng tiền S-Curve",
    category: "commercial",
    icon: TrendingUp,
    badge: "Tài chính",
    roles: ["admin", "pm", "bch", "cdt"],
  },
  {
    href: "/engineering/esign",
    label: "Ký số điện tử 3 bên",
    category: "commercial",
    icon: ShieldCheck,
    badge: "PKI",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt"],
  },
  {
    href: "/engineering/fidic-claims",
    label: "Hồ sơ Khiếu nại FIDIC",
    category: "commercial",
    icon: Scale,
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/procurement?tab=qr-logistics",
    label: "Quản lý QR Vật tư",
    category: "commercial",
    icon: QrCode,
    roles: ["admin", "pm", "engineer", "subcon", "bch"],
  },
  {
    href: "/engineering/bidding-matrix",
    label: "Ma trận Đấu thầu",
    category: "commercial",
    icon: Layers,
    roles: ["admin", "pm", "bch"],
  },

  // ── Digital Twin & Merkle Ledger ──
  {
    href: "/engineering/quantum-hub",
    label: "Sổ cái Merkle Bất biến",
    category: "twin",
    icon: Zap,
    badge: "Toàn vẹn",
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/reality",
    label: "Bản sao số Hiện trường",
    category: "twin",
    icon: Radio,
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },
  {
    href: "/engineering/prescriptive",
    label: "Tối ưu Quy chuẩn & NCR",
    category: "twin",
    icon: Sliders,
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/memory",
    label: "Ngân hàng Tri thức Kỹ thuật",
    category: "twin",
    icon: Cpu,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/twin",
    label: "Mô hình số Digital Twin",
    category: "twin",
    icon: Cpu,
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },

  // ── Governance & Workflows ──
  {
    href: "/engineering",
    label: "Trung tâm Điều hành Apex",
    category: "governance",
    icon: Sparkles,
    badge: "Tổng chỉ huy",
    roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
  },
  {
    href: "/mepf-process",
    label: "Quy trình Thi công MEPF (6 GĐ)",
    category: "governance",
    icon: Workflow,
    badge: "Master Lifecycle",
    roles: ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"],
  },
  {
    href: "/engineering/workflows",
    label: "Quy trình Phê duyệt Gate 0",
    category: "governance",
    icon: GitBranch,
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/suggestions",
    label: "Đề xuất Kỹ thuật AI",
    category: "governance",
    icon: Lightbulb,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/predictions",
    label: "Dự báo Rủi ro Kỹ thuật",
    category: "governance",
    icon: TrendingUp,
    roles: ["admin", "pm", "bch", "cdt"],
  },
  {
    href: "/engineering/subcon-ai",
    label: "Đánh giá Thầu phụ AI",
    category: "governance",
    icon: Users,
    roles: ["admin", "pm", "bch"],
  },
  {
    href: "/engineering/iot-telemetry",
    label: "Cảm biến Đo xa IoT",
    category: "governance",
    icon: Activity,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/graph",
    label: "Đồ thị Tri thức Kỹ thuật",
    category: "governance",
    icon: Network,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/nextgen-apex",
    label: "Hệ điều hành Kỹ thuật",
    category: "governance",
    icon: Zap,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/zero-error",
    label: "Kiểm soát & Chống gian lận",
    category: "governance",
    icon: ShieldCheck,
    roles: ["admin", "pm", "engineer", "bch"],
  },
  {
    href: "/engineering/autonomy",
    label: "Tự động hóa Quy trình",
    category: "governance",
    icon: ShieldAlert,
    roles: ["admin", "pm", "engineer"],
  },
  {
    href: "/engineering/data-quality",
    label: "Chất lượng Dữ liệu",
    category: "governance",
    icon: ShieldCheck,
    roles: ["admin", "pm", "engineer"],
  },
];

export default function EngineeringNav() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [roleFilterOnly, setRoleFilterOnly] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<NavCategory>("unified");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMe().then((u) => setMe(u));
    try {
      const savedCollapsed = localStorage.getItem(NAV_COLLAPSED_KEY);
      if (savedCollapsed !== null) {
        setCollapsed(savedCollapsed === "true");
      }
      const savedRoleFilter = localStorage.getItem(NAV_ROLE_FILTER_KEY);
      if (savedRoleFilter !== null) {
        setRoleFilterOnly(savedRoleFilter === "true");
      }
    } catch {
      /* private browsing mode */
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, String(next));
    } catch {
      /* private mode */
    }
  }

  function toggleRoleFilter() {
    const next = !roleFilterOnly;
    setRoleFilterOnly(next);
    try {
      localStorage.setItem(NAV_ROLE_FILTER_KEY, String(next));
    } catch {
      /* private mode */
    }
  }

  // Find currently active item
  const currentActiveItem = useMemo(() => {
    return NAV_ITEMS.find((item) =>
      item.href === "/engineering"
        ? pathname === "/engineering"
        : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/")),
    );
  }, [pathname]);

  const userRole = me?.role as Role | undefined;

  const filteredItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      // 1. Role Filter
      if (roleFilterOnly && userRole && item.roles) {
        if (!item.roles.includes(userRole)) {
          return false;
        }
      }

      // 2. Category Filter
      const matchCategory =
        selectedCategory === "all" ||
        (selectedCategory === "unified"
          ? item.category === "unified"
          : item.category === selectedCategory);

      // 3. Search Filter
      const matchSearch =
        !searchQuery ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.href.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.badge && item.badge.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchCategory && matchSearch;
    });
  }, [selectedCategory, searchQuery, roleFilterOnly, userRole]);

  // Master Hubs quick links
  const unifiedHubs = useMemo(() => {
    return NAV_ITEMS.filter((i) => i.category === "unified");
  }, []);

  return (
    <div className="mb-6 rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-3.5 shadow-sm backdrop-blur transition-all">
      {/* ── Compact Bar (When Collapsed) ── */}
      {collapsed ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Active Route Indicator */}
            <div className="flex items-center gap-2 rounded-xl bg-zinc-900/90 px-3 py-1.5 border border-zinc-800 text-xs font-semibold text-zinc-200">
              {currentActiveItem?.icon ? (
                <currentActiveItem.icon className="h-4 w-4 text-emerald-400" />
              ) : (
                <Sparkles className="h-4 w-4 text-emerald-400" />
              )}
              <span className="text-zinc-400 font-normal">Kỹ thuật:</span>
              <span className="text-zinc-100">{currentActiveItem?.label ?? "Bàn làm việc"}</span>
            </div>

            {/* Quick Master Hub Jumpers */}
            <div className="hidden sm:flex items-center gap-1.5">
              {unifiedHubs.map((hub) => {
                const Icon = hub.icon;
                const isActive = pathname === hub.href;
                return (
                  <Link
                    key={hub.href}
                    href={hub.href}
                    title={hub.label}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <Icon size={13} className="text-amber-400" />
                    <span>{hub.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {userRole && (
              <span className="hidden md:inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-400 border border-zinc-800">
                <UserCheck className="h-3 w-3 text-emerald-400" />
                <span>{ROLE_LABELS[userRole] ?? userRole}</span>
              </span>
            )}

            <button
              onClick={toggleCollapsed}
              aria-label="Mở rộng danh mục kỹ thuật"
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-white border border-zinc-800"
            >
              <span>Xem công cụ ({NAV_ITEMS.length})</span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </div>
      ) : (
        /* ── Full Expanded View (Clean & Grouped) ── */
        <div className="space-y-3">
          {/* Header Controls: Categories, Search, Role Toggle & Collapse */}
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800/80 pb-3">
            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {CATEGORIES.map((cat) => {
                const count =
                  cat.key === "all"
                    ? NAV_ITEMS.length
                    : NAV_ITEMS.filter((i) => i.category === cat.key).length;

                return (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`min-h-[36px] whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                      selectedCategory === cat.key
                        ? "bg-emerald-600 text-white shadow-sm font-semibold"
                        : "bg-zinc-900/90 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        selectedCategory === cat.key
                          ? "bg-emerald-800/60 text-emerald-100"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Role Filter Toggle, Search & Collapse Button */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Role-based Filter Switch */}
              {userRole && (
                <button
                  onClick={toggleRoleFilter}
                  title={
                    roleFilterOnly
                      ? `Đang lọc theo vai trò: ${ROLE_LABELS[userRole] ?? userRole}`
                      : "Hiển thị toàn bộ công cụ"
                  }
                  className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition border ${
                    roleFilterOnly
                      ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">
                    {roleFilterOnly ? (ROLE_LABELS[userRole] ?? userRole) : "Mọi vai trò"}
                  </span>
                </button>
              )}

              {/* Quick Search */}
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm công cụ kỹ thuật..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/90 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Collapse Button */}
              <button
                onClick={toggleCollapsed}
                aria-label="Thu gọn thanh công cụ"
                title="Thu gọn thanh điều hướng"
                className="flex min-h-[36px] items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800 shrink-0"
              >
                <ChevronUp className="h-4 w-4" />
                <span className="hidden md:inline">Thu gọn</span>
              </button>
            </div>
          </div>

          {/* Nav Items List */}
          <nav className="flex flex-wrap gap-1.5 pt-0.5">
            {filteredItems.length === 0 ? (
              <div className="py-3 text-xs text-zinc-400 w-full text-center">
                Không tìm thấy công cụ phù hợp. Thử chọn danh mục khác hoặc tắt lọc vai trò.
              </div>
            ) : (
              filteredItems.map((item) => {
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
                    className={`flex min-h-[38px] items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-800 text-amber-400 border border-amber-500/40 shadow-inner font-semibold"
                        : isUnified
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                          : "bg-zinc-900/70 text-zinc-300 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-100"
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
              })
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
