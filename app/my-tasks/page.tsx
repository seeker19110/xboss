"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Bell,
  Activity,
  Clock,
  CalendarClock,
  Package,
  Settings,
  Check,
  TrendingUp,
  Camera,
  FileText,
  MessageSquare,
  ChevronDown,
  RefreshCw,
  Users,
  Share2,
  DollarSign,
} from "lucide-react";
import { slugFromCode } from "@/lib/sheets";
import { PAYMENT_VIEW_ROLES, type Role } from "@/lib/roles";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { DELAY_REASON_LABEL } from "@/lib/delay";
import type { PrefKey, Prefs } from "@/app/api/notifications/prefs/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type MyTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string | null;
  progressPercent: number;
  sheetType: string;
  sheetSlug?: string | null;
};
type TaskData = { tasks: MyTask[]; summary: { total: number; delayed: number; done: number } };

type FeedTaskItem = {
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
  overdue: FeedTaskItem[];
  dueSoon: FeedTaskItem[];
  upcomingStart: FeedTaskItem[];
  recentActivity: SheetActivity[];
  materialOver: MaterialItem[];
  fullAccess: boolean;
  role: string;
  prefs: Prefs;
};
type FeedTab = "activity" | "overdue" | "due_soon" | "upcoming" | "material" | "settings";

// ── Segment control ───────────────────────────────────────────────────────────

type Segment = "tasks" | "notifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("vi-VN");
}

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

const STATUS_COLOR: Record<string, string> = {
  tre: "text-red-400",
  hoan_thanh: "text-emerald-400",
  nghiem_thu: "text-teal-400",
  dang_thi_cong: "text-sky-400",
  chuan_bi: "text-zinc-400",
};
const STATUS_LABEL: Record<string, string> = {
  tre: "Đang trễ",
  hoan_thanh: "Hoàn thành",
  nghiem_thu: "Nghiệm thu",
  dang_thi_cong: "Thi công",
  chuan_bi: "Chuẩn bị",
};

const EVENT_ICON: Record<EventType, React.ReactNode> = {
  progress: <TrendingUp className="w-3.5 h-3.5" />,
  photo: <Camera className="w-3.5 h-3.5" />,
  document: <FileText className="w-3.5 h-3.5" />,
  comment: <MessageSquare className="w-3.5 h-3.5" />,
};
const EVENT_COLOR: Record<EventType, string> = {
  progress: "text-emerald-400 bg-emerald-950",
  photo: "text-sky-400 bg-sky-950",
  document: "text-violet-400 bg-violet-950",
  comment: "text-amber-400 bg-amber-950",
};
const EVENT_LABEL: Record<EventType, string> = {
  progress: "Cập nhật tiến độ",
  photo: "Ảnh hiện trường",
  document: "Bản vẽ / tài liệu",
  comment: "Bình luận",
};

// ── Sub-components ────────────────────────────────────────────────────────────

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
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all ${cls}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right shrink-0 tabular-nums">{value}%</span>
    </div>
  );
}

function Empty({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-zinc-400">
      <div className="mb-3 opacity-25">{icon ?? <Bell className="w-10 h-10" />}</div>
      <p className="text-sm text-center">{label}</p>
    </div>
  );
}

