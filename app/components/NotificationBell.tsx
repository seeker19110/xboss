'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';

type Notif = { id: number; taskId: number | null; type: string; message: string; isRead: number; createdAt: string };

const POLL_MS = 30_000;

export default function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await fetch('/api/notifications').catch(() => null);
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
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function markRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    load();
  }
  async function markAll() {
    await fetch('/api/notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    load();
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Thông báo"
        className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
            <span className="text-sm font-semibold">Thông báo {unread > 0 && <span className="text-red-400">({unread} mới)</span>}</span>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-emerald-400 hover:underline">
                <CheckCheck className="w-3.5 h-3.5" /> Đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 && (
              <p className="p-6 text-center text-sm text-zinc-500">Không có thông báo</p>
            )}
            {items.map(n => (
              <button key={n.id} onClick={() => !n.isRead && markRead(n.id)}
                className={`w-full text-left px-4 py-2.5 border-b border-zinc-800/60 text-sm transition ${n.isRead ? 'text-zinc-500' : 'text-zinc-200 bg-red-950/20 hover:bg-zinc-800/60'}`}>
                <span className="block">{n.message}</span>
                <span className="text-[11px] text-zinc-600">{new Date(n.createdAt).toLocaleString('vi-VN')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
