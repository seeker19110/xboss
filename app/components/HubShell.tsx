"use client";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-amber-400">
              <HubIcon className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-zinc-100 text-base sm:text-lg">
                  {title}
                </span>
                {badge && (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-400 line-clamp-1">{subtitle}</span>
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
            {stats.map((stat, idx) => {
              const StatIcon = stat.icon;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 sm:p-3.5 flex flex-col justify-between shadow-sm"
                >
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs font-medium truncate">{stat.label}</span>
                    {StatIcon && <StatIcon className="w-4 h-4 text-zinc-500 shrink-0" />}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg sm:text-xl font-bold font-mono tabular-nums text-zinc-100">
                      {stat.value}
                    </span>
                    {stat.change && (
                      <span
                        className={`text-[11px] font-medium font-mono ${
                          stat.isPositive ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {stat.change}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab Navigation & Search Bar */}
        <div className="sticky top-14 z-20 bg-background/95 backdrop-blur border-b border-zinc-800/80 -mx-3 px-3 sm:-mx-6 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* Scrollable Tabs */}
          <nav
            role="tablist"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none touch-pan-x"
          >
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-zinc-800 text-amber-300 border border-amber-500/40 shadow-inner font-semibold"
                      : "bg-zinc-950/60 text-zinc-400 border border-zinc-800/80 hover:bg-zinc-800/60 hover:text-zinc-200"
                  }`}
                >
                  <TabIcon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? "text-amber-400" : "text-zinc-500"
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-semibold ${
                        isSelected
                          ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                          : "bg-zinc-800 text-zinc-400"
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/90 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Tab Description banner if available */}
        {currentTabObj?.description && (
          <div className="px-3.5 py-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs text-zinc-400 flex items-center justify-between">
            <span>{currentTabObj.description}</span>
            {isPending && (
              <span className="text-[11px] text-amber-400 font-medium animate-pulse">
                Đang chuyển chế độ...
              </span>
            )}
          </div>
        )}

        {/* Active Tab Workspace Content */}
        <div className="tab-content transition-opacity duration-150">
          {currentTabObj ? currentTabObj.content : null}
        </div>
      </main>
    </div>
  );
}
