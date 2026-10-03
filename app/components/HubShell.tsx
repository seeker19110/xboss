"use client";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import StatCard from "@/app/components/ui/StatCard";

export interface HubTab {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  description?: string;
  content: ReactNode;
}

export interface HubStat {
  label: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  icon?: LucideIcon;
}

interface HubShellProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  badge?: string;
  tabs: HubTab[];
  defaultTab?: string;
  stats?: HubStat[];
  searchPlaceholder?: string;
  onSearchChange?: (query: string) => void;
  headerActions?: ReactNode;
  bottomActions?: ReactNode;
}

export default function HubShell({
  title,
  subtitle,
  icon: HubIcon,
  badge,
  tabs,
  defaultTab,
  stats,
  searchPlaceholder = "Tìm kiếm trong phân hệ...",
  onSearchChange,
  headerActions,
  bottomActions,
}: HubShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const tabParam = searchParams.get("tab");
  const initialTab =
    (tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : undefined) ||
    defaultTab ||
    tabs[0]?.id ||
    "";

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (tabParam && tabs.some((t) => t.id === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, tabs, activeTab]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tabId);
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (onSearchChange) {
      onSearchChange(q);
    }
  };

  const currentTabObj = tabs.find((t) => t.id === activeTab) || tabs[0];

  // Điều hướng bàn phím theo khuôn WAI-ARIA "tabs, automatic activation" — cùng cách
  // làm với ui/Tabs: ←/→ (kèm Home/End) đổi tab và dời focus; chỉ tab đang chọn nằm
  // trong luồng Tab (roving tabindex).
  function onTabListKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const i = tabs.findIndex((t) => t.id === currentTabObj?.id);
    if (i < 0) return;
    let next: number;
    if (e.key === "ArrowRight") next = i + 1;
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    handleTabChange(tab.id);
    document.getElementById(`tab-${tab.id}`)?.focus();
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader
        title={
          // min-w-0 + truncate ở từng tầng: tiêu đề hub dài ("Trung Tâm Chỉ Huy Tác Nghiệp
          // Hiện Trường") phải co kèm dấu "…" trên điện thoại, không bị xén cụt giữa chữ.
          // Icon trang trí và badge phụ ẩn dưới sm để nhường chỗ cho chữ (badge shrink-0 từng
          // chiếm trọn ô tiêu đề ở màn 360px, đẩy tên hub về 0px).
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden sm:block p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-emerald-400 shrink-0">
              <HubIcon className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold tracking-tight text-zinc-100 text-base sm:text-lg truncate">
                  {title}
                </span>
                {badge && (
                  <span className="hidden sm:inline-block shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-400 truncate">{subtitle}</span>
            </div>
          </div>
        }
        bottomActions={bottomActions}
      >
        {headerActions}
      </AppHeader>

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* KPI / Quick Stats Strip */}
        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
            {stats.map((stat, idx) => (
              <StatCard
                key={idx}
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                hint={stat.change}
                tone={stat.change ? (stat.isPositive ? "success" : "warning") : "neutral"}
              />
            ))}
          </div>
        )}

        {/* Tab Navigation & Search Bar */}
        {/* top = chiều cao topbar (h-12) + vùng an toàn trên: topbar có padding safe-top
            (PWA standalone trên iPhone tai thỏ) nên neo đúng 3rem sẽ trượt vào dưới nó. */}
        <div className="sticky top-[calc(3rem+env(safe-area-inset-top,0px))] z-20 bg-background/95 backdrop-blur border-b border-zinc-800/80 -mx-3 px-3 sm:-mx-6 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* Scrollable Tabs */}
          <nav
            role="tablist"
            aria-label="Các phân hệ nghiệp vụ"
            onKeyDown={onTabListKeyDown}
            className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none touch-pan-x"
          >
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-controls={`tabpanel-${tab.id}`}
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition ${
                    isSelected
                      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 font-semibold"
                      : "bg-zinc-950/70 text-zinc-400 border border-zinc-800 hover:bg-zinc-800/70 hover:text-zinc-100 hover:border-zinc-700"
                  }`}
                >
                  <TabIcon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? "text-emerald-400" : "text-zinc-500"
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold tabular-nums ${
                        isSelected
                          ? // Nền chip dùng emerald-500 (KHÔNG bị html.light đảo) thay vì -400:
                            // shade -300/-400 đều bị đảo sang xanh đậm ở chế độ sáng nên nền mờ và
                            // chữ hoá cùng một màu, tương phản sụp. Với -500 làm nền, chữ -300 vẫn
                            // tự đảo nên đủ tương phản ở cả hai theme (cùng công thức như ui/Chip).
                            "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Search Filter */}
          {onSearchChange && (
            <div className="relative min-w-[220px] max-w-md w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full min-h-[44px] rounded-xl border border-zinc-800 bg-zinc-950/90 py-2 pl-9 pr-3 text-base sm:text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>
          )}
        </div>

        {/* Tab Description banner if available */}
        {currentTabObj?.description && (
          <div className="px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/70 text-xs text-zinc-400 flex items-center justify-between shadow-xs">
            <span className="leading-relaxed">{currentTabObj.description}</span>
            {isPending && (
              <span className="text-[11px] text-emerald-400 font-mono font-medium animate-pulse shrink-0 ml-3">
                Đang chuyển chế độ...
              </span>
            )}
          </div>
        )}

        {/* Active Tab Workspace Content */}
        <div
          id={`tabpanel-${currentTabObj?.id || "default"}`}
          role="tabpanel"
          aria-labelledby={`tab-${currentTabObj?.id || "default"}`}
          className="tab-content transition-opacity duration-150"
        >
          {currentTabObj ? currentTabObj.content : null}
        </div>
      </main>
    </div>
  );
}
