"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  BellRing,
  BellOff,
  AlertTriangle,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDateTimeVN, todayISO, daysFromTodayISO } from "@/lib/date";

type Notif = {
  id: number;
  taskId: number | null;
  type: string;
  message: string;
  isRead: number;
  createdAt: string;
  sheetSlug: string | null;
  floorLabel: string | null;
};

const POLL_MS = 30_000;

// Phân cấp mức độ nghiêm trọng theo `type` — hệ thống có ~40 loại thông báo rải rác
// nhiều module (xem app/api/notifications/route.ts), dùng heuristic từ khoá thay vì
// liệt kê từng loại để dễ bảo trì khi có module mới. Tín hiệu thứ 2 ngoài màu = icon.
type NotifSeverity = "danger" | "warning" | "info";

function notifSeverity(type: string): NotifSeverity {
  if (type === "comment") return "info";
  if (/overdue|delayed|_over$|late|alarm/.test(type)) return "danger";
  return "warning"; // due_soon, expiry, pending, missing, due, ...
}

const SEVERITY_BG: Record<NotifSeverity, string> = {
  danger: "bg-red-950/20",
  warning: "bg-amber-950/20",
  info: "bg-sky-950/20",
};
const SEVERITY_ICON: Record<NotifSeverity, typeof AlertTriangle> = {
  danger: AlertTriangle,
  warning: Clock,
  info: MessageSquare,
};
const SEVERITY_ICON_CLS: Record<NotifSeverity, string> = {
  danger: "text-red-400",
  warning: "text-amber-400",
  info: "text-sky-400",
};

// Danh sách tối đa hiển thị trong dropdown — phần còn lại xem ở trang /notifications/all.
const DROPDOWN_LIMIT = 10;

// Nhãn hiển thị cho từng loại thông báo (dùng khi gộp nhóm ≥3 thông báo cùng loại) —
// map tĩnh, loại nào chưa liệt kê thì tự humanize từ `type` (thay "_" bằng khoảng trắng).
const TYPE_LABEL: Record<string, string> = {
  delayed: "công việc quá hạn",
  due_soon: "công việc sắp đến hạn",
  stalled: "công việc đình trệ",
  comment: "bình luận",
  material_over: "vật tư vượt định mức",
  cost_over: "hệ vượt ngân sách",
  contract_expiry: "hợp đồng sắp/đã hết hiệu lực",
  cert_over_contract: "nghiệm thu vượt giá trị hợp đồng",
  insurance_expiry: "bảo hiểm/bảo lãnh sắp/đã hết hạn",
  legal_expiry: "hồ sơ pháp lý sắp/đã hết hạn",
  cert_expiry: "chứng chỉ nhân sự sắp/đã hết hạn",
  monitoring_alarm: "mốc quan trắc vượt ngưỡng báo động",
  cert_pending: "đợt thanh toán chờ quyết định",
  correspondence_due: "công văn quá hạn phản hồi",
  vo_pending: "phát sinh chờ quyết định",
  proposal_pending: "đề xuất chờ quyết định",
  design_change_pending: "thay đổi thiết kế chờ quyết định",
  claim_pending: "claim chờ xử lý",
  ncr_overdue: "NCR quá hạn khắc phục",
  punch_overdue: "tồn tại quá hạn xử lý",
  po_late: "đơn hàng trễ giao",
  vehicle_late: "xe NCC trễ giờ",
  diary_missing: "thiếu nhật ký thi công",
  stage_missing: "tầng chưa sẵn sàng mặt bằng",
  calibration_due: "thiết bị sắp/đã hết hạn kiểm định",
  norm_over: "vượt định mức BOQ",
  hse_action_due: "hành động khắc phục HSE quá hạn",
  action_overdue: "việc sau họp quá hạn",
  env_permit_expiry: "hồ sơ môi trường sắp/đã hết hạn",
  env_monitoring_over: "chỉ tiêu quan trắc môi trường vượt ngưỡng",
  warranty_expiry: "bảo hành sắp/đã hết hạn",
  warranty_claim_overdue: "claim bảo hành quá hạn xử lý",
  advance_overdue: "tạm ứng quá hạn hoàn ứng",
};
function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t.replace(/_/g, " ");
}

