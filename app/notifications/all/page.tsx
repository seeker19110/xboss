"use client";
// Trang danh sách đầy đủ thông báo (M40 — trung tâm thông báo, dropdown giới hạn 10 item).
// LƯU Ý ĐẶT TÊN: route `/notifications` đã có sẵn từ trước (trang feed hoạt động
// trễ/đến hạn/vật tư + cài đặt loại thông báo, xem `app/notifications/page.tsx`), nên trang
// liệt kê đầy đủ bảng `notifications` (dữ liệu chuông thông báo) đặt tại `/notifications/all`
// để tránh đè lên trang đã có — cần phiên chính xác nhận lại cách đặt tên/khả năng gộp 2
// trang này trong đợt tích hợp (xem báo cáo cuối phiên coder).
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Search } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import { formatDateTimeVN } from "@/lib/date";

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

const PAGE_SIZE = 20;

function notifUrl(n: Notif): string | null {
  if (!n.taskId || !n.sheetSlug) return null;
  return `/tracking/${n.sheetSlug}${n.floorLabel ? `?floor=${encodeURIComponent(n.floorLabel)}` : ""}`;
}

export default function AllNotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const r = await fetch("/api/notifications").catch(() => null);
    if (r?.status === 401) {
      redirectToLogin();
      return;
    }
    if (r?.ok) {
      const j = await r.json();
      setItems(j.notifications ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const types = useMemo(() => Array.from(new Set(items.map((n) => n.type))).sort(), [items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((n) => {
      if (term && !n.message.toLowerCase().includes(term)) return false;
      if (typeFilter && n.type !== typeFilter) return false;
      if (readFilter === "unread" && n.isRead) return false;
      if (readFilter === "read" && !n.isRead) return false;
      const day = n.createdAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [items, q, typeFilter, readFilter, from, to]);

  // Đổi filter → về trang 1 để tránh trang rỗng khi kết quả lọc ít hơn trang hiện tại.
  useEffect(() => {
    setPage(1);
  }, [q, typeFilter, readFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = paged.every((n) => next.has(n.id));
      for (const n of paged) {
        if (allSelected) next.delete(n.id);
        else next.add(n.id);
      }
      return next;
    });
  }

  async function markSelectedRead() {
    if (selected.size === 0) return;
    setBusy(true);
    await Promise.all(
      [...selected].map((id) => fetch(`/api/notifications/${id}/read`, { method: "PATCH" })),
    );
    setSelected(new Set());
    setBusy(false);
    await load();
  }

  async function onItemClick(n: Notif) {
    if (!n.isRead)
      await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    const url = notifUrl(n);
    if (url) window.location.href = url;
    else load();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Tất cả thông báo" back />

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm trong nội dung thông báo..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-emerald-600 h-10"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm h-10"
          >
            <option value="">Mọi loại</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as "all" | "unread" | "read")}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm h-10"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="unread">Chưa đọc</option>
            <option value="read">Đã đọc</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm h-10"
            aria-label="Từ ngày"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm h-10"
            aria-label="Đến ngày"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={paged.length > 0 && paged.every((n) => selected.has(n.id))}
              onChange={toggleSelectAllOnPage}
              className="w-4 h-4"
            />
            Chọn cả trang ({filtered.length} kết quả)
          </label>
          <button
            onClick={markSelectedRead}
            disabled={selected.size === 0 || busy}
            className="flex items-center gap-1.5 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg px-3 py-2 transition disabled:opacity-40"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Đánh dấu đã đọc ({selected.size})
          </button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {paged.length === 0 && (
            <p className="p-6 text-center text-sm text-zinc-500">Không có thông báo phù hợp</p>
          )}
          {paged.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0 ${n.isRead ? "text-zinc-500" : "text-zinc-200 bg-red-950/10"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(n.id)}
                onChange={() => toggleSelect(n.id)}
                className="w-4 h-4 mt-1 shrink-0"
              />
              <button onClick={() => onItemClick(n)} className="flex-1 text-left text-sm">
                <span className="block">{n.message}</span>
                <span className="text-xs text-zinc-600">
                  {formatDateTimeVN(n.createdAt)} · {n.type}
                </span>
              </button>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 disabled:opacity-40"
            >
              Trước
            </button>
            <span className="text-zinc-400">
              Trang {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
