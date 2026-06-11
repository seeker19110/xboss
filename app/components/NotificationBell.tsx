'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, BellRing, BellOff } from 'lucide-react';

type Notif = { id: number; taskId: number | null; type: string; message: string; isRead: number; createdAt: string };

const POLL_MS = 30_000;

// VAPID public key (base64url) → Uint8Array cho pushManager.subscribe.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

type PushState = 'unavailable' | 'off' | 'on' | 'denied' | 'busy';

export default function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushState>('unavailable');
  const keyRef = useRef<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Kiểm tra khả năng Web Push: cần SW đã đăng ký (production) + VAPID key trên server.
  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return; // dev hoặc SW chưa sẵn sàng
      const r = await fetch('/api/push/subscribe').catch(() => null);
      const key = r?.ok ? (await r.json()).key : null;
      if (!key) return; // server chưa cấu hình VAPID
      keyRef.current = key;
      if (Notification.permission === 'denied') { setPush('denied'); return; }
      const sub = await reg.pushManager.getSubscription();
      setPush(sub ? 'on' : 'off');
    })();
  }, []);

  async function togglePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !keyRef.current) return;
    setPush('busy');
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPush('off');
        return;
      }
      if ((await Notification.requestPermission()) !== 'granted') { setPush('denied'); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRef.current) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) { await sub.unsubscribe(); setPush('off'); return; }
      setPush('on');
    } catch { setPush('off'); }
  }

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
          {push !== 'unavailable' && (
            <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-950/50">
              {push === 'denied' ? (
                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <BellOff className="w-3.5 h-3.5" /> Thông báo đẩy bị chặn — bật lại trong cài đặt trình duyệt
                </p>
              ) : (
                <button onClick={togglePush} disabled={push === 'busy'}
                  className={`flex items-center gap-1.5 text-xs transition ${push === 'on' ? 'text-emerald-400 hover:text-zinc-400' : 'text-zinc-400 hover:text-emerald-400'}`}>
                  {push === 'on'
                    ? <><BellRing className="w-3.5 h-3.5" /> Đang nhận thông báo đẩy trên thiết bị này — bấm để tắt</>
                    : <><Bell className="w-3.5 h-3.5" /> {push === 'busy' ? 'Đang xử lý...' : 'Bật thông báo đẩy trên thiết bị này'}</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
