'use client';
// Hàng đợi offline cho thao tác tick checkbox: mất mạng → lưu localStorage,
// có mạng lại → tự gửi PATCH theo thứ tự. Mỗi dimension chỉ giữ thao tác mới nhất.
import { useCallback, useEffect, useRef, useState } from 'react';

type QueuedTick = { dimId: number; installed: boolean; queuedAt: number };
const KEY = 'xboss-offline-ticks';

function readQueue(): QueuedTick[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function writeQueue(q: QueuedTick[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function useOfflineTickQueue(onFlushed?: () => void) {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const q = readQueue();
    if (!q.length) return;
    flushing.current = true;
    const remain: QueuedTick[] = [];
    for (const t of q) {
      try {
        const res = await fetch(`/api/dimensions/${t.dimId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installed: t.installed }),
        });
        // 5xx → giữ lại thử sau; 4xx (mất quyền/dimension bị xoá) → bỏ, không kẹt hàng đợi.
        if (!res.ok && res.status >= 500) remain.push(t);
      } catch { remain.push(t); } // vẫn chưa có mạng
    }
    writeQueue(remain);
    setPending(remain.length);
    flushing.current = false;
    if (remain.length === 0 && q.length > 0) onFlushed?.();
  }, [onFlushed]);

  const enqueue = useCallback((dimId: number, installed: boolean) => {
    const q = readQueue().filter(t => t.dimId !== dimId);
    q.push({ dimId, installed, queuedAt: Date.now() });
    writeQueue(q);
    setPending(q.length);
  }, []);

  useEffect(() => {
    setPending(readQueue().length);
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Phòng trường hợp sự kiện 'online' không bắn (một số WebView) — thử gửi định kỳ.
    const t = setInterval(() => { if (navigator.onLine) flush(); }, 30_000);
    flush();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [flush]);

  return { pending, online, enqueue };
}