// Loại thông báo mang tính "quá hạn/sắp hết hạn/chờ quyết định quá lâu" — dùng cho tab
// "Quá hạn". Không gộp material_over/cost_over/norm_over/env_monitoring_over (vượt định
// mức/ngưỡng, không phải trễ thời gian) và comment (không phải cảnh báo trễ).
// LƯU Ý: hệ thống hiện chưa có loại thông báo riêng cho "nghiệm thu"/"được giao việc" (mọi
// thông báo đã lọc theo user_id nhưng không đánh dấu "được giao" so với "liên quan chung") —
// nên chỉ có 3 tab (Tất cả/Chưa đọc/Quá hạn), không bịa thêm loại DB không tồn tại.
const OVERDUE_TYPES = new Set([
  "delayed",
  "due_soon",
  "stalled",
  "contract_expiry",
  "cert_over_contract",
  "insurance_expiry",
  "legal_expiry",
  "cert_expiry",
  "monitoring_alarm",
  "cert_pending",
  "correspondence_due",
  "vo_pending",
  "proposal_pending",
  "design_change_pending",
  "claim_pending",
  "ncr_overdue",
  "punch_overdue",
  "po_late",
  "vehicle_late",
  "diary_missing",
  "stage_missing",
  "calibration_due",
  "hse_action_due",
  "action_overdue",
  "env_permit_expiry",
  "warranty_expiry",
  "warranty_claim_overdue",
  "advance_overdue",
]);

type Tab = "all" | "unread" | "overdue";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unread", label: "Chưa đọc" },
  { key: "overdue", label: "Quá hạn" },
];

