"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Bell,
  AlertTriangle,
  Clock,
  CalendarClock,
  Activity,
  Camera,
  FileText,
  MessageSquare,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Users,
  Settings,
  Package,
  Check,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import type { PrefKey, Prefs } from "@/app/api/notifications/prefs/route";
import { redirectToLogin } from "@/app/lib/me";

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskItem = {
  id: number;
  code: string;
  name: string;
  endDate?: string;
  startDate?: string;
  progress: number;
  assignedTo: string | null;
  sheetCode: string;
  sheetName: string;
  sheetSlug: string | null;
  packageName: string;
};

type MaterialItem = {
  id: number;
  name: string;
  unit: string | null;
  qtyPlanned: number;
  qtyUsed: number;
  sheetCode: string | null;
};

type EventType = "progress" | "photo" | "document" | "comment";

type ActivityEvent = {
  type: EventType;
  taskId: number;
  taskCode: string;
  taskName: string;
  detail: string;
  by: string | null;
  at: string;
  sheetSlug: string | null;
};

type SheetActivity = {
  sheetCode: string;
  sheetName: string;
  sheetSlug: string | null;
  events: ActivityEvent[];
};

type Feed = {
  overdue: TaskItem[];
  dueSoon: TaskItem[];
  upcomingStart: TaskItem[];
  recentActivity: SheetActivity[];
  materialOver: MaterialItem[];
  fullAccess: boolean;
  role: string;
  prefs: Prefs;
};