function FeedTaskCard({
  item,
  variant,
}: {
  item: FeedTaskItem;
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
      className={`block border rounded-xl p-4 transition group ${
        urgent
          ? "bg-red-950/10 border-red-900/40"
          : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-600"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
            variant === "overdue"
              ? "bg-red-950 text-red-300"
              : variant === "due_soon"
                ? "bg-amber-950 text-amber-300"
                : "bg-sky-950 text-sky-300"
          }`}
        >
          {item.sheetCode}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="font-mono text-xs text-zinc-500 shrink-0 mt-0.5">{item.code}</span>
            <span className="text-sm font-medium text-zinc-100 flex-1 leading-snug">
              {item.name}
            </span>
            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 shrink-0 mt-0.5" />
          </div>
          <p className="text-xs text-zinc-600 truncate mt-0.5">{item.packageName}</p>
          <div className="mt-2.5">
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
                ? `Trễ ${days} ngày · hạn ${item.endDate}`
                : variant === "due_soon"
                  ? `Còn ${days} ngày · hạn ${item.endDate}`
                  : `Bắt đầu sau ${days} ngày · ${item.startDate}`}
            </span>
            {item.assignedTo && (
              <span className="flex items-center gap-1 text-xs text-zinc-600">
                <Users className="w-3 h-3" /> {item.assignedTo}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

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
          <span className="text-xs text-zinc-500">{group.events.length}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
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
                  <span className="text-xs text-zinc-600 font-mono">{ev.taskCode}</span>
                  <span className="text-sm text-zinc-200 flex-1 truncate">{ev.taskName}</span>
                  <ExternalLink className="w-3 h-3 text-zinc-700 group-hover/ev:text-zinc-400 shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`text-xs font-medium ${EVENT_COLOR[ev.type].split(" ")[0]}`}>
                    {EVENT_LABEL[ev.type]}
                  </span>
                  <span className="text-xs text-zinc-500 truncate">{ev.detail}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {ev.by && <span className="text-[11px] text-zinc-600">{ev.by}</span>}
                  <span className="text-[11px] text-zinc-600">{timeAgo(ev.at)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div className="flex items-center gap-4 py-3.5 border-b border-zinc-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={() => onToggle(prefKey, !enabled)}
        disabled={saving}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-emerald-600" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState<Segment>("tasks");
  const [feedTab, setFeedTab] = useState<FeedTab>("activity");
  const [savingPref, setSavingPref] = useState<PrefKey | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "active" | "delayed" | "done">("all");
  const [copied, setCopied] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  function copyTaskLink(t: MyTask) {
    const slug = t.sheetSlug ?? slugFromCode(t.sheetType);
    const url = slug
      ? `${window.location.origin}/tracking/${slug}?search=${encodeURIComponent(t.code)}`
      : window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(t.id);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  useEffect(() => {
    fetch("/api/my-tasks")
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return;
        }
        setTaskData(await r.json());
      })
      .finally(() => setLoadingTasks(false));
    fetchMe().then((u) => setMyRole(u?.role ?? null));
  }, []);

  const loadFeed = useCallback(async (silent = false) => {
    if (!silent) setLoadingFeed(true);
    else setRefreshing(true);
    const r = await fetch("/api/notifications/feed").catch(() => null);
    if (r?.status === 401) {
      redirectToLogin();
      return;
    }
    if (r?.ok) setFeed(await r.json());
    setLoadingFeed(false);
    setRefreshing(false);
  }, []);

  // Load feed khi chuyển sang tab thông báo
  useEffect(() => {
    if (segment === "notifications" && !feed) loadFeed();
  }, [segment, feed, loadFeed]);

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
    loadFeed(true);
  }

  if (loadingTasks) return <PageSkeleton />;

  const s = taskData?.summary;
  const tasks = taskData?.tasks ?? [];

  // Lọc task theo filter
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "all") return true;
    if (taskFilter === "delayed") return t.status === "tre";
    if (taskFilter === "done") return t.progressPercent >= 1;
    return t.status !== "tre" && t.progressPercent < 1; // active
  });

  // Nhóm task theo sheet
  const bySheet = new Map<
    string,
    {
      slug: string | null;
      total: number;
      delayed: number;
      done: number;
      avgProgress: number;
      tasks: MyTask[];
    }
  >();
  for (const t of filteredTasks) {
    if (!bySheet.has(t.sheetType))
      bySheet.set(t.sheetType, {
        slug: t.sheetSlug ?? slugFromCode(t.sheetType),
        total: 0,
        delayed: 0,
        done: 0,
        avgProgress: 0,
        tasks: [],
      });
    const g = bySheet.get(t.sheetType)!;
    g.total++;
    if (t.status === "tre") g.delayed++;
    if (t.progressPercent >= 1) g.done++;
    g.avgProgress += t.progressPercent;
    g.tasks.push(t);
  }
  for (const g of bySheet.values()) g.avgProgress = g.total ? g.avgProgress / g.total : 0;

  // Feed counts
  const activityCount = feed?.recentActivity.reduce((s, g) => s + g.events.length, 0) ?? 0;
  const totalAlerts = (feed?.overdue.length ?? 0) + (feed?.dueSoon.length ?? 0);

  // Feed tab items
  type NavItem = {
    key: FeedTab;
    label: string;
    icon: React.ReactNode;
    count: number;
    activeCls: string;
  };
  const feedTabs: NavItem[] = [
    {
      key: "activity",
      label: "Hoạt động",
      icon: <Activity className="w-4 h-4" />,
      count: activityCount,
      activeCls: "bg-emerald-700",
    },
    {
      key: "overdue",
      label: "Quá hạn",
      icon: <AlertTriangle className="w-4 h-4" />,
      count: feed?.overdue.length ?? 0,
      activeCls: "bg-red-700",
    },
    {
      key: "due_soon",
      label: "Sắp hạn",
      icon: <Clock className="w-4 h-4" />,
      count: feed?.dueSoon.length ?? 0,
      activeCls: "bg-amber-700",
    },
    {
      key: "upcoming",
      label: "Sắp thi công",
      icon: <CalendarClock className="w-4 h-4" />,
      count: feed?.upcomingStart.length ?? 0,
      activeCls: "bg-sky-700",
    },
    ...(feed?.fullAccess
      ? [
          {
            key: "material" as FeedTab,
            label: "Vật tư vượt ĐM",
            icon: <Package className="w-4 h-4" />,
            count: feed.materialOver.length,
            activeCls: "bg-rose-700",
          },
        ]
      : []),
    {
      key: "settings",
      label: "Cài đặt",
      icon: <Settings className="w-4 h-4" />,
      count: 0,
      activeCls: "bg-zinc-600",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* ── Stats tổng quan ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
              Đang làm
            </p>
            <p className="text-3xl font-bold text-white">{(s?.total ?? 0) - (s?.done ?? 0)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Đang trễ
            </p>
            <p className="text-3xl font-bold text-red-300">{s?.delayed ?? 0}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400 mb-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Xong
            </p>
            <p className="text-3xl font-bold text-emerald-300">{s?.done ?? 0}</p>
          </div>
        </div>

        {/* ── Thanh toán tiến độ — chỉ Admin/PM/BCH ── */}
        {myRole && PAYMENT_VIEW_ROLES.includes(myRole as Role) && (
          <a
            href="/payments"
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 hover:border-emerald-700 transition group"
          >
            <span className="p-2 bg-emerald-950/60 rounded-lg shrink-0">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">Thanh toán tiến độ</span>
              <span className="block text-[11px] text-zinc-400 truncate">
                Giá trị hợp đồng &amp; khối lượng hoàn thành theo tầng · hệ
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition shrink-0" />
          </a>
        )}

        {/* ── Segment control ── */}
        <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          <button
            onClick={() => setSegment("tasks")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
              segment === "tasks" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Công việc
          </button>
          <button
            onClick={() => setSegment("notifications")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
              segment === "notifications"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bell className="w-4 h-4" /> Thông báo
            {totalAlerts > 0 && (
              <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                {totalAlerts}
              </span>
            )}
          </button>
        </div>

        {/* ══════════════════ SEGMENT: CÔNG VIỆC ══════════════════ */}
        {segment === "tasks" && (
          <>
            {/* Filter */}
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  { key: "all", label: "Tất cả", count: tasks.length },
                  {
                    key: "active",
                    label: "Đang làm",
                    count: tasks.filter((t) => t.status !== "tre" && t.progressPercent < 1).length,
                  },
                  {
                    key: "delayed",
                    label: "Trễ",
                    count: tasks.filter((t) => t.status === "tre").length,
                  },
                  {
                    key: "done",
                    label: "Hoàn thành",
                    count: tasks.filter((t) => t.progressPercent >= 1).length,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTaskFilter(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    taskFilter === f.key
                      ? f.key === "delayed"
                        ? "bg-red-900/60 border-red-700 text-red-200"
                        : f.key === "done"
                          ? "bg-emerald-900/60 border-emerald-700 text-emerald-200"
                          : "bg-zinc-700 border-zinc-600 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {f.label}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${taskFilter === f.key ? "bg-white/20" : "bg-zinc-800"}`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            {bySheet.size === 0 ? (
              <div className="py-16 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Bạn chưa được giao task nào.</p>
                <p className="text-xs text-zinc-400 mt-1">Liên hệ PM để được phân công.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...bySheet.entries()].map(([sheetType, g]) => {
                  const pct = Math.round(g.avgProgress * 100);
                  return (
                    <div
                      key={sheetType}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                    >
                      {/* Sheet header */}
                      <a
                        href={g.slug ? `/tracking/${g.slug}` : "#"}
                        className="flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-800/60 transition group border-b border-zinc-800"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                              {sheetType}
                            </span>
                            {g.delayed > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded-full font-semibold">
                                <AlertTriangle className="w-2.5 h-2.5" /> {g.delayed} trễ
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-amber-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold tabular-nums text-zinc-100 shrink-0">
                              {pct}%
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 mt-1">
                            {g.done}/{g.total} hoàn thành
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 shrink-0 transition" />
                      </a>

                      {/* Task list */}
                      <div className="divide-y divide-zinc-800/50">
                        {g.tasks.map((t) => {
                          const pctTask = Math.round(t.progressPercent * 100);
                          const slug = t.sheetSlug ?? slugFromCode(t.sheetType);
                          return (
                            <div
                              key={t.id}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition group/row"
                            >
                              <a
                                href={
                                  slug
                                    ? `/tracking/${slug}?search=${encodeURIComponent(t.code)}`
                                    : "#"
                                }
                                className="flex-1 min-w-0"
                              >
                                <div className="flex items-start gap-1.5 flex-wrap">
                                  <span className="font-mono text-[11px] text-zinc-600 shrink-0 mt-0.5">
                                    {t.code}
                                  </span>
                                  <span className="text-sm text-zinc-200 flex-1 leading-snug">
                                    {t.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <div className="w-20 bg-zinc-800 rounded-full h-1.5 overflow-hidden shrink-0">
                                    <div
                                      className="h-1.5 rounded-full bg-emerald-500"
                                      style={{ width: `${pctTask}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-zinc-500 tabular-nums">
                                    {pctTask}%
                                  </span>
                                  {t.endDate && (
                                    <span className="text-[11px] text-zinc-600">
                                      · hạn {fmtDate(t.endDate)}
                                    </span>
                                  )}
                                </div>
                              </a>
                              <div className="shrink-0 flex items-center gap-2">
                                <span
                                  className={`text-xs font-medium ${STATUS_COLOR[t.status] ?? "text-zinc-500"}`}
                                >
                                  {STATUS_LABEL[t.status] ?? t.status}
                                </span>
                                <button
                                  onClick={() => copyTaskLink(t)}
                                  title="Sao chép link task"
                                  className="p-1 text-zinc-700 hover:text-sky-400 transition rounded"
                                >
                                  {copied === t.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Share2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <a
                                  href={
                                    slug
                                      ? `/tracking/${slug}?search=${encodeURIComponent(t.code)}`
                                      : "#"
                                  }
                                >
                                  <ExternalLink className="w-3 h-3 text-zinc-700 group-hover/row:text-zinc-400 transition" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════════════ SEGMENT: THÔNG BÁO ══════════════════ */}
        {segment === "notifications" && (
          <>
            {/* Feed nav */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl">
                {feedTabs.map((tab) => {
                  const isActive = tab.key === feedTab;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFeedTab(tab.key)}
                      aria-label={tab.label}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 ${
                        isActive
                          ? `${tab.activeCls} text-white`
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                      }`}
                    >
                      {tab.icon}
                      <span className="hidden sm:inline">{tab.label}</span>
                      {tab.count > 0 && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                            isActive ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => loadFeed(true)}
                disabled={refreshing || loadingFeed}
                aria-label="Làm mới thông báo"
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-600 rounded-lg px-2.5 py-2 transition shrink-0 disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Feed content */}
            {loadingFeed ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse"
                  />
                ))}
              </div>
            ) : !feed ? (
              <Empty
                icon={<Bell className="w-10 h-10" />}
                label="Không tải được thông báo. Kéo làm mới để thử lại."
              />
            ) : (
              <div className="space-y-3">
                {feedTab === "activity" && (
                  <>
                    <p className="text-xs text-zinc-400">
                      {activityCount > 0
                        ? `${activityCount} hoạt động${feed.fullAccess ? " — toàn dự án" : ""}`
                        : "Chưa có hoạt động nào"}
                    </p>
                    {feed.recentActivity.length === 0 ? (
                      <Empty
                        icon={<Activity className="w-10 h-10" />}
                        label="Chưa có hoạt động nào gần đây"
                      />
                    ) : (
                      feed.recentActivity.map((g) => <SheetGroup key={g.sheetCode} group={g} />)
                    )}
                  </>
                )}

                {feedTab === "overdue" && (
                  <>
                    <p className="text-xs text-zinc-400">
                      {feed.overdue.length} công việc quá hạn chưa hoàn thành
                    </p>
                    {feed.overdue.length === 0 ? (
                      <Empty
                        icon={<Check className="w-10 h-10" />}
                        label="Tốt! Không có công việc nào quá hạn"
                      />
                    ) : (
                      feed.overdue.map((t) => (
                        <FeedTaskCard key={t.id} item={t} variant="overdue" />
                      ))
                    )}
                  </>
                )}

                {feedTab === "due_soon" && (
                  <>
                    <p className="text-xs text-zinc-400">
                      {feed.dueSoon.length} công việc đến hạn trong 5 ngày tới
                    </p>
                    {feed.dueSoon.length === 0 ? (
                      <Empty
                        icon={<Check className="w-10 h-10" />}
                        label="Không có công việc nào sắp đến hạn"
                      />
                    ) : (
                      feed.dueSoon.map((t) => (
                        <FeedTaskCard key={t.id} item={t} variant="due_soon" />
                      ))
                    )}
                  </>
                )}

                {feedTab === "upcoming" && (
                  <>
                    <p className="text-xs text-zinc-400">
                      {feed.upcomingStart.length} công việc bắt đầu trong 7 ngày tới
                    </p>
                    {feed.upcomingStart.length === 0 ? (
                      <Empty
                        icon={<CalendarClock className="w-10 h-10" />}
                        label="Không có công việc nào sắp bắt đầu"
                      />
                    ) : (
                      feed.upcomingStart.map((t) => (
                        <FeedTaskCard key={t.id} item={t} variant="upcoming" />
                      ))
                    )}
                  </>
                )}

                {feedTab === "material" && feed.fullAccess && (
                  <>
                    <p className="text-xs text-zinc-400">
                      {feed.materialOver.length} vật tư đang vượt định mức
                    </p>
                    {feed.materialOver.length === 0 ? (
                      <Empty
                        icon={<Package className="w-10 h-10" />}
                        label="Tất cả vật tư trong định mức"
                      />
                    ) : (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
                        {feed.materialOver.map((m) => (
                          <a
                            key={m.id}
                            href="/materials"
                            className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition group"
                          >
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-100 truncate">{m.name}</p>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {m.sheetCode ? `[${m.sheetCode}] · ` : ""}
                                Dùng {m.qtyUsed}/{m.qtyPlanned}
                                {m.unit ? ` ${m.unit}` : ""} · vượt {m.qtyUsed - m.qtyPlanned}
                                {m.unit ? ` ${m.unit}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-xs text-rose-400 font-semibold">
                                +{Math.round(((m.qtyUsed - m.qtyPlanned) / m.qtyPlanned) * 100)}%
                              </span>
                              <div className="w-20 bg-zinc-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                                <div
                                  className="h-1.5 rounded-full bg-rose-500"
                                  style={{
                                    width: `${Math.min((m.qtyUsed / m.qtyPlanned) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {feedTab === "settings" && (
                  <div className="space-y-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                        <Users className="w-4 h-4 text-zinc-400" /> Phạm vi thông báo
                      </h2>
                      <p className="text-xs text-zinc-500 mb-3">
                        Được xác định theo vai trò, không thể thay đổi.
                      </p>
                      <div
                        className={`rounded-lg px-3 py-2.5 text-sm ${feed.fullAccess ? "bg-emerald-950 text-emerald-300" : "bg-zinc-800 text-zinc-300"}`}
                      >
                        {feed.fullAccess
                          ? "✓ Toàn bộ dự án — Admin, PM, Kỹ sư"
                          : "⚙ Chỉ công việc được giao — Thầu phụ"}
                      </div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4">
                      <h2 className="text-sm font-semibold py-3 flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-400" /> Loại thông báo muốn nhận
                      </h2>
                      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide pb-2">
                        Nhắc nhở tiến độ
                      </p>
                      <PrefRow
                        prefKey="delayed"
                        label="Công việc quá hạn"
                        desc="Thông báo khi task qua ngày kết thúc mà chưa hoàn thành"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "delayed"}
                      />
                      <PrefRow
                        prefKey="due_soon"
                        label="Sắp đến hạn (5 ngày)"
                        desc="Cảnh báo sớm task đến hạn trong 5 ngày tới"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "due_soon"}
                      />
                      <PrefRow
                        prefKey="upcoming_start"
                        label="Sắp thi công (7 ngày)"
                        desc="Công việc bắt đầu trong 7 ngày tới để chuẩn bị nhân lực, vật tư"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "upcoming_start"}
                      />
                      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide pb-2 pt-4">
                        Hoạt động
                      </p>
                      <PrefRow
                        prefKey="activity_progress"
                        label="Cập nhật tiến độ"
                        desc="Ai đó tick checkbox hoặc sửa % tiến độ"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "activity_progress"}
                      />
                      <PrefRow
                        prefKey="activity_photo"
                        label="Ảnh hiện trường"
                        desc="Ảnh công trường mới được tải lên"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "activity_photo"}
                      />
                      <PrefRow
                        prefKey="activity_document"
                        label="Bản vẽ / tài liệu"
                        desc="Biên bản nghiệm thu hoặc file tài liệu mới"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "activity_document"}
                      />
                      <PrefRow
                        prefKey="activity_comment"
                        label="Bình luận"
                        desc="Bình luận mới trên công việc"
                        prefs={feed.prefs}
                        onToggle={togglePref}
                        saving={savingPref === "activity_comment"}
                      />
                      {feed.fullAccess && (
                        <>
                          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide pb-2 pt-4">
                            Vật tư
                          </p>
                          <PrefRow
                            prefKey="material_over"
                            label="Vật tư vượt định mức"
                            desc="Vật tư sử dụng vượt mức kế hoạch"
                            prefs={feed.prefs}
                            onToggle={togglePref}
                            saving={savingPref === "material_over"}
                          />
                        </>
                      )}
                      <div className="py-3 text-xs text-zinc-600">
                        {savingPref ? "Đang lưu..." : "Thay đổi được lưu tự động."}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