// Bucket thời gian hiển thị "Hôm nay / Hôm qua / Cũ hơn" — so theo giờ VN (+7h), cùng cơ
// chế với todayISO/daysFromTodayISO (tránh lệch ranh giới ngày 0h-7h sáng nếu tự parse).
type DayBucket = "today" | "yesterday" | "older";
const BUCKET_LABEL: Record<DayBucket, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  older: "Cũ hơn",
};
function dayBucket(createdAt: string): DayBucket {
  const day = new Date(new Date(createdAt).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  if (day === todayISO()) return "today";
  if (day === daysFromTodayISO(-1)) return "yesterday";
  return "older";
}

// Đường dẫn click-through tới task liên quan (nếu có) — cùng pattern GlobalSearch:
// `/tracking/<slug>?floor=<floorLabel>`. null khi thông báo không gắn task hoặc chưa
// suy ra được sheet (vd task đã bị xoá).
function notifUrl(n: Notif): string | null {
  if (!n.taskId || !n.sheetSlug) return null;
  return `/tracking/${n.sheetSlug}${n.floorLabel ? `?floor=${encodeURIComponent(n.floorLabel)}` : ""}`;
}

// Gộp các thông báo cùng `type` xuất hiện liên tiếp (≥3) thành 1 dòng bung/thu gọn được.
type Row = { kind: "item"; notif: Notif } | { kind: "group"; type: string; notifs: Notif[] };
function buildRows(list: Notif[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i + 1;
    while (j < list.length && list[j].type === list[i].type) j++;
    const run = list.slice(i, j);
    if (run.length >= 3) rows.push({ kind: "group", type: run[0].type, notifs: run });
    else for (const n of run) rows.push({ kind: "item", notif: n });
    i = j;
  }
  return rows;
}

// VAPID public key (base64url) → Uint8Array cho pushManager.subscribe.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type PushState = "unavailable" | "off" | "on" | "denied" | "busy";

export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [push, setPush] = useState<PushState>("unavailable");
  const keyRef = useRef<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Kiểm tra khả năng Web Push: cần SW đã đăng ký (production) + VAPID key trên server.
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return; // dev hoặc SW chưa sẵn sàng
      const r = await fetch("/api/push/subscribe").catch(() => null);
      const key = r?.ok ? (await r.json()).key : null;
      if (!key) return; // server chưa cấu hình VAPID
      keyRef.current = key;
      if (Notification.permission === "denied") {
        setPush("denied");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })();
  }, []);

  async function togglePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !keyRef.current) return;
    setPush("busy");
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPush("off");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        setPush("denied");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRef.current) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        setPush("off");
        return;
      }
      setPush("on");
    } catch {
      setPush("off");
    }
  }

  async function load() {
    const r = await fetch("/api/notifications").catch(() => null);
    if (!r?.ok) return;
    const j = await r.json();
    setItems(j.notifications ?? []);
    setUnread(j.unread ?? 0);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    load();
  }

  // Click-through: đánh dấu đã đọc rồi điều hướng tới task liên quan (nếu dựng được URL);
  // không có URL (không gắn task, hoặc thông báo không phải loại có task) thì chỉ đánh dấu đọc.
  async function onItemClick(n: Notif) {
    const url = notifUrl(n);
    if (!n.isRead)
      await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    if (url) {
      setOpen(false);
      router.push(url);
    } else {
      load();
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Lọc theo tab đang chọn — badge chưa đọc (unread) luôn tính trên toàn bộ items, không
  // phụ thuộc tab (theo mục 3 đặc tả, xác nhận `unread` API trả không đổi khi thêm tab).
  const tabItems = useMemo(() => {
    if (tab === "unread") return items.filter((n) => !n.isRead);
    if (tab === "overdue") return items.filter((n) => OVERDUE_TYPES.has(n.type));
    return items;
  }, [items, tab]);

  const visibleItems = tabItems.slice(0, DROPDOWN_LIMIT);

  // Nhóm theo Hôm nay/Hôm qua/Cũ hơn, mỗi nhóm gộp thêm các run ≥3 thông báo cùng loại.
  const buckets = useMemo(() => {
    const grouped: Record<DayBucket, Notif[]> = { today: [], yesterday: [], older: [] };
    for (const n of visibleItems) grouped[dayBucket(n.createdAt)].push(n);
    return (["today", "yesterday", "older"] as DayBucket[])
      .map((b) => ({ bucket: b, rows: buildRows(grouped[b]) }))
      .filter((g) => g.rows.length > 0);
  }, [visibleItems]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Thông báo"
        aria-label="Thông báo"
        className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-on-accent text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
            <span className="text-sm font-semibold">
              Thông báo {unread > 0 && <span className="text-red-400">({unread} mới)</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Đọc tất cả
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 overflow-x-auto scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  tab === t.key
                    ? "bg-emerald-600/20 text-emerald-400"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-auto">
            {visibleItems.length === 0 && (
              <p className="p-6 text-center text-sm text-zinc-500">Không có thông báo</p>
            )}
            {buckets.map(({ bucket, rows }) => (
              <div key={bucket}>
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {BUCKET_LABEL[bucket]}
                </p>
                {rows.map((row) => {
                  if (row.kind === "item") {
                    const n = row.notif;
                    const sev = notifSeverity(n.type);
                    const SevIcon = SEVERITY_ICON[sev];
                    return (
                      <button
                        key={n.id}
                        onClick={() => onItemClick(n)}
                        className={`w-full text-left px-4 py-2.5 border-b border-zinc-800/60 text-sm transition ${n.isRead ? "text-zinc-500" : `text-zinc-200 ${SEVERITY_BG[sev]} hover:bg-zinc-800/60`}`}
                      >
                        <span className="flex items-start gap-1.5">
                          <SevIcon
                            className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${n.isRead ? "text-zinc-600" : SEVERITY_ICON_CLS[sev]}`}
                          />
                          <span className="block">{n.message}</span>
                        </span>
                        <span className="text-xs text-zinc-600 pl-5">
                          {formatDateTimeVN(n.createdAt)}
                        </span>
                      </button>
                    );
                  }
                  const key = `${bucket}-${row.type}-${row.notifs[0].id}`;
                  const expanded = expandedGroups.has(key);
                  return (
                    <div key={key} className="border-b border-zinc-800/60">
                      <button
                        onClick={() => toggleGroup(key)}
                        className="w-full flex items-center gap-1.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800/60 transition"
                      >
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {row.notifs.length} thông báo {typeLabel(row.type)}
                        </span>
                      </button>
                      {expanded &&
                        row.notifs.map((n) => {
                          const sev = notifSeverity(n.type);
                          const SevIcon = SEVERITY_ICON[sev];
                          return (
                            <button
                              key={n.id}
                              onClick={() => onItemClick(n)}
                              className={`w-full text-left pl-9 pr-4 py-2 border-t border-zinc-800/40 text-sm transition ${n.isRead ? "text-zinc-500" : `text-zinc-200 ${SEVERITY_BG[sev]} hover:bg-zinc-800/60`}`}
                            >
                              <span className="flex items-start gap-1.5">
                                <SevIcon
                                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${n.isRead ? "text-zinc-600" : SEVERITY_ICON_CLS[sev]}`}
                                />
                                <span className="block">{n.message}</span>
                              </span>
                              <span className="text-xs text-zinc-600 pl-5">
                                {formatDateTimeVN(n.createdAt)}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-zinc-800 text-center">
            <a
              href="/notifications/all"
              onClick={() => setOpen(false)}
              className="text-xs text-emerald-400 hover:underline"
            >
              Xem tất cả thông báo
            </a>
          </div>
          {push !== "unavailable" && (
            <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-950/50">
              {push === "denied" ? (
                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <BellOff className="w-3.5 h-3.5" /> Thông báo đẩy bị chặn — bật lại trong cài đặt
                  trình duyệt
                </p>
              ) : (
                <button
                  onClick={togglePush}
                  disabled={push === "busy"}
                  className={`flex items-center gap-1.5 text-xs transition ${push === "on" ? "text-emerald-400 hover:text-zinc-400" : "text-zinc-400 hover:text-emerald-400"}`}
                >
                  {push === "on" ? (
                    <>
                      <BellRing className="w-3.5 h-3.5" /> Đang nhận thông báo đẩy trên thiết bị này
                      — bấm để tắt
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" />{" "}
                      {push === "busy" ? "Đang xử lý..." : "Bật thông báo đẩy trên thiết bị này"}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
