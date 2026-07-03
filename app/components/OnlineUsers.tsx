"use client";
import { useEffect, useRef, useState } from "react";
import { Wifi } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";

type PresenceEntry = { userId: number; name: string; role: string; lastSeen: number };

const ROLE_LABEL: Record<string, string> = ROLE_LABELS;
const HEARTBEAT_MS = 60_000; // gửi heartbeat mỗi 60s
const POLL_MS = 30_000; // tải lại danh sách admin mỗi 30s

export default function OnlineUsers({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<PresenceEntry[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Heartbeat — mọi user đều gửi
  useEffect(() => {
    const send = () => fetch("/api/presence", { method: "POST" }).catch(() => {});
    send();
    const id = setInterval(send, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  // Poll danh sách — chỉ admin
  useEffect(() => {
    if (!isAdmin) return;
    const load = () =>
      fetch("/api/presence")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j?.users) setUsers(j.users);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [isAdmin]);

  // Đóng popover khi click ngoài
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isAdmin) return null;

  const count = users.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`${count} người đang online`}
        aria-label={`${count} người đang online`}
        className="relative flex items-center gap-1.5 text-zinc-400 hover:text-emerald-400 transition-colors"
      >
        <Wifi className="w-5 h-5" />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-2 min-w-[1.1rem] h-[1.1rem] px-0.5 flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white leading-none tabular-nums"
            aria-hidden
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-zinc-100">Đang online ({count})</p>
            <p className="text-xs text-zinc-500 mt-0.5">Cập nhật mỗi 30 giây</p>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-zinc-800">
            {count === 0 ? (
              <li className="px-4 py-4 text-sm text-zinc-500 text-center">Chưa có ai online</li>
            ) : (
              users.map((u) => (
                <li key={u.userId} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100 truncate">{u.name}</p>
                    <p className="text-xs text-zinc-500">{ROLE_LABEL[u.role] ?? u.role}</p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0" title="Lần hoạt động cuối">
                    {formatAgo(u.lastSeen)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "vừa xong";
  return `${Math.floor(secs / 60)} ph`;
}