type TabKey = "activity" | "overdue" | "due_soon" | "upcoming" | "material" | "settings";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function daysOverdue(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

function trackingHref(slug: string | null, code: string) {
  return slug ? `/tracking/${slug}?search=${encodeURIComponent(code)}` : "#";
}

const EVENT_ICON: Record<EventType, React.ReactNode> = {
  progress: <TrendingUp className="w-3.5 h-3.5" />,
  photo: <Camera className="w-3.5 h-3.5" />,
  document: <FileText className="w-3.5 h-3.5" />,
  comment: <MessageSquare className="w-3.5 h-3.5" />,
};

const EVENT_COLOR: Record<EventType, string> = {
  progress: "text-emerald-200 bg-emerald-950",
  photo: "text-sky-200 bg-sky-950",
  document: "text-violet-200 bg-violet-950",
  comment: "text-amber-200 bg-amber-950",
};

const EVENT_LABEL: Record<EventType, string> = {
  progress: "Cập nhật tiến độ",
  photo: "Ảnh hiện trường",
  document: "Bản vẽ / tài liệu",
  comment: "Bình luận",
};

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, warn }: { value: number; warn?: boolean }) {
  const cls =
    value >= 100
      ? "bg-emerald-500"
      : warn
        ? "bg-red-500"
        : value >= 70
          ? "bg-emerald-500"
          : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 min-w-[48px]">
        <div
          className={`h-1.5 rounded-full transition-all ${cls}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right shrink-0">{value}%</span>
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  variant,
}: {
  item: TaskItem;
  variant: "overdue" | "due_soon" | "upcoming";
}) {
  const href = trackingHref(item.sheetSlug, item.code);
  const days =
    variant === "overdue"
      ? daysOverdue(item.endDate!)
      : variant === "due_soon"
        ? daysUntil(item.endDate!)
        : daysUntil(item.startDate!);

  const urgent = variant === "overdue" ? days > 7 : variant === "due_soon" ? days <= 2 : false;

  return (
    <a
      href={href}
      className={`block border rounded-xl p-4 hover:border-zinc-500 transition group ${
        urgent ? "bg-red-950/10 border-red-900/50" : "bg-zinc-900/60 border-zinc-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
            variant === "overdue"
              ? "bg-red-950 text-red-200"
              : variant === "due_soon"
                ? "bg-amber-950 text-amber-200"
                : "bg-sky-950 text-sky-200"
          }`}
        >
          {item.sheetCode}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs text-zinc-400">{item.code}</span>
            <span className="font-medium text-sm text-zinc-100 truncate flex-1">{item.name}</span>
            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
          </div>
          <p className="text-xs text-zinc-400 truncate mt-0.5">{item.packageName}</p>
          <div className="mt-2">
            <ProgressBar value={item.progress} warn={variant === "overdue"} />
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span
              className={`text-xs font-medium ${
                variant === "overdue"
                  ? "text-red-400"
                  : variant === "due_soon"
                    ? days <= 2
                      ? "text-red-400"
                      : "text-amber-400"
                    : "text-sky-400"
              }`}
            >
              {variant === "overdue"
                ? `Trễ ${days} ngày (hạn ${item.endDate})`
                : variant === "due_soon"
                  ? `Còn ${days} ngày (hạn ${item.endDate})`
                  : `Bắt đầu sau ${days} ngày (${item.startDate})`}
            </span>
            {item.assignedTo && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Users className="w-3 h-3" /> {item.assignedTo}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

// ── Sheet activity group ──────────────────────────────────────────────────────

function SheetGroup({ group }: { group: SheetActivity }) {
  const [expanded, setExpanded] = useState(true);
  const countByType = group.events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition text-left"
      >
        <span className="text-xs font-bold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full shrink-0">
          {group.sheetCode}
        </span>
        <span className="text-sm font-semibold text-zinc-200 flex-1 truncate">
          {group.sheetName}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {(Object.entries(countByType) as [EventType, number][]).map(([type, cnt]) => (
            <span
              key={type}
              className={`hidden sm:flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${EVENT_COLOR[type]}`}
            >
              {EVENT_ICON[type]} {cnt}
            </span>
          ))}
          <span className="text-xs text-zinc-400">{group.events.length}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
          {group.events.map((ev, i) => (
            <a
              key={i}
              href={trackingHref(ev.sheetSlug, ev.taskCode)}
              className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/40 transition group/ev"
            >
              <span className={`shrink-0 mt-0.5 p-1.5 rounded-lg ${EVENT_COLOR[ev.type]}`}>
                {EVENT_ICON[ev.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-zinc-400 font-mono">{ev.taskCode}</span>
                  <span className="text-sm text-zinc-200 truncate flex-1">{ev.taskName}</span>
                  <ExternalLink className="w-3 h-3 text-zinc-700 group-hover/ev:text-zinc-400 shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`text-xs font-medium ${EVENT_COLOR[ev.type].split(" ")[0]}`}>
                    {EVENT_LABEL[ev.type]}
                  </span>
                  <span className="text-xs text-zinc-400 truncate">{ev.detail}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {ev.by && <span className="text-[11px] text-zinc-400">{ev.by}</span>}
                  <span className="text-[11px] text-zinc-400">{timeAgo(ev.at)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pref toggle ───────────────────────────────────────────────────────────────

function PrefRow({
  label,
  desc,
  prefKey,
  prefs,
  onToggle,
  saving,
}: {
  label: string;
  desc: string;
  prefKey: PrefKey;
  prefs: Prefs;
  onToggle: (key: PrefKey, val: boolean) => void;
  saving: boolean;
}) {
  const enabled = prefs[prefKey] !== false;
  return (
    <div className="flex items-center gap-4 py-3 border-b border-zinc-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onToggle(prefKey, !enabled)}
        disabled={saving}
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-emerald-600" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function Empty({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
      <div className="mb-3 opacity-30">{icon ?? <Bell className="w-10 h-10" />}</div>
      <p className="text-sm text-center">{label}</p>
    </div>
  );
}

// ── Category nav bar ──────────────────────────────────────────────────────────

type NavItem = {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  count: number;
  iconActiveClass: string; // màu icon khi active
  bgActiveClass: string; // nền viên nhộng khi active
};

function CategoryNav({
  items,
  active,
  onChange,
}: {
  items: NavItem[];
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-1 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all shrink-0 ${
              isActive
                ? item.bgActiveClass
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
            }`}
          >
            <span className={isActive ? item.iconActiveClass : ""}>{item.icon}</span>
            <span className="text-xs font-semibold whitespace-nowrap">{item.label}</span>
            {item.count > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  isActive ? "bg-on-accent/20 text-on-accent" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("activity");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPref, setSavingPref] = useState<PrefKey | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const r = await fetch("/api/notifications/feed").catch(() => null);
    if (r?.status === 401) {
      redirectToLogin();
      return;
    }
    if (r?.ok) setFeed(await r.json());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePref(key: PrefKey, val: boolean) {
    if (!feed) return;
    setSavingPref(key);
    const newPrefs = { ...feed.prefs, [key]: val };
    setFeed((f) => (f ? { ...f, prefs: newPrefs } : f));
    await fetch("/api/notifications/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled: val }),
    });
    setSavingPref(null);
    load(true);
  }

  if (loading) return <PageSkeleton />;
  if (!feed)
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Bell className="w-10 h-10 opacity-20" />
        <p className="text-sm">Không tải được thông báo. Vui lòng thử lại.</p>
        <button
          onClick={() => load()}
          className="text-xs border border-zinc-700 rounded-lg px-3 py-1.5 hover:border-zinc-500 transition"
        >
          Tải lại
        </button>
      </div>
    );

  const { overdue, dueSoon, upcomingStart, recentActivity, materialOver, fullAccess, role, prefs } =
    feed;
  const activityCount = recentActivity.reduce((s, g) => s + g.events.length, 0);

  const ROLE_LABEL: Record<string, string> = {
    admin: "Admin",
    pm: "PM",
    engineer: "Kỹ sư",
    bch: "BCH",
    cdt: "CĐT",
    subcon: "Thầu phụ",
    viewer: "Viewer",
  };

  const navItems: NavItem[] = [
    {
      key: "activity",
      label: "Hoạt động",
      icon: <Activity className="w-4 h-4" />,
      count: activityCount,
      iconActiveClass: "text-emerald-300",
      bgActiveClass: "bg-emerald-700 text-on-accent",
    },
    {
      key: "overdue",
      label: "Quá hạn",
      icon: <AlertTriangle className="w-4 h-4" />,
      count: overdue.length,
      iconActiveClass: "text-red-200",
      bgActiveClass: "bg-red-700 text-on-accent",
    },
    {
      key: "due_soon",
      label: "Sắp đến hạn",
      icon: <Clock className="w-4 h-4" />,
      count: dueSoon.length,
      iconActiveClass: "text-amber-200",
      bgActiveClass: "bg-amber-700 text-on-accent",
    },
    {
      key: "upcoming",
      label: "Sắp thi công",
      icon: <CalendarClock className="w-4 h-4" />,
      count: upcomingStart.length,
      iconActiveClass: "text-sky-200",
      bgActiveClass: "bg-sky-700 text-on-accent",
    },
    ...(fullAccess
      ? [
          {
            key: "material" as TabKey,
            label: "Vật tư vượt ĐM",
            icon: <Package className="w-4 h-4" />,
            count: materialOver.length,
            iconActiveClass: "text-rose-200",
            bgActiveClass: "bg-rose-700 text-on-accent",
          },
        ]
      : []),
    {
      key: "settings",
      label: "Cài đặt",
      icon: <Settings className="w-4 h-4" />,
      count: 0,
      iconActiveClass: "text-zinc-200",
      bgActiveClass: "bg-zinc-600 text-white",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title={
          <>
            <Bell className="w-5 h-5 text-amber-400" /> Thông báo
          </>
        }
        back
      >
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </AppHeader>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Badge vai trò */}
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-medium">
            {ROLE_LABEL[role] ?? role}
          </span>
          <span className="text-zinc-400">
            {fullAccess
              ? "Nhận thông báo toàn bộ dự án"
              : "Chỉ nhận thông báo công việc được giao cho bạn"}
          </span>
        </div>

        {/* Thanh nav hạng mục */}
        <CategoryNav items={navItems} active={activeTab} onChange={setActiveTab} />

        {/* Nội dung hạng mục được chọn */}
        <div className="space-y-3">
          {/* ── HOẠT ĐỘNG ──────────────────────────────────────────── */}
          {activeTab === "activity" && (
            <>
              <p className="text-xs text-zinc-400">
                {activityCount > 0
                  ? `${activityCount} hoạt động${fullAccess ? " — toàn dự án" : ""}`
                  : "Chưa có hoạt động nào"}
              </p>
              {recentActivity.length === 0 ? (
                <Empty
                  icon={<Activity className="w-10 h-10" />}
                  label="Chưa có hoạt động nào gần đây"
                />
              ) : (
                recentActivity.map((g) => <SheetGroup key={g.sheetCode} group={g} />)
              )}
            </>
          )}

          {/* ── QUÁ HẠN ──────────────────────────────────────────── */}
          {activeTab === "overdue" && (
            <>
              <p className="text-xs text-zinc-400">
                {overdue.length} công việc quá hạn chưa hoàn thành
              </p>
              {overdue.length === 0 ? (
                <Empty
                  icon={<Check className="w-10 h-10" />}
                  label="Tốt! Không có công việc nào quá hạn"
                />
              ) : (
                <div className="space-y-2">
                  {overdue.map((t) => (
                    <TaskCard key={t.id} item={t} variant="overdue" />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── SẮP ĐẾN HẠN ──────────────────────────────────────── */}
          {activeTab === "due_soon" && (
            <>
              <p className="text-xs text-zinc-400">
                {dueSoon.length} công việc đến hạn trong 5 ngày tới
              </p>
              {dueSoon.length === 0 ? (
                <Empty
                  icon={<Check className="w-10 h-10" />}
                  label="Không có công việc nào sắp đến hạn"
                />
              ) : (
                <div className="space-y-2">
                  {dueSoon.map((t) => (
                    <TaskCard key={t.id} item={t} variant="due_soon" />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── SẮP THI CÔNG ────────────────────────────────────── */}
          {activeTab === "upcoming" && (
            <>
              <p className="text-xs text-zinc-400">
                {upcomingStart.length} công việc bắt đầu trong 7 ngày tới
              </p>
              {upcomingStart.length === 0 ? (
                <Empty
                  icon={<CalendarClock className="w-10 h-10" />}
                  label="Không có công việc nào sắp bắt đầu"
                />
              ) : (
                <div className="space-y-2">
                  {upcomingStart.map((t) => (
                    <TaskCard key={t.id} item={t} variant="upcoming" />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── VẬT TƯ VƯỢT ĐM ─────────────────────────────────── */}
          {activeTab === "material" && fullAccess && (
            <>
              <p className="text-xs text-zinc-400">
                {materialOver.length} vật tư đang vượt định mức sử dụng
              </p>
              {materialOver.length === 0 ? (
                <Empty
                  icon={<Package className="w-10 h-10" />}
                  label="Tất cả vật tư trong định mức"
                />
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
                  {materialOver.map((m) => (
                    <a
                      key={m.id}
                      href="/materials"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition group"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{m.name}</p>
                        <p className="text-xs text-zinc-400">
                          {m.sheetCode ? `[${m.sheetCode}] · ` : ""}Dùng {m.qtyUsed}/{m.qtyPlanned}
                          {m.unit ? ` ${m.unit}` : ""} — vượt {m.qtyUsed - m.qtyPlanned}
                          {m.unit ? ` ${m.unit}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-rose-400 font-medium">
                            +{Math.round(((m.qtyUsed - m.qtyPlanned) / m.qtyPlanned) * 100)}%
                          </span>
                          <ExternalLink className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400" />
                        </div>
                        <div className="w-24 bg-zinc-800 rounded-full h-1.5 mt-1">
                          <div
                            className="h-1.5 rounded-full bg-rose-500"
                            style={{ width: `${Math.min((m.qtyUsed / m.qtyPlanned) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── CÀI ĐẶT ────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
                  <Users className="w-4 h-4 text-zinc-400" /> Phạm vi thông báo
                </h2>
                <p className="text-xs text-zinc-400 mb-3">
                  Được xác định theo vai trò, không thể thay đổi.
                </p>
                <div
                  className={`rounded-lg px-3 py-2.5 text-sm ${fullAccess ? "bg-emerald-950 text-emerald-200" : "bg-zinc-800 text-zinc-300"}`}
                >
                  {fullAccess
                    ? "✓ Toàn bộ dự án — Admin, PM, Kỹ sư, BCH, CĐT"
                    : "⚙ Chỉ công việc được giao — Thầu phụ, Viewer"}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4">
                <h2 className="font-semibold text-sm py-3 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" /> Loại thông báo muốn nhận
                </h2>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide pb-2">
                  Nhắc nhở tiến độ
                </p>
                <PrefRow
                  prefKey="delayed"
                  label="Công việc quá hạn"
                  desc="Thông báo khi task qua ngày kết thúc mà chưa hoàn thành"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "delayed"}
                />
                <PrefRow
                  prefKey="due_soon"
                  label="Sắp đến hạn (5 ngày)"
                  desc="Cảnh báo sớm task đến hạn trong 5 ngày tới"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "due_soon"}
                />
                <PrefRow
                  prefKey="upcoming_start"
                  label="Sắp thi công (7 ngày)"
                  desc="Công việc bắt đầu trong 7 ngày tới để chuẩn bị nhân lực, vật tư"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "upcoming_start"}
                />
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide pb-2 pt-4">
                  Hoạt động
                </p>
                <PrefRow
                  prefKey="activity_progress"
                  label="Cập nhật tiến độ"
                  desc="Ai đó tick checkbox hoặc sửa % tiến độ"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "activity_progress"}
                />
                <PrefRow
                  prefKey="activity_photo"
                  label="Ảnh hiện trường"
                  desc="Ảnh công trường mới được tải lên"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "activity_photo"}
                />
                <PrefRow
                  prefKey="activity_document"
                  label="Bản vẽ / tài liệu"
                  desc="Biên bản nghiệm thu hoặc file tài liệu mới"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "activity_document"}
                />
                <PrefRow
                  prefKey="activity_comment"
                  label="Bình luận"
                  desc="Bình luận mới trên công việc"
                  prefs={prefs}
                  onToggle={togglePref}
                  saving={savingPref === "activity_comment"}
                />
                {fullAccess && (
                  <>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide pb-2 pt-4">
                      Vật tư
                    </p>
                    <PrefRow
                      prefKey="material_over"
                      label="Vật tư vượt định mức"
                      desc="Vật tư sử dụng vượt mức kế hoạch"
                      prefs={prefs}
                      onToggle={togglePref}
                      saving={savingPref === "material_over"}
                    />
                  </>
                )}
                <div className="py-3 text-xs text-zinc-400">
                  {savingPref ? "Đang lưu..." : "Thay đổi được lưu tự động."}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
